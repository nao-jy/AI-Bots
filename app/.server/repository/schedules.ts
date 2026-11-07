import cron from "node-cron";
import { db } from "./db";
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
    db.orm.aibot.ChatBotSchedule.where({ organizationId: user.organizationId })
      .where((schedule) => schedule.id.in(ids))
      .include("chatTargets", (targets) =>
        targets.include("chatbotAdapter", (link) =>
          link.include("chatbot").include("adapter"),
        ),
      )
      .orderBy((schedule) => schedule.createdAt.desc())
      .all(),
    db.orm.aibot.ChatBotAdapter.include("chatbot").include("adapter").all(),
  ]);
  const schedules = await filterResourcesByRole(user, scheduleRows);
  const accessibleLinkIds = new Set(
    (await Promise.all(chatbotAdapters.map(async (link) => ({
      id: link.id,
      allowed: link.chatbot.organizationId === user.organizationId &&
        link.adapter.organizationId === user.organizationId &&
        await hasResourceAccess(user, link.chatbotId, "read") &&
        await hasResourceAccess(user, link.adapterId, "read"),
    })))).filter(({ allowed }) => allowed).map(({ id }) => id),
  );
  return {
    records: await includeResourcePermissions(user, schedules.map((schedule) => {
      const targets = schedule.chatTargets.flatMap((target) => {
        const link = target.chatbotAdapter;
        if (
          !link ||
          !accessibleLinkIds.has(link.id) ||
          link.chatbot.organizationId !== user.organizationId ||
          link.adapter.organizationId !== user.organizationId
        )
          return [];
        return [
          {
            chatbotAdapterId: link.id,
            threadId: target.threadId,
            label: `${link.chatbot.name} / ${link.adapter.name}`,
          },
        ];
      });
      return record(schedule.id, schedule.createdAt, {
        name: schedule.name,
        prompt: schedule.prompt,
        cronParam: schedule.cronParam,
        timezone: schedule.timezone,
        targets: targets
          .map(({ label, threadId }) => `${label} / ${threadId}`)
          .join(", "),
        targetsJson: JSON.stringify(
          targets.map(({ chatbotAdapterId, threadId }) => ({
            chatbotAdapterId,
            threadId,
          })),
        ),
      });
    })),
    targetOptions: chatbotAdapters
      .filter(
        (link) =>
          accessibleLinkIds.has(link.id),
      )
      .map((link) => ({
        label: localizedMessage(
          link.chatbot.isEnabled
            ? "server.scheduleTargetOptionActive"
            : "server.scheduleTargetOptionInactive",
          { 0: link.chatbot.name, 1: link.adapter.name },
        ),
        value: String(link.id),
      })),
  };
}

export async function getScheduleForExecution(id: string) {
  return db.orm.aibot.ChatBotSchedule.where({ id })
    .include("chatTargets", (targets) =>
      targets.include("chatbotAdapter", (link) =>
        link.include("chatbot").include("adapter"),
      ),
    )
    .first();
}

export async function listSchedulePatterns() {
  return db.orm.aibot.ChatBotSchedule.all();
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
    const link = await db.orm.aibot.ChatBotAdapter.where({
      id: target.chatbotAdapterId,
    })
      .include("chatbot")
      .include("adapter")
      .first();
    if (
      !link ||
      link.chatbot.organizationId !== user.organizationId ||
      link.adapter.organizationId !== user.organizationId ||
      !(await hasResourceAccess(user, link.chatbotId, "read")) ||
      !(await hasResourceAccess(user, link.adapterId, "read"))
    )
      return { error: "server.invalidBotAdapterPair" };
  }

  if (
    id !== null &&
    (!(await db.orm.aibot.ChatBotSchedule.first({ id, organizationId: user.organizationId })) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.scheduleNotFound" };

  const scheduleId = await db.transaction(async (tx) => {
    let scheduleId = id;
    if (scheduleId === null) {
      scheduleId = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id: scheduleId, organizationId: user.organizationId });
      const schedule = await tx.orm.aibot.ChatBotSchedule.create({
        id: scheduleId,
        name,
        prompt,
        cronParam,
        timezone,
        organizationId: user.organizationId,
      });
      scheduleId = schedule.id;
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: scheduleId,
        role: "manager",
        grantedById: user.id,
      });
    } else {
      await tx.orm.aibot.ChatBotSchedule.where({
        id: scheduleId,
        organizationId: user.organizationId,
      }).update({ name, prompt, cronParam, timezone });
      await tx.orm.aibot.ChatTarget.where({ scheduleId }).delete();
    }

    for (const target of targets) {
      await tx.orm.aibot.ChatTarget.create({
        organizationId: user.organizationId,
        scheduleId,
        chatbotAdapterId: target.chatbotAdapterId,
        threadId: target.threadId,
      });
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
  const schedule = await db.orm.aibot.ChatBotSchedule.first({
    id,
    organizationId: user.organizationId,
  });
  if (!schedule || !(await hasResourceAccess(user, id, "delete"))) return false;
  await db.orm.aibot.ResourceBase.where({ id }).delete();
  logAuditEvent("schedule.deleted", "schedule", id, user.id);
  return true;
}
