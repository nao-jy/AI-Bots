import { db } from "./db";
import type { AuthUser } from "../auth";
import { decryptAdapterEnvs, encryptStringMap, jsonb, record } from "../utils";
import { toDisplayNameAdapter } from "../features/chatAdapter";

export async function listAdapters(user: AuthUser) {
  const adapters = await db.orm.public.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  return {
    records: adapters.map((adapter) => {
      const config = decryptAdapterEnvs(adapter.config);
      return record(adapter.id, adapter.updatedAt, {
        name: adapter.name,
        platform: toDisplayNameAdapter(adapter.platform) ?? adapter.platform,
        platformId: adapter.platform,
        config: JSON.stringify(config),
        configured: Object.keys(config).length ? "設定済み" : "未設定",
      });
    }),
  };
}

export async function saveAdapter(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const platform = String(
    values.get("platformId") ?? values.get("platform") ?? "",
  ).trim();
  const configValue = String(values.get("config") ?? "{}").trim();
  if (!name || !platform)
    return { error: "接続名とプラットフォームを入力してください。" };
  let config: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(configValue || "{}");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    )
      return { error: "環境変数は文字列のキー・値ペアで入力してください。" };
    config = parsed as Record<string, string>;
  } catch {
    return { error: "環境変数の形式を確認してください。" };
  }
  if (id !== null) {
    if (!(await db.orm.public.ChatAdapter.first({ id, ownerId: user.id })))
      return { error: "アダプタが見つかりません。" };
  }
  let encryptedConfig: ReturnType<typeof encryptStringMap>;
  try {
    encryptedConfig = encryptStringMap(config);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "環境変数を暗号化できませんでした。",
    };
  }
  const storedEnvs = jsonb(encryptedConfig);
  if (id === null) {
    await db.orm.public.ChatAdapter.create({
      name,
      platform,
      ownerId: user.id,
      config: storedEnvs,
    });
  } else {
    await db.orm.public.ChatAdapter.where({ id, ownerId: user.id }).update({
      name,
      platform,
      config: storedEnvs,
    });
  }
  return { ok: true };
}

export async function deleteAdapter(user: AuthUser, id: number) {
  if (!(await db.orm.public.ChatAdapter.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.ChatAdapter.where({ id, ownerId: user.id }).delete();
  return true;
}
