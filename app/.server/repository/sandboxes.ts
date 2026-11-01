import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  jsonb,
  jsonbToStringRecord,
  parseStringList,
  record,
} from "../utils";
import {
  executeSandboxCommand,
  listSandboxNames,
} from "../features/toolsets/sandboxes";
import { logger } from "~/.server/logger";
import { SANDBOX_SCOPES } from "~/const";
export type SandboxScope = keyof typeof SANDBOX_SCOPES;

function isSandboxScope(value: string): value is SandboxScope {
  return Object.hasOwn(SANDBOX_SCOPES, value);
}

export async function listSandboxes(user: AuthUser) {
  const sandboxes = await db.orm.aibot.Sandbox.where({
    ownerId: user.id,
  }).all();
  const sandboxNames = await listSandboxNames();
  return {
    sandboxTypeOptions: sandboxNames.map((name) => ({
      label: name,
      value: name,
    })),
    records: await Promise.all(
      sandboxes.map(async (sandbox) => {
        const instances = await db.orm.aibot.PersistentSandboxInstance.where({
          sandboxId: sandbox.id,
        }).all();
        return record(sandbox.id, "—", {
          sandboxType: sandbox.sandboxType,
          type: sandbox.sandboxType,
          sandboxScope: sandbox.sandboxScope,
          scope: SANDBOX_SCOPES[sandbox.sandboxScope],
          name: sandbox.name,
          envs: JSON.stringify(sandbox.envs ?? {}),
          allowedDomainList: JSON.stringify(sandbox.allowedDomainList),
          instances: JSON.stringify(
            instances.map((instance) => ({
              instanceId: instance.instanceId,
              scopeLabel: instance.threadId
                ? "スレッド"
                : instance.adapterId !== null
                  ? `アダプター #${instance.adapterId}`
                  : instance.chatbotId !== null
                    ? `ボット #${instance.chatbotId}`
                    : "共有",
            })),
          ),
        });
      }),
    ),
  };
}

const SHELL_OUTPUT_LIMIT = 30_000;

function limitShellOutput(value: string) {
  return value.length > SHELL_OUTPUT_LIMIT
    ? `${value.slice(0, SHELL_OUTPUT_LIMIT)}\n\n[出力を省略しました]`
    : value;
}

export async function runPersistentSandboxCommand(
  user: AuthUser,
  sandboxId: number,
  instanceId: string,
  command: string,
) {
  if (!Number.isInteger(sandboxId) || sandboxId <= 0)
    return { ok: false, error: "サンドボックスが見つかりません。" };
  if (!instanceId.trim())
    return { ok: false, error: "実行するインスタンスを選択してください。" };
  if (!command.trim())
    return { ok: false, error: "コマンドを入力してください。" };
  if (command.length > 4_000)
    return { ok: false, error: "コマンドは4,000文字以内で入力してください。" };

  const sandbox = await db.orm.aibot.Sandbox.first({
    id: sandboxId,
    ownerId: user.id,
  });
  if (!sandbox) return { ok: false, error: "サンドボックスが見つかりません。" };

  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  }).first();
  if (!instance || instance.sandboxId !== sandbox.id)
    return { ok: false, error: "選択したインスタンスが見つかりません。" };

  try {
    const result = await executeSandboxCommand(
      sandbox.sandboxType,
      instanceId,
      jsonbToStringRecord(sandbox.envs),
      [...sandbox.allowedDomainList],
      command,
    );
    logger.info("Sandbox shell output diagnostics", {
      sandboxId,
      instanceId,
      sandboxType: sandbox.sandboxType,
      commandLength: command.length,
      stdoutLength: result.stdout.length,
      stdoutLineFeeds: (result.stdout.match(/\n/g) ?? []).length,
      stdoutCarriageReturns: (result.stdout.match(/\r/g) ?? []).length,
      stderrLength: result.stderr.length,
      stderrLineFeeds: (result.stderr.match(/\n/g) ?? []).length,
      stderrCarriageReturns: (result.stderr.match(/\r/g) ?? []).length,
    });
    return {
      ok: true,
      command,
      stdout: limitShellOutput(result.stdout),
      stderr: limitShellOutput(result.stderr),
      exitCode: result.exitCode,
    };
  } catch (error) {
    logger.error("Persistent sandbox command failed", {
      error,
      sandboxId,
      instanceId,
    });
    return {
      ok: false,
      command,
      error:
        error instanceof Error
          ? error.message
          : "サンドボックスでコマンドを実行できませんでした。",
    };
  }
}

