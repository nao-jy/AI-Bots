import cron from "node-cron";
import { kysely } from "./kysely";
import type { AuthUser } from "../auth";
import { generateResourceId, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { localizedMessage } from "../../i18n";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";

export type ScheduleTargetInput = {
  chatbotAdapterId: number;
  threadId: string;
};

function parseTargets(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const targets: ScheduleTargetInput[] = [];
  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object" ||
      !("chatbotAdapterId" in item) ||
      !("threadId" in item) ||
      typeof item.chatbotAdapterId !== "number" ||
      !Number.isInteger(item.chatbotAdapterId) ||
      item.chatbotAdapterId < 1 ||
      typeof item.threadId !== "string" ||
      !item.threadId.trim()
    )
      return null;
    targets.push({
      chatbotAdapterId: item.chatbotAdapterId,
      threadId: item.threadId.trim(),
    });
  }
  return targets;
}

export async function listSchedules(user: AuthUser, ids: string[]) {
  const [scheduleRows, chatbotAdapters] = await Promise.all([
    kysely.selectFrom("aibot.ChatBotSchedule").selectAll()
      .where("organizationId", "=", user.organizationId).where("id", "in", ids)
      .orderBy("createdAt", "desc").execute(),
    kysely.selectFrom("aibot.ChatBotAdapter")
      .innerJoin("aibot.ChatBot", "aibot.ChatBot.id", "aibot.ChatBotAdapter.chatbotId")
      .innerJoin("aibot.ChatAdapter", "aibot.ChatAdapter.id", "aibot.ChatBotAdapter.adapterId")
      .select([
        "aibot.ChatBotAdapter.id", "aibot.ChatBotAdapter.chatbotId", "aibot.ChatBotAdapter.adapterId",
        "aibot.ChatBot.name as chatbotName", "aibot.ChatBot.organizationId as chatbotOrganizationId",
        "aibot.ChatBot.isEnabled", "aibot.ChatAdapter.name as adapterName",
        "aibot.ChatAdapter.organizationId as adapterOrganizationId",
      ]).execute(),
  ]);
  const schedules = await filterResourcesByRole(user, scheduleRows);
  const accessibleLinkIds = new Set(
    (
      await Promise.all(
        chatbotAdapters.map(async (link) => ({
          id: link.id,
          allowed:
            link.chatbotOrganizationId === user.organizationId &&
            link.adapterOrganizationId === user.organizationId &&
            (await hasResourceAccess(user, link.chatbotId, "read")) &&
            (await hasResourceAccess(user, link.adapterId, "read")),
        })),
      )
    )
      .filter(({ allowed }) => allowed)
      .map(({ id }) => id),
  );
  const scheduleIds = schedules.map(({ id }) => id);
  const [targets, targetLinks] = scheduleIds.length
    ? await Promise.all([
        kysely.selectFrom("aibot.ChatTarget").select(["id", "scheduleId", "chatbotAdapterId", "threadId"])
          .where("scheduleId", "in", scheduleIds).execute(),
        kysely.selectFrom("aibot.ChatTarget")
          .innerJoin("aibot.ChatBotAdapter", "aibot.ChatBotAdapter.id", "aibot.ChatTarget.chatbotAdapterId")
          .innerJoin("aibot.ChatBot", "aibot.ChatBot.id", "aibot.ChatBotAdapter.chatbotId")
          .innerJoin("aibot.ChatAdapter", "aibot.ChatAdapter.id", "aibot.ChatBotAdapter.adapterId")
          .select([
            "aibot.ChatTarget.id as targetId", "aibot.ChatBotAdapter.id as linkId",
            "aibot.ChatBot.name as chatbotName", "aibot.ChatBot.organizationId as chatbotOrganizationId",
            "aibot.ChatAdapter.name as adapterName", "aibot.ChatAdapter.organizationId as adapterOrganizationId",
          ]).where("aibot.ChatTarget.scheduleId", "in", scheduleIds).execute(),
      ])
    : [[], []];
  const targetLinksById = new Map(targetLinks.map((link) => [link.targetId, link]));
  return {
    records: await includeResourcePermissions(
      user,
      schedules.map((schedule) => {
        const scheduleTargets = targets.filter((target) => target.scheduleId === schedule.id);
        const targetRecords = scheduleTargets.flatMap((target) => {
          const link = targetLinksById.get(target.id);
          if (
            !link ||
            !accessibleLinkIds.has(link.linkId) ||
            link.chatbotOrganizationId !== user.organizationId ||
            link.adapterOrganizationId !== user.organizationId
          )
            return [];
          return [
            {
              chatbotAdapterId: link.linkId,
              threadId: target.threadId,
              label: `${link.chatbotName} / ${link.adapterName}`,
            },
          ];
        });
        return record(schedule.id, schedule.createdAt, {
          name: schedule.name,
          prompt: schedule.prompt,
          cronParam: schedule.cronParam,
          timezone: schedule.timezone,
          targets: targetRecords
            .map(({ label, threadId }) => `${label} / ${threadId}`)
            .join(", "),
          targetsJson: JSON.stringify(
            targetRecords.map(({ chatbotAdapterId, threadId }) => ({
              chatbotAdapterId,
              threadId,
            })),
          ),
        });
      }),
    ),
    targetOptions: chatbotAdapters
      .filter((link) => accessibleLinkIds.has(link.id))
      .map((link) => ({
        label: localizedMessage(
          link.isEnabled
            ? "server.scheduleTargetOptionActive"
            : "server.scheduleTargetOptionInactive",
          { 0: link.chatbotName, 1: link.adapterName },
        ),
        value: String(link.id),
      })),
  };
}

