import { CronExpressionParser } from "cron-parser";
import cron from "node-cron";
import { db } from "./db";
import type { AuthUser } from "../auth";
import { jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

type RateLimitCriteria = "bot" | "agent" | "provider";
type UsageMetric =
  | "inputTokens"
  | "outputTokens"
  | "inputDetails.noCacheTokens"
  | "inputDetails.cacheReadTokens"
  | "inputDetails.cacheWriteTokens"
  | "outputDetails.textTokens"
  | "outputDetails.reasoningTokens";
type UsageRow = Awaited<ReturnType<typeof db.orm.aibot.AgentUsage.all>>[number];
type RateLimitRow = Awaited<ReturnType<typeof db.orm.aibot.RateLimit.all>>[number];

const usageMetrics: UsageMetric[] = [
  "inputTokens",
  "outputTokens",
  "inputDetails.noCacheTokens",
  "inputDetails.cacheReadTokens",
  "inputDetails.cacheWriteTokens",
  "outputDetails.textTokens",
  "outputDetails.reasoningTokens",
];

function isUsageMetric(value: string): value is UsageMetric {
  return usageMetrics.includes(value as UsageMetric);
}

function parseCoefficients(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const entries = Object.entries(parsed);
  if (
    entries.length === 0 ||
    entries.some(
      ([key, coefficient]) =>
        !isUsageMetric(key) ||
        typeof coefficient !== "number" ||
        !Number.isFinite(coefficient) ||
        coefficient <= 0,
    )
  )
    return null;
  return Object.fromEntries(entries) as Partial<Record<UsageMetric, number>>;
}

function isRateLimitCriteria(value: string): value is RateLimitCriteria {
  return value === "bot" || value === "agent" || value === "provider";
}

function formatMetric(usage: UsageRow, metric: UsageMetric) {
  const [field, detail] = metric.split(".");
  const value =
    detail && field
      ? (usage[field as "inputDetails" | "outputDetails"] as Record<
          string,
          unknown
        > | null)?.[detail]
      : usage[field as "inputTokens" | "outputTokens"];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resetBoundary(resetOnCron: string, now: Date) {
  return CronExpressionParser.parse(resetOnCron, {
    currentDate: new Date(Math.floor(now.getTime() / 1_000) * 1_000 + 1),
    tz: "UTC",
  })
    .prev()
    .toDate();
}

async function getUsageForLimit(
  limit: RateLimitRow,
  chatbotId: number,
  agentId: number,
  providerId: number,
  threadId: string,
) {
  const threadFilter = limit.perThread ? { threadId } : {};
  switch (limit.criteria) {
    case "bot":
      return db.orm.aibot.AgentUsage.where({
        chatbotId: limit.criteriaId ?? chatbotId,
        ...threadFilter,
      }).all();
    case "agent":
      return db.orm.aibot.AgentUsage.where({
        agentId: limit.criteriaId ?? agentId,
        ...threadFilter,
      }).all();
    case "provider":
      return db.orm.aibot.AgentUsage.where({
        providerId: limit.criteriaId ?? providerId,
        ...threadFilter,
      }).all();
  }
}

function isExceeded(limit: RateLimitRow, rows: UsageRow[], now: Date) {
  const resetAt = resetBoundary(limit.resetOnCron, now).getTime();
  const coefficients = limit.coefficient;
  if (!coefficients || typeof coefficients !== "object" || Array.isArray(coefficients))
    throw new Error(`Invalid coefficient JSON for rate limit ${limit.id}`);

  const total = rows.reduce((sum, usage) => {
    if (new Date(usage.createdAt).getTime() < resetAt) return sum;
    return (
      sum +
      Object.entries(coefficients).reduce((weighted, [metric, coefficient]) => {
        if (
          !isUsageMetric(metric) ||
          typeof coefficient !== "number" ||
          !Number.isFinite(coefficient)
        )
          throw new Error(`Invalid coefficient for rate limit ${limit.id}`);
        return weighted + formatMetric(usage, metric) * coefficient;
      }, 0)
    );
  }, 0);
  return total >= Number(limit.limit);
}

export async function getExceededRateLimit(
  ownerId: number,
  chatbotId: number,
  agentId: number,
  providerId: number,
  threadId: string,
) {
  const limits = await db.orm.aibot.RateLimit.where({ ownerId }).all();
  const matches = limits.filter(
    (limit) =>
      (limit.criteria === "bot" && limit.criteriaId === chatbotId) ||
      (limit.criteria === "agent" && limit.criteriaId === agentId) ||
      (limit.criteria === "provider" && limit.criteriaId === providerId),
  );
  for (const limit of matches) {
    const usage = await getUsageForLimit(
      limit,
      chatbotId,
      agentId,
      providerId,
      threadId,
    );
    if (isExceeded(limit, usage, new Date())) return limit.limitExceededMessage;
  }
  return null;
}

export async function listRateLimits(user: AuthUser) {
  const [limits, bots, agents, providers] = await Promise.all([
    db.orm.aibot.RateLimit.where({ ownerId: user.id }).all(),
    db.orm.aibot.ChatBot.where({ ownerId: user.id }).all(),
    db.orm.aibot.AgentDefinition.where({ ownerId: user.id }).all(),
    db.orm.aibot.Provider.where({ ownerId: user.id }).all(),
  ]);
  const criteriaOptions = [
    { value: "bot", label: "ボット" },
    { value: "agent", label: "エージェント" },
    { value: "provider", label: "プロバイダー" },
  ];
  const dependentOptions = {
    bot: bots.map((bot) => ({ value: String(bot.id), label: bot.name })),
    agent: agents.map((agent) => ({
      value: String(agent.id),
      label: agent.name,
    })),
    provider: providers.map((provider) => ({
      value: String(provider.id),
      label: provider.name,
    })),
  };
  const criteriaLabels = new Map(
    criteriaOptions.map(({ value, label }) => [value, label]),
  );
  const targetLabels = {
    bot: new Map(dependentOptions.bot.map(({ value, label }) => [value, label])),
    agent: new Map(
      dependentOptions.agent.map(({ value, label }) => [value, label]),
    ),
    provider: new Map(
      dependentOptions.provider.map(({ value, label }) => [value, label]),
    ),
  };
  return {
    records: limits.map((limit) => {
      const coefficients =
        limit.coefficient && typeof limit.coefficient === "object"
          ? JSON.stringify(limit.coefficient)
          : "{}";
      const criteriaId = String(limit.criteriaId ?? "");
      return record(limit.id, "", {
        criteria: limit.criteria,
        criteriaId,
        criteriaLabel: criteriaLabels.get(limit.criteria) ?? limit.criteria,
        targetLabel:
          targetLabels[limit.criteria]?.get(criteriaId) ?? "対象が見つかりません",
        perThread: String(limit.perThread),
        perThreadLabel: limit.perThread ? "スレッドごと" : "全スレッド横断",
        coefficients,
        limit: Number(limit.limit),
        resetOnCron: limit.resetOnCron,
        limitExceededMessage: limit.limitExceededMessage,
      });
    }),
    criteriaOptions,
    dependentOptions,
  };
}

export async function saveRateLimit(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const criteriaValue = String(values.get("criteria") ?? "");
  const criteriaId = Number(values.get("criteriaId"));
  const criteria = isRateLimitCriteria(criteriaValue) ? criteriaValue : null;
  const perThreadValue = String(values.get("perThread") ?? "");
  const perThread = perThreadValue === "true";
  const limitValue = Number(values.get("limit"));
  const resetOnCron = String(values.get("resetOnCron") ?? "").trim();
  const limitExceededMessage = String(
    values.get("limitExceededMessage") ?? "",
  ).trim();
  const coefficients = parseCoefficients(
    String(values.get("coefficients") ?? ""),
  );

  if (!criteria || !Number.isSafeInteger(criteriaId) || criteriaId < 1)
    return { error: "対象種別と対象を選択してください。" };
  if (perThreadValue !== "true" && perThreadValue !== "false")
    return { error: "スレッドごとの集計方法を選択してください。" };
  if (!Number.isFinite(limitValue) || limitValue <= 0)
    return { error: "上限には0より大きい数値を入力してください。" };
  if (!coefficients)
    return {
      error:
        "係数には利用量の項目と0より大きい係数を1つ以上設定してください。",
    };
  if (!resetOnCron || !cron.validate(resetOnCron))
    return { error: "リセットCron式を正しく入力してください。" };
  if (!limitExceededMessage)
    return { error: "上限超過時のメッセージを入力してください。" };

  if (id !== null) {
    const existing = await db.orm.aibot.RateLimit.first({
      id,
      ownerId: user.id,
    });
    if (!existing) return { error: "レートリミットが見つかりません。" };
  }
  if (criteria === "bot") {
    if (
      !(await db.orm.aibot.ChatBot.first({
        id: criteriaId,
        ownerId: user.id,
      }))
    )
      return { error: "選択したボットが見つかりません。" };
  } else if (criteria === "agent") {
    if (
      !(await db.orm.aibot.AgentDefinition.first({
        id: criteriaId,
        ownerId: user.id,
      }))
    )
      return { error: "選択したエージェントが見つかりません。" };
  } else {
    if (
      !(await db.orm.aibot.Provider.first({
        id: criteriaId,
        ownerId: user.id,
      }))
    )
      return { error: "選択したプロバイダーが見つかりません。" };
  }

  const existingLimits = await db.orm.aibot.RateLimit.where({
    ownerId: user.id,
  }).all();
  if (
    existingLimits.some(
      (existing) =>
        existing.id !== id &&
        existing.criteria === criteria &&
        existing.criteriaId === criteriaId,
    )
  )
    return { error: "同じ対象のレートリミットが既にあります。" };

  const saved = {
    criteria,
    criteriaId,
    perThread,
    coefficient: jsonb(coefficients),
    limit: String(limitValue),
    limitExceededMessage,
    resetOnCron,
    ownerId: user.id,
  };
  if (id === null) {
    const created = await db.orm.aibot.RateLimit.create(saved);
    logAuditEvent("rate_limit.created", "rate_limit", created.id, user.id);
  } else {
    await db.orm.aibot.RateLimit.where({ id, ownerId: user.id }).update(saved);
    logAuditEvent("rate_limit.updated", "rate_limit", id, user.id);
  }
  return { ok: true };
}

export async function deleteRateLimit(user: AuthUser, id: number) {
  const existing = await db.orm.aibot.RateLimit.first({
    id,
    ownerId: user.id,
  });
  if (!existing) return false;
  await db.orm.aibot.RateLimit.where({ id, ownerId: user.id }).delete();
  logAuditEvent("rate_limit.deleted", "rate_limit", id, user.id);
  return true;
}
