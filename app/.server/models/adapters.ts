import { db } from "./db";
import type { AuthUser } from "../auth";
import { decryptAdapterEnvs, encryptStringMap, jsonb, record } from "../utils";

export const platforms: Record<string, string> = {
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
  line: "LINE",
};

export async function listAdapters(user: AuthUser) {
  const adapters = await db.orm.public.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  return {
    records: adapters.map((adapter) => {
      const envs = decryptAdapterEnvs(adapter.envs);
      return record(adapter.id, adapter.updatedAt, {
        name: adapter.name,
        platform: platforms[adapter.platform] ?? adapter.platform,
        platformId: adapter.platform,
        envs: JSON.stringify(envs),
        envsConfigured: Object.keys(envs).length ? "設定済み" : "未設定",
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
  const platform = String(values.get("platformId") ?? "").trim();
  const envsValue = String(values.get("envs") ?? "{}").trim();
  if (!name || !platform)
    return { error: "接続名とプラットフォームを入力してください。" };
  let envs: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(envsValue || "{}");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    )
      return { error: "環境変数は文字列のキー・値ペアで入力してください。" };
    envs = parsed as Record<string, string>;
  } catch {
    return { error: "環境変数の形式を確認してください。" };
  }
  if (id !== null) {
    if (!(await db.orm.public.ChatAdapter.first({ id, ownerId: user.id })))
      return { error: "アダプタが見つかりません。" };
  }
  let encryptedEnvs: ReturnType<typeof encryptStringMap>;
  try {
    encryptedEnvs = encryptStringMap(envs);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "環境変数を暗号化できませんでした。",
    };
  }
  const storedEnvs = jsonb(encryptedEnvs);
  if (id === null) {
    await db.orm.public.ChatAdapter.create({
      name,
      platform,
      ownerId: user.id,
      envs: storedEnvs,
    });
  } else {
    await db.orm.public.ChatAdapter.where({ id, ownerId: user.id }).update({
      name,
      platform,
      envs: storedEnvs,
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
