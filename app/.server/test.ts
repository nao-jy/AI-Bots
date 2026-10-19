import type { AuthUser } from "./auth";
import { platforms } from "./models/adapters";
import { getProvider } from "./models/providers";
import {
  authHeaders,
  decryptMcpHeaders,
  parseObject,
  parseStringMap,
  providerBaseUrl,
  requestTest,
  testFailure,
  testSuccess,
} from "./utils";

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

async function runProviderTest(
  providerName: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
) {
  const baseUrl = providerBaseUrl(providerName, args);
  if (!baseUrl)
    throw new Error(
      "このプロバイダーの接続先が特定できません。プロバイダー引数に baseURL を設定してください。",
    );
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  await requestTest(url, { headers: authHeaders(headers) });
}

export async function testProvider(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerName = String(values.get("providerName") ?? "").trim();
    if (!name || !providerName)
      return testFailure("接続名とプロバイダーを入力してください。");
    const args = parseObject(values.get("args"), "プロバイダー引数");
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    await runProviderTest(providerName, args, headers);
    return testSuccess(`${name}への接続に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "プロバイダーへの接続に失敗しました。",
    );
  }
}

export async function testMcpServer(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const endpoint = String(values.get("endpoint") ?? "").trim();
    const transport = String(values.get("transportId") ?? "").trim();
    if (!endpoint) return testFailure("エンドポイントを入力してください。");
    if (transport !== "streamable-http")
      return testFailure(
        "このトランスポートの接続テストには対応していません。",
      );
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    const { body } = await requestTest(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "bot-manager", version: "1.0.0" },
        },
      }),
    });
    const payload = body.match(/^data:\s*(.+)$/m)?.[1] ?? body;
    const result: unknown = JSON.parse(payload);
    if (
      !result ||
      typeof result !== "object" ||
      "error" in result ||
      !(result as { result?: unknown }).result
    )
      return testFailure(
        "MCPサーバーから有効なinitialize応答がありませんでした。",
      );
    return testSuccess(`${name || "MCPサーバー"}とのMCP接続に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "MCPサーバーへの接続に失敗しました。",
    );
  }
}

export async function testAgent(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerId = Number(values.get("providerId"));
    const modelId = String(values.get("model_id") ?? "").trim();
    if (!Number.isInteger(providerId) || !modelId)
      return testFailure("プロバイダーとモデルIDを入力してください。");
    const provider = await getProvider(providerId, user.id);
    if (!provider) return testFailure("選択したプロバイダーが見つかりません。");
    const args = (
      provider.args && typeof provider.args === "object" ? provider.args : {}
    ) as Record<string, unknown>;
    const headers = decryptMcpHeaders(provider.headers);
    const options = parseObject(values.get("options"), "オプション");
    const baseUrl = providerBaseUrl(provider.providerName, args);
    if (!baseUrl)
      return testFailure(
        "このプロバイダーの接続先が特定できません。プロバイダー引数に baseURL を設定してください。",
      );
    await requestTest(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(headers) },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 8,
        ...options,
      }),
    });
    return testSuccess(
      `${name || "エージェント"}のモデル「${modelId}」に接続できました。`,
    );
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "エージェントの接続テストに失敗しました。",
    );
  }
}
