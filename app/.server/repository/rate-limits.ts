import { CronExpressionParser } from "cron-parser";
import cron from "node-cron";
import { db } from "./db";
import type { AuthUser } from "../auth";
import { generateResourceId, isUuid, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";

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
type RateLimitRow = Awaited<
  ReturnType<typeof db.orm.aibot.RateLimit.all>
>[number];

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
      ? (
          usage[field as "inputDetails" | "outputDetails"] as Record<
            string,
            unknown
          > | null
        )?.[detail]
      : usage[field as "inputTokens" | "outputTokens"];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resetBoundary(resetOnCron: string, timezone: string, now: Date) {
  return CronExpressionParser.parse(resetOnCron, {
    currentDate: new Date(Math.floor(now.getTime() / 1_000) * 1_000 + 1),
    tz: timezone,
  })
    .prev()
    .toDate();
}

async function getUsageForLimit(
  limit: RateLimitRow,
  chatbotId: string,
  agentId: string,
  providerId: string,
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
  const resetAt = resetBoundary(
    limit.resetOnCron,
    limit.timezone,
    now,
  ).getTime();
  const coefficients = limit.coefficient;
  if (
    !coefficients ||
    typeof coefficients !== "object" ||
    Array.isArray(coefficients)
  )
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
  organizationId: string,
  chatbotId: string,
  agentId: string,
  providerId: string,
  threadId: string,
) {
  const limits = await db.orm.aibot.RateLimit.where({ organizationId }).all();
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

export async function listRateLimits(user: AuthUser, ids: string[]) {
  const [limits, bots, agents, providers] = await Promise.all([
    filterResourcesByRole(user, await db.orm.aibot.RateLimit.where({ organizationId: user.organizationId }).where((limit) => limit.id.in(ids)).all()),
    filterResourcesByRole(user, await db.orm.aibot.ChatBot.where({ organizationId: user.organizationId }).all()),
    filterResourcesByRole(user, await db.orm.aibot.AgentDefinition.where({ organizationId: user.organizationId }).all()),
    filterResourcesByRole(user, await db.orm.aibot.Provider.where({ organizationId: user.organizationId }).all()),
  ]);
  const criteriaOptions = [
    { value: "bot", label: "server.bot" },
    { value: "agent", label: "server.agent" },
    { value: "provider", label: "server.provider" },
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
    bot: new Map(
      dependentOptions.bot.map(({ value, label }) => [value, label]),
    ),
    agent: new Map(
      dependentOptions.agent.map(({ value, label }) => [value, label]),
    ),
    provider: new Map(
      dependentOptions.provider.map(({ value, label }) => [value, label]),
    ),
  };
  const records = limits.map((limit) => {
      const coefficients =
        limit.coefficient && typeof limit.coefficient === "object"
          ? JSON.stringify(limit.coefficient)
          : "{}";
      const criteriaId = String(limit.criteriaId ?? "");
      return record(limit.id, "", {
        name: limit.name,
        criteria: limit.criteria,
        criteriaId,
        criteriaLabel: criteriaLabels.get(limit.criteria) ?? limit.criteria,
        targetLabel:
          targetLabels[limit.criteria]?.get(criteriaId) ??
          "server.targetNotFound",
        perThread: String(limit.perThread),
        perThreadLabel: limit.perThread ? "server.perThread" : "server.acrossAllThreads",
        coefficients,
        limit: Number(limit.limit),
        resetOnCron: limit.resetOnCron,
        timezone: limit.timezone,
        limitExceededMessage: limit.limitExceededMessage,
      });
    });
  return {
    records: await includeResourcePermissions(user, records),
    criteriaOptions,
    dependentOptions,
  };
}

export async function saveRateLimit(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const criteriaValue = String(values.get("criteria") ?? "");
  const criteriaId = String(values.get("criteriaId") ?? "");
  const criteria = isRateLimitCriteria(criteriaValue) ? criteriaValue : null;
  const perThreadValue = String(values.get("perThread") ?? "");
  const perThread = perThreadValue === "true";
  const limitValue = Number(values.get("limit"));
  const resetOnCron = String(values.get("resetOnCron") ?? "").trim();
  const timezone = String(values.get("timezone") ?? "").trim();
  const limitExceededMessage = String(
    values.get("limitExceededMessage") ?? "",
  ).trim();
  const coefficients = parseCoefficients(
    String(values.get("coefficients") ?? ""),
  );

  if (!name) return { error: "server.rateLimitNameRequired" };
  if (!criteria || !isUuid(criteriaId))
    return { error: "server.targetTypeAndTargetRequired" };
  if (perThreadValue !== "true" && perThreadValue !== "false")
    return { error: "server.threadAggregationMethodRequired" };
  if (!Number.isFinite(limitValue) || limitValue <= 0)
    return { error: "server.limitMustBePositive" };
  if (!coefficients)
    return {
      error: "server.usageWeightsRequired",
    };
  if (!resetOnCron || !cron.validate(resetOnCron))
    return { error: "server.invalidResetCron" };
  if (!timezone || !isValidTimezone(timezone))
    return { error: "server.validTimezoneRequired" };
  if (!limitExceededMessage)
    return { error: "server.limitExceededMessageRequired" };

  if (id !== null) {
    const existing = await db.orm.aibot.RateLimit.first({
      id,
      organizationId: user.organizationId,
    });
    if (!existing || !(await hasResourceAccess(user, id, "update"))) return { error: "server.rateLimitNotFound" };
  }
  if (criteria === "bot") {
    if (
      !(await db.orm.aibot.ChatBot.first({
        id: criteriaId,
        organizationId: user.organizationId,
      })) || !(await hasResourceAccess(user, criteriaId, "read"))
    )
      return { error: "server.selectedBotNotFound" };
  } else if (criteria === "agent") {
    if (
      !(await db.orm.aibot.AgentDefinition.first({
        id: criteriaId,
        organizationId: user.organizationId,
      })) || !(await hasResourceAccess(user, criteriaId, "read"))
    )
      return { error: "server.selectedAgentNotFound" };
  } else {
    if (
      !(await db.orm.aibot.Provider.first({
        id: criteriaId,
        organizationId: user.organizationId,
      })) || !(await hasResourceAccess(user, criteriaId, "read"))
    )
      return { error: "server.selectedProviderNotFound" };
  }

  const existingLimits = await db.orm.aibot.RateLimit.where({
    organizationId: user.organizationId,
  }).all();
  if (existingLimits.some((existing) => existing.id !== id && existing.name === name))
    return { error: "server.duplicateRateLimitName" };
  if (
    existingLimits.some(
      (existing) =>
        existing.id !== id &&
        existing.criteria === criteria &&
        existing.criteriaId === criteriaId,
    )
  )
    return { error: "server.duplicateRateLimitTarget" };

  const saved = {
    name,
    criteria,
    criteriaId,
    perThread,
    coefficient: jsonb(coefficients),
    limit: String(limitValue),
    limitExceededMessage,
    resetOnCron,
    timezone,
    organizationId: user.organizationId,
  };
  if (id === null) {
    const created = await db.transaction(async (tx) => {
      const id = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id, organizationId: user.organizationId });
      const resource = await tx.orm.aibot.RateLimit.create({
        id,
        ...saved,
      });
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: id,
        role: "manager",
        grantedById: user.id,
      });
      return resource;
    });
    logAuditEvent("rate_limit.created", "rate_limit", created.id, user.id);
  } else {
    await db.orm.aibot.RateLimit.where({ id, organizationId: user.organizationId }).update(saved);
    logAuditEvent("rate_limit.updated", "rate_limit", id, user.id);
  }
  return { ok: true };
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function deleteRateLimit(user: AuthUser, id: string) {
  const existing = await db.orm.aibot.RateLimit.first({
    id,
    organizationId: user.organizationId,
  });
  if (!existing || !(await hasResourceAccess(user, id, "delete"))) return false;
  await db.orm.aibot.ResourceBase.where({ id }).delete();
  logAuditEvent("rate_limit.deleted", "rate_limit", id, user.id);
  return true;
}
