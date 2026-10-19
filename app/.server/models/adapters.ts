import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptAdapterEnvs,
  encryptStringMap,
  jsonb,
  parseStringMap,
  record,
  requestTest,
  testFailure,
  testSuccess,
} from "./entity-shared";

const platforms: Record<string, string> = {
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

export async function testAdapter(user: AuthUser, values: FormData) {
  try {
    const platform = String(values.get("platformId") ?? "").trim();
    const envs = parseStringMap(values.get("envs"), "環境変数");
    const tokenByPlatform: Record<
      string,
      { key: string; url: string; auth: (token: string) => string }
    > = {
      slack: {
        key: "SLACK_BOT_TOKEN",
        url: "https://slack.com/api/auth.test",
        auth: (token) => `Bearer ${token}`,
      },
      discord: {
        key: "DISCORD_BOT_TOKEN",
        url: "https://discord.com/api/v10/users/@me",
        auth: (token) => `Bot ${token}`,
      },
      teams: {
        key: "MICROSOFT_GRAPH_ACCESS_TOKEN",
        url: "https://graph.microsoft.com/v1.0/me",
        auth: (token) => `Bearer ${token}`,
      },
      line: {
        key: "LINE_CHANNEL_ACCESS_TOKEN",
        url: "https://api.line.me/v2/bot/info",
        auth: (token) => `Bearer ${token}`,
      },
    };
    const config = tokenByPlatform[platform];
    if (!config) return testFailure("対応していないプラットフォームです。");
    const token = envs[config.key] ?? envs.ACCESS_TOKEN ?? envs.BOT_TOKEN;
    if (!token)
      return testFailure(
        `環境変数「${config.key}」に認証トークンを入力してください。`,
      );
    const { body } = await requestTest(config.url, {
      headers: { Authorization: config.auth(token) },
    });
    if (platform === "slack") {
      const result: unknown = JSON.parse(body);
      if (
        !result ||
        typeof result !== "object" ||
        (result as { ok?: boolean }).ok !== true
      )
        return testFailure(
          `Slack認証に失敗しました: ${String((result as { error?: string })?.error ?? "不明なエラー")}`,
        );
    }
    return testSuccess(`${platforms[platform]}への接続と認証に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "アダプタへの接続に失敗しました。",
    );
  }
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
