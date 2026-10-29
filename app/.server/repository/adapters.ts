import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptAdapterEnvs,
  encryptStringMap,
  generatePublicId,
  jsonb,
  record,
} from "../utils";
import { toDisplayNameAdapter } from "../features/chatAdapter";

export async function listAdapters(user: AuthUser) {
  const [adapters, authentications] = await Promise.all([
    db.orm.aibot.ChatAdapter.where({ ownerId: user.id }).all(),
    db.orm.aibot.OAuthAuthentication.where({ ownerId: user.id }).all(),
  ]);
  const authNames = new Map(authentications.map((auth) => [auth.id, auth.name]));
  return {
    records: adapters.map((adapter) => {
      const config = decryptAdapterEnvs(adapter.config);
      return record(adapter.id, adapter.updatedAt, {
        name: adapter.name,
        platform: toDisplayNameAdapter(adapter.platform) ?? adapter.platform,
        platformId: adapter.platform,
        authId: adapter.authId === null ? "" : String(adapter.authId),
        authentication: adapter.authId === null ? "未設定" : authNames.get(adapter.authId) ?? "不明",
        config: JSON.stringify(config),
        configured: Object.keys(config).length ? "設定済み" : "未設定",
      });
    }),
    authOptions: authentications.map((auth) => ({ label: auth.name, value: String(auth.id) })),
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
  const authValue = String(values.get("authId") ?? "").trim();
  const authId = authValue ? Number(authValue) : null;
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
    if (!(await db.orm.aibot.ChatAdapter.first({ id, ownerId: user.id })))
      return { error: "アダプタが見つかりません。" };
  }
  if (authId !== null) {
    if (!Number.isInteger(authId) || !(await db.orm.aibot.OAuthAuthentication.first({ id: authId, ownerId: user.id })))
      return { error: "選択したOAuth認証情報が見つかりません。" };
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
    await db.transaction(async (tx) => {
      const adapter = await tx.orm.aibot.ChatAdapter.create({
        name,
        platform,
        ownerId: user.id,
        config: storedEnvs,
        authId,
      });
      for (const slot of ["first", "second"] as const) {
        await tx.orm.aibot.ChatAdapterPublicId.create({
          id: generatePublicId(),
          slot,
          adapterId: adapter.id,
        });
      }
    });
  } else {
    await db.orm.aibot.ChatAdapter.where({ id, ownerId: user.id }).update({
      name,
      platform,
      config: storedEnvs,
      authId,
    });
  }
  return { ok: true };
}

export async function deleteAdapter(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.ChatAdapter.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.ChatAdapter.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function regenerateAdapterPublicIds(user: AuthUser, id: number) {
  return db.transaction(async (tx) => {
    const adapter = await tx.orm.aibot.ChatAdapter.first({
      id,
      ownerId: user.id,
    });
    if (!adapter) return false;

    const publicIds = await tx.orm.aibot.ChatAdapterPublicId.where({
      adapterId: id,
    }).all();
    for (const slot of ["first", "second"] as const) {
      const publicId = publicIds.find((item) => item.slot === slot);
      if (publicId) {
        await tx.orm.aibot.ChatAdapterPublicId.where({ id: publicId.id }).update({
          id: generatePublicId(),
        });
      } else {
        await tx.orm.aibot.ChatAdapterPublicId.create({
          id: generatePublicId(),
          slot,
          adapterId: id,
        });
      }
    }
    return true;
  });
}