export async function saveSandbox(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const sandboxType = String(values.get("sandboxType") ?? "").trim();
  const sandboxScope = String(values.get("sandboxScope") ?? "").trim();
  const sandboxName = String(values.get("sandboxName") ?? "").trim();
  if (!(await listSandboxNames()).includes(sandboxType))
    return { error: "サポートされていないサンドボックスタイプです。" };
  if (!isSandboxScope(sandboxScope))
    return { error: "サンドボックスの適用範囲を選択してください。" };
  let envs: Record<string, string>;
  let allowedDomainList: string[];
  try {
    const envValue: unknown = JSON.parse(
      String(values.get("envs") ?? "{}").trim() || "{}",
    );
    if (
      !envValue ||
      typeof envValue !== "object" ||
      Array.isArray(envValue) ||
      Object.values(envValue).some((v) => typeof v !== "string")
    )
      throw new Error(
        "環境変数は文字列のキー・値オブジェクトで入力してください。",
      );
    envs = envValue as Record<string, string>;
    allowedDomainList = parseStringList(
      String(values.get("allowedDomainList") ?? "[]").trim(),
      "許可ドメイン",
    );
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "入力値を確認してください。",
    };
  }
  if (
    id !== null &&
    !(await db.orm.aibot.Sandbox.first({ id, ownerId: user.id }))
  )
    return { error: "サンドボックスが見つかりません。" };
  const saved = {
    sandboxType,
    sandboxScope,
    envs: jsonb(envs),
    allowedDomainList,
    name: sandboxName,
  };
  if (id === null)
    await db.orm.aibot.Sandbox.create({ ...saved, ownerId: user.id });
  else await db.orm.aibot.Sandbox.where({ id, ownerId: user.id }).update(saved);
  return { ok: true };
}

export async function deleteSandbox(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.Sandbox.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.Sandbox.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function getSandboxInstance(instanceId: string) {
  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  })
    .include("sandbox")
    .first();
  return instance;
}

export async function getChatbotSandbox(chatbotId: number, ownerId: number) {
  const links = await db.orm.aibot.ChatBotToolSandbox.where({ chatbotId })
    .include("sandBox")
    .all();
  return (
    links.find((link) => link.sandBox.ownerId === ownerId)?.sandBox ?? null
  );
}

export async function getPersistentSandboxInstance(
  sandboxId: number,
  sandboxScope: SandboxScope,
  threadId: string | null,
  adapterId: number | null,
  chatbotId: number | null,
) {
  if (sandboxScope === "turn") return null;

  const instances = await db.orm.aibot.PersistentSandboxInstance.where({
    sandboxId,
  }).all();
  switch (sandboxScope) {
    case "thread": {
      const isValid =
        threadId !== null && adapterId !== null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "adapter": {
      const isValid =
        threadId === null && adapterId !== null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "bot": {
      const isValid =
        threadId === null && adapterId === null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "all": {
      const isValid =
        threadId === null && adapterId === null && chatbotId === null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
  }
  return instances.find(
    (instance) =>
      instance.threadId === threadId &&
      instance.adapterId === adapterId &&
      instance.chatbotId === chatbotId,
  );
}

export async function createPersistentSandboxInstance(values: {
  instanceId: string;
  sandboxId: number;
  chatbotId: number | null;
  adapterId: number | null;
  threadId: string | null;
}) {
  return db.orm.aibot.PersistentSandboxInstance.create(values);
}

export async function deleteSandboxInstance(instanceId: string) {
  await db.orm.aibot.PersistentSandboxInstance.where({ instanceId }).delete();
}
