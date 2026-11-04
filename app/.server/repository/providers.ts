import { db } from "./db";
import type { AuthUser } from "../auth";
import { decryptMcpHeaders, encryptStringMap, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

export async function listProviders(user: AuthUser) {
  const providers = await db.orm.aibot.Provider.where({ ownerId: user.id })
    .orderBy((provider) => provider.updatedAt.desc())
    .all();
  return {
    records: providers.map((provider) => {
      const headers = decryptMcpHeaders(provider.headers);
      return record(provider.id, provider.updatedAt, {
        name: provider.name,
        providerName: provider.providerName,
        args: JSON.stringify(provider.args ?? {}, null, 2),
        headers: JSON.stringify(headers, null, 2),
        headersConfigured: Object.keys(headers).length ? "設定済み" : "未設定",
      });
    }),
  };
}

export async function saveProvider(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerName = String(values.get("providerName") ?? "").trim();
  const argsValue = String(values.get("args") ?? "{}").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  if (!name || !providerName)
    return { error: "接続名とプロバイダーを入力してください。" };
  let args: unknown;
  let headers: Record<string, string>;
  try {
    args = JSON.parse(argsValue || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args))
      return { error: "プロバイダー引数にはオブジェクトを入力してください。" };
  } catch {
    return { error: "プロバイダー引数JSONの形式を確認してください。" };
  }
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "HTTPヘッダーにはオブジェクトを入力してください。" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "HTTPヘッダーの値は文字列で入力してください。" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "HTTPヘッダーJSONの形式を確認してください。" };
  }
  if (
    id !== null &&
    !(await db.orm.aibot.Provider.first({ id, ownerId: user.id }))
  )
    return { error: "プロバイダーが見つかりません。" };
  const duplicate = await db.orm.aibot.Provider.first({
    ownerId: user.id,
    name,
  });
  if (duplicate && duplicate.id !== id)
    return { error: "同じ接続名のプロバイダーが既にあります。" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "HTTPヘッダーを暗号化できませんでした。",
    };
  }
  const saved = {
    name,
    providerName,
    args: jsonb(args),
    headers: jsonb(encryptedHeaders),
  };
  if (id === null) {
    const provider = await db.orm.aibot.Provider.create({
      ...saved,
      ownerId: user.id,
    });
    logAuditEvent("provider.created", "provider", provider.id, user.id);
  } else {
    await db.orm.aibot.Provider.where({ id, ownerId: user.id }).update(saved);
    logAuditEvent("provider.updated", "provider", id, user.id);
  }
  return { ok: true };
}

export async function deleteProvider(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.Provider.first({ id, ownerId: user.id })))
    return false;
  if (await db.orm.aibot.AgentDefinition.first({ providerId: id }))
    return false;
  await db.orm.aibot.Provider.where({ id, ownerId: user.id }).delete();
  logAuditEvent("provider.deleted", "provider", id, user.id);
  return true;
}

export async function getProvider(providerId: number, ownerId: number) {
  const provider = await db.orm.aibot.Provider.first({
    id: providerId,
    ownerId: ownerId,
  });
  return provider;
}
