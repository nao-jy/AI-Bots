import { db } from "./db";
import type { AuthUser } from "../auth";
import { jsonb, record } from "../utils";
import { listSandboxNames } from "../features/toolsets/sandboxes";
import { SANDBOX_SCOPES } from "~/const";
type SandboxScope = keyof typeof SANDBOX_SCOPES;

function isSandboxScope(value: string): value is SandboxScope {
  return Object.hasOwn(SANDBOX_SCOPES, value);
}

function parseStringList(value: string, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    throw new Error(`${label}はJSON配列で入力してください。`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string"))
    throw new Error(`${label}は文字列のJSON配列で入力してください。`);
  return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
}

export async function listSandboxes(user: AuthUser) {
  const sandboxes = await db.orm.aibot.Sandbox.where({
    ownerId: user.id,
  }).all();
  const sandboxNames = listSandboxNames();
  return {
    sandboxTypeOptions: sandboxNames.map((name) => ({
      label: name,
      value: name,
    })),
    records: sandboxes.map((sandbox) =>
      record(sandbox.id, "—", {
        sandboxType: sandbox.sandboxType,
        type: sandbox.sandboxType,
        sandboxScope: sandbox.sandboxScope,
        scope: SANDBOX_SCOPES[sandbox.sandboxScope],
        name: `${sandbox.sandboxType} (${SANDBOX_SCOPES[sandbox.sandboxScope]})`,
        envs: JSON.stringify(sandbox.envs ?? {}, null, 2),
        allowedDomainList: JSON.stringify(sandbox.allowedDomainList, null, 2),
      }),
    ),
  };
}

export async function saveSandbox(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const sandboxType = String(values.get("sandboxType") ?? "").trim();
  const sandboxScope = String(values.get("sandboxScope") ?? "").trim();
  if (!listSandboxNames().includes(sandboxType))
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
  const instance = await db.orm.aibot.SandboxInstance.whereUnique({
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
  return links.find((link) => link.sandBox.ownerId === ownerId)?.sandBox ?? null;
}

export async function getReusableSandboxInstance(
  chatbotId: number,
  sandboxId: number,
  sandboxScope: SandboxScope,
  threadId: string,
) {
  if (sandboxScope === "turn") return null;

  const instances = await db.orm.aibot.SandboxInstance.where({
    chatbotId,
    sandboxId,
  }).all();
  return sandboxScope === "thread"
    ? (instances.find((instance) => instance.threadId === threadId) ?? null)
    : (instances.find((instance) => instance.threadId === null) ?? null);
}

export async function createSandboxInstance(values: {
  instanceId: string;
  sandboxId: number;
  chatbotId: number;
  threadId: string | null;
}) {
  return db.orm.aibot.SandboxInstance.create(values);
}

export async function deleteSandboxInstance(instanceId: string) {
  await db.orm.aibot.SandboxInstance.where({ instanceId }).delete();
}
