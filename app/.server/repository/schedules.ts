import cron from "node-cron";
import { db } from "./db";
import type { AuthUser } from "../auth";
import { record } from "../utils";

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

export async function listSchedules(user: AuthUser) {
  const [schedules, chatbotAdapters] = await Promise.all([
    db.orm.aibot.ChatBotSchedule.where({ ownerId: user.id })
      .include("chatTargets", (targets) =>
        targets.include("chatbotAdapter", (link) =>
          link.include("chatbot").include("adapter"),
        ),
      )
      .orderBy((schedule) => schedule.createdAt.desc())
      .all(),
    db.orm.aibot.ChatBotAdapter.include("chatbot")
      .include("adapter")
      .all(),
  ]);
  return {
    records: schedules.map((schedule) => {
      const targets = schedule.chatTargets.flatMap((target) => {
        const link = target.chatbotAdapter;
        if (
          !link ||
          link.chatbot.ownerId !== user.id ||
          link.adapter.ownerId !== user.id
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
    }),
    targetOptions: chatbotAdapters
      .filter(
        (link) =>
          link.chatbot.ownerId === user.id &&
          link.adapter.ownerId === user.id,
      )
      .map((link) => ({
        label: `${link.chatbot.name} / ${link.adapter.name}${
          link.chatbot.isEnabled && !link.chatbot.isDeleted ? "" : " (停止中)"
        }`,
        value: String(link.id),
      })),
  };
}

export async function getScheduleForExecution(id: number) {
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
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const prompt = String(values.get("prompt") ?? "").trim();
  const cronParam = String(values.get("cronParam") ?? "").trim();
  const timezone = String(values.get("timezone") ?? "").trim();
  const targets = parseTargets(values.get("targets"));

  if (!name) return { error: "スケジュール名を入力してください。" };
  if (!prompt) return { error: "プロンプトを入力してください。" };
  if (!cronParam || !cron.validate(cronParam))
    return { error: "Cron式を正しく入力してください。" };
  if (!timezone || !isValidTimezone(timezone))
    return { error: "有効なタイムゾーンを選択してください。" };
  if (!targets || targets.length === 0)
    return { error: "送信先とスレッドIDを1件以上指定してください。" };

  const targetKeys = targets.map(
    ({ chatbotAdapterId, threadId }) => `${chatbotAdapterId}:${threadId}`,
  );
  if (new Set(targetKeys).size !== targetKeys.length)
    return { error: "同じ送信先とスレッドIDを重複して指定できません。" };

  for (const target of targets) {
    const link = await db.orm.aibot.ChatBotAdapter.where({
      id: target.chatbotAdapterId,
    })
      .include("chatbot")
      .include("adapter")
      .first();
    if (
      !link ||
      link.chatbot.ownerId !== user.id ||
      link.adapter.ownerId !== user.id
    )
      return { error: "選択したボットとアダプタの組み合わせが無効です。" };
  }

  if (
    id !== null &&
    !(await db.orm.aibot.ChatBotSchedule.first({ id, ownerId: user.id }))
  )
    return { error: "スケジュールが見つかりません。" };

  await db.transaction(async (tx) => {
    let scheduleId = id;
    if (scheduleId === null) {
      const schedule = await tx.orm.aibot.ChatBotSchedule.create({
        name,
        prompt,
        cronParam,
        timezone,
        ownerId: user.id,
      });
      scheduleId = schedule.id;
    } else {
      await tx.orm.aibot.ChatBotSchedule.where({
        id: scheduleId,
        ownerId: user.id,
      }).update({ name, prompt, cronParam, timezone });
      await tx.orm.aibot.ChatTarget.where({ scheduleId }).delete();
    }

    for (const target of targets) {
      await tx.orm.aibot.ChatTarget.create({
        scheduleId,
        chatbotAdapterId: target.chatbotAdapterId,
        threadId: target.threadId,
      });
    }
  });
  return { ok: true };
}

export async function deleteSchedule(user: AuthUser, id: number) {
  const schedule = await db.orm.aibot.ChatBotSchedule.first({
    id,
    ownerId: user.id,
  });
  if (!schedule) return false;
  await db.orm.aibot.ChatBotSchedule.where({
    id,
    ownerId: user.id,
  }).delete();
  return true;
}
