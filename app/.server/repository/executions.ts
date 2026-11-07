import { db } from "./db";
import type { AuthUser } from "../auth";
import { filterResourcesByRole } from "../authorization";
import { appLogger } from "../logger/app-logger";

export type ExecutionSource = "direct_message" | "mention" | "schedule";
export type ExecutionStatus = "running" | "succeeded" | "failed" | "skipped";
export type ExecutionErrorCode =
  | "configuration_error"
  | "processing_error"
  | "delivery_error"
  | "adapter_error"
  | "rate_limited"
  | "bot_disabled"
  | "empty_response";

const errorSummaries: Record<ExecutionErrorCode, string> = {
  configuration_error: "Bot or agent configuration is unavailable.",
  processing_error: "Model or tool processing failed.",
  delivery_error: "The response could not be delivered.",
  adapter_error: "The chat adapter could not be initialized.",
  rate_limited: "The configured rate limit was reached.",
  bot_disabled: "The chatbot was disabled at the scheduled time.",
  empty_response: "The model returned no response.",
};

export type ExecutionOutcome = {
  status: Exclude<ExecutionStatus, "running">;
  errorCode?: ExecutionErrorCode;
  usageId?: number | null;
};

export async function beginExecution(input: {
  organizationId: string;
  chatbotId: string;
  agentId?: string | null;
  adapterId: string;
  scheduleId?: string | null;
  source: ExecutionSource;
  threadId: string;
}) {
  try {
    const execution = await db.orm.aibot.BotExecution.create({
      organizationId: input.organizationId,
      chatbotId: input.chatbotId,
      agentId: input.agentId ?? null,
      adapterId: input.adapterId,
      scheduleId: input.scheduleId ?? null,
      source: input.source,
      status: "running",
      threadId: input.threadId,
    });
    return execution.id;
  } catch (error) {
    appLogger.error(`Failed to record ${input.source} execution start for chatbot ${input.chatbotId}`, error);
    return null;
  }
}

export async function finishExecution(id: string | null, outcome: ExecutionOutcome) {
  if (!id) return;
  try {
    await db.orm.aibot.BotExecution.where({ id }).update({
      status: outcome.status,
      finishedAt: new Date().toISOString(),
      errorCode: outcome.errorCode ?? null,
      errorSummary: outcome.errorCode ? errorSummaries[outcome.errorCode] : null,
      usageId: outcome.usageId ?? null,
    });
  } catch (error) {
    appLogger.error(`Failed to record completion for execution ${id}`, error);
  }
}

async function visibleBots(user: AuthUser) {
  return filterResourcesByRole(
    user,
    await db.orm.aibot.ChatBot.where({ organizationId: user.organizationId })
      .select("id", "name", "organizationId")
      .all(),
  );
}

export async function listExecutionHistory(
  user: AuthUser,
  filters: { botId?: string; status?: ExecutionStatus; days: number; page: number },
) {
  const [bots, schedules] = await Promise.all([
    visibleBots(user),
    db.orm.aibot.ChatBotSchedule.where({ organizationId: user.organizationId })
      .select("id", "name", "organizationId")
      .all()
      .then((rows) => filterResourcesByRole(user, rows)),
  ]);
  const botIds = bots.map((bot) => bot.id);
  const scheduleNames = new Map(schedules.map((schedule) => [schedule.id, schedule.name]));
  if (filters.botId && !botIds.includes(filters.botId))
    throw new Response("Forbidden", { status: 403 });

  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000).toISOString();
  const pageSize = 25;
  const empty = { records: [], bots: bots.map(({ id, name }) => ({ id, name })), hasNext: false };
  if (!user.isAdmin && botIds.length === 0) return empty;

  let query = db.orm.aibot.BotExecution
    .where({ organizationId: user.organizationId })
    .where((row) => row.startedAt.gte(since));
  if (!user.isAdmin) query = query.where((row) => row.chatbotId.in(botIds));
  if (filters.botId) query = query.where({ chatbotId: filters.botId });
  if (filters.status) query = query.where({ status: filters.status });
  const rows = await query
    .orderBy([(row) => row.startedAt.desc(), (row) => row.id.desc()])
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize)
    .all();
  const botNames = new Map(bots.map((bot) => [bot.id, bot.name]));
  const staleBefore = Date.now() - 15 * 60 * 1_000;
  return {
    records: rows.slice(0, pageSize).map((row) => ({
      id: row.id,
      chatbotId: row.chatbotId,
      botName: row.chatbotId ? botNames.get(row.chatbotId) ?? null : null,
      source: row.source,
      status: row.status,
      stale: row.status === "running" && new Date(row.startedAt).getTime() < staleBefore,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      errorCode: row.errorCode,
      usageId: row.usageId,
      scheduleName: row.scheduleId && (user.isAdmin || scheduleNames.has(row.scheduleId))
        ? scheduleNames.get(row.scheduleId) ?? row.scheduleId
        : null,
      threadId: row.scheduleId && (user.isAdmin || scheduleNames.has(row.scheduleId))
        ? row.threadId
        : null,
    })),
    bots: empty.bots,
    hasNext: rows.length > pageSize,
  };
}

export async function recentExecutionFailures(
  user: AuthUser,
  bots: Array<{ id: string; name: string }>,
) {
  const botIds = bots.map((bot) => bot.id);
  if (!user.isAdmin && botIds.length === 0) return { count: 0, records: [] };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  let query = db.orm.aibot.BotExecution
    .where({ organizationId: user.organizationId, status: "failed" })
    .where((row) => row.startedAt.gte(since));
  if (!user.isAdmin) query = query.where((row) => row.chatbotId.in(botIds));
  const [totals, rows] = await Promise.all([
    query.aggregate((aggregate) => ({ count: aggregate.count() })),
    query.orderBy((row) => row.startedAt.desc()).limit(5).all(),
  ]);
  const botNames = new Map(bots.map((bot) => [bot.id, bot.name]));
  return {
    count: totals.count,
    records: rows.map((row) => ({
      id: row.id,
      botName: row.chatbotId ? botNames.get(row.chatbotId) ?? null : null,
      startedAt: row.startedAt,
      errorCode: row.errorCode,
    })),
  };
}
