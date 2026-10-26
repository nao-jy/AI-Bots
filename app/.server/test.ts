import type { AuthUser } from "./auth";
import { getBotInfo } from "./features/chatAdapter";
import { getModelInfo, listProviderNames } from "./features/provider";
import { getProvider } from "./repository/providers";
import { createMCPClient } from "@ai-sdk/mcp";
import {
  decryptMcpHeaders,
  parseObject,
  parseStringMap,
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
    if (transport !== "http")
      return testFailure(
        "このトランスポートの接続テストには対応していません。",
      );
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    const mcpClient = await createMCPClient({
      transport: {
        type: transport,
        url: endpoint,
        headers: headers,
      },
    });

    const tools = await mcpClient.listTools();

    return testSuccess(
      `${name || "MCPサーバー"}とのMCP接続に成功しました。(${tools.tools.length}個のツールが利用可能)`,
    );
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