export async function getScheduleForExecution(id: string) {
  const schedule = await kysely.selectFrom("aibot.ChatBotSchedule").selectAll()
    .where("id", "=", id).executeTakeFirst();
  if (!schedule) return undefined;
  const chatTargets = await kysely.selectFrom("aibot.ChatTarget")
    .innerJoin("aibot.ChatBotAdapter", "aibot.ChatBotAdapter.id", "aibot.ChatTarget.chatbotAdapterId")
    .innerJoin("aibot.ChatBot", "aibot.ChatBot.id", "aibot.ChatBotAdapter.chatbotId")
    .innerJoin("aibot.ChatAdapter", "aibot.ChatAdapter.id", "aibot.ChatBotAdapter.adapterId")
    .select([
      "aibot.ChatTarget.id", "aibot.ChatTarget.organizationId", "aibot.ChatTarget.scheduleId",
      "aibot.ChatTarget.chatbotAdapterId", "aibot.ChatTarget.threadId",
      "aibot.ChatBotAdapter.chatbotId", "aibot.ChatBotAdapter.adapterId",
      "aibot.ChatBot.id as botId", "aibot.ChatBot.name as chatbotName",
      "aibot.ChatBot.organizationId as chatbotOrganizationId", "aibot.ChatBot.agentId",
      "aibot.ChatBot.isEnabled", "aibot.ChatAdapter.id as adapterResourceId",
      "aibot.ChatAdapter.platform", "aibot.ChatAdapter.config", "aibot.ChatAdapter.authId",
      "aibot.ChatAdapter.name as adapterName", "aibot.ChatAdapter.organizationId as adapterOrganizationId",
    ]).where("aibot.ChatTarget.scheduleId", "=", id).execute();
  return {
    ...schedule,
    chatTargets: chatTargets.map((target) => ({
      id: target.id, organizationId: target.organizationId, scheduleId: target.scheduleId,
      chatbotAdapterId: target.chatbotAdapterId, threadId: target.threadId,
      chatbotAdapter: {
        id: target.chatbotAdapterId, chatbotId: target.chatbotId, adapterId: target.adapterId,
        chatbot: {
          id: target.botId, name: target.chatbotName,
          organizationId: target.chatbotOrganizationId, agentId: target.agentId,
          isEnabled: target.isEnabled,
        },
        adapter: {
          id: target.adapterResourceId, name: target.adapterName,
          organizationId: target.adapterOrganizationId, platform: target.platform,
          config: target.config, authId: target.authId,
        },
      },
    })),
  };
}

