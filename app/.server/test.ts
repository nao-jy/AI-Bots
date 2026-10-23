import type { AuthUser } from "./auth";
import { getBotInfo } from "./features/chatAdapter";
import { getModelInfo, listProviderNames } from "./features/provider";
import { getProvider } from "./models/providers";
import {
  decryptMcpHeaders,
  parseObject,
  parseStringMap,
  requestTest,
  testFailure,
  testSuccess,
} from "./utils";
import { generateText, type JSONValue } from "ai";

export async function testAdapter(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const platformId = String(values.get("platformId") ?? "").trim();
    const conf = parseStringMap(values.get("config"), "コンフィグ");
    const bot = await getBotInfo(platformId, name, conf);
    if (!bot) {
      throw new Error("bot not found");
    }
    return testSuccess(`${bot.displayName}への接続と認証に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "アダプタへの接続に失敗しました。",
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
    const modelInfo = getModelInfo(
      provider.providerName,
      args,
      headers,
      options,
      modelId,
    );
    if (!modelInfo) return testFailure("モデルが取得できませんでした。");
    const result = await generateText({
      model: modelInfo.model,
      prompt: "hello",
      providerOptions: modelInfo.options,
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