export async function listSchedulePatterns() {
  return kysely.selectFrom("aibot.ChatBotSchedule").selectAll().execute();
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function saveSchedule(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const prompt = String(values.get("prompt") ?? "").trim();
  const cronParam = String(values.get("cronParam") ?? "").trim();
  const timezone = String(values.get("timezone") ?? "").trim();
  const targets = parseTargets(values.get("targets"));

  if (!name) return { error: "server.scheduleNameRequired" };
  if (!prompt) return { error: "server.schedulePromptRequired" };
  if (!cronParam || !cron.validate(cronParam))
    return { error: "server.invalidCronExpression" };
  if (!timezone || !isValidTimezone(timezone))
    return { error: "server.validTimezoneRequired" };
  if (!targets || targets.length === 0)
    return { error: "server.scheduleTargetAndThreadRequired" };

  const targetKeys = targets.map(
    ({ chatbotAdapterId, threadId }) => `${chatbotAdapterId}:${threadId}`,
  );
  if (new Set(targetKeys).size !== targetKeys.length)
    return { error: "server.duplicateScheduleTarget" };

  for (const target of targets) {
    const link = await kysely.selectFrom("aibot.ChatBotAdapter")
      .innerJoin("aibot.ChatBot", "aibot.ChatBot.id", "aibot.ChatBotAdapter.chatbotId")
      .innerJoin("aibot.ChatAdapter", "aibot.ChatAdapter.id", "aibot.ChatBotAdapter.adapterId")
      .select([
        "aibot.ChatBotAdapter.id", "aibot.ChatBotAdapter.chatbotId", "aibot.ChatBotAdapter.adapterId",
        "aibot.ChatBot.organizationId as chatbotOrganizationId", "aibot.ChatAdapter.organizationId as adapterOrganizationId",
      ]).where("aibot.ChatBotAdapter.id", "=", target.chatbotAdapterId).executeTakeFirst();
    if (
      !link ||
      link.chatbotOrganizationId !== user.organizationId ||
      link.adapterOrganizationId !== user.organizationId ||
      !(await hasResourceAccess(user, link.chatbotId, "read")) ||
      !(await hasResourceAccess(user, link.adapterId, "read"))
    )
      return { error: "server.invalidBotAdapterPair" };
  }

  if (
    id !== null &&
    (!(await kysely.selectFrom("aibot.ChatBotSchedule").select("id")
      .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.scheduleNotFound" };

  const scheduleId = await kysely.transaction().execute(async (tx) => {
    let scheduleId = id;
    if (scheduleId === null) {
      scheduleId = generateResourceId();
      await tx.insertInto("aibot.ResourceBase").values({ id: scheduleId, organizationId: user.organizationId }).execute();
      const schedule = await tx.insertInto("aibot.ChatBotSchedule").values({
        id: scheduleId,
        name,
        prompt,
        cronParam,
        timezone,
        organizationId: user.organizationId,
        updatedAt: new Date(),
      }).returning("id").executeTakeFirstOrThrow();
      scheduleId = schedule.id;
      await tx.insertInto("aibot.Grant").values({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: scheduleId,
        role: "manager",
        grantedById: user.id,
        updatedAt: new Date(),
      }).execute();
    } else {
      await tx.updateTable("aibot.ChatBotSchedule").set({ name, prompt, cronParam, timezone, updatedAt: new Date() })
        .where("id", "=", scheduleId).where("organizationId", "=", user.organizationId).execute();
      await tx.deleteFrom("aibot.ChatTarget").where("scheduleId", "=", scheduleId).execute();
    }

    for (const target of targets) {
      await tx.insertInto("aibot.ChatTarget").values({
        organizationId: user.organizationId,
        scheduleId,
        chatbotAdapterId: target.chatbotAdapterId,
        threadId: target.threadId,
        updatedAt: new Date(),
      }).execute();
    }
    return scheduleId;
  });
  logAuditEvent(
    id === null ? "schedule.created" : "schedule.updated",
    "schedule",
    scheduleId,
    user.id,
  );
  return { ok: true };
}

export async function deleteSchedule(user: AuthUser, id: string) {
  const schedule = await kysely.selectFrom("aibot.ChatBotSchedule").select("id")
    .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst();
  if (!schedule || !(await hasResourceAccess(user, id, "delete"))) return false;
  await kysely.deleteFrom("aibot.ResourceBase").where("id", "=", id).execute();
  logAuditEvent("schedule.deleted", "schedule", id, user.id);
  return true;
}
