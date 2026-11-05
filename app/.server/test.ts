import type { AuthUser } from "./auth";
import { getBotInfo } from "./features/chat-adapter";
import { getMcpClient } from "./features/mcp";
import { getModelInfo, listProviderNames } from "./features/provider";
import { getProvider } from "./repository/providers";
import {
  decryptMcpHeaders,
  parseObject,
  parseStringMap,
  testFailure,
  testSuccess,
} from "./utils";
import { generateText } from "ai";

export async function testAdapter(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const platformId = String(values.get("platformId") ?? "").trim();
    const conf = parseStringMap(values.get("config"), "コンフィグ");
    const authId = values.get("authId")?.toString().trim();
    let authIdNum: number | null = null;
    if (authId !== undefined && authId.length !== 0) {
      authIdNum = Number(authId);
    }
    const bot = await getBotInfo(platformId, name, conf, authIdNum);
    if (!bot) {
      throw new Error("bot not found");
    }
    return testSuccess(`${bot.displayName}への接続と認証に成功しました。`);
  } catch (error) {
    return testFailure(
      error instanceof Error ? error.message : "server.adapterConnectionFailed",
    );
  }
}

export async function testMcpServer(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const endpoint = String(values.get("endpoint") ?? "").trim();
    const transport = String(values.get("transportId") ?? "").trim();
    let authId = values.get("authId")?.toString().trim();
    let authIdNum: number | null = null;
    if (authId !== undefined && authId.length !== 0) {
      authIdNum = Number(authId);
    }
    if (!endpoint) return testFailure("server.endpointRequired");
    if (transport !== "http")
      return testFailure("server.transportTestUnsupported");
    const headers = parseStringMap(values.get("headers"), "HTTPヘッダー");
    const mcpClient = await getMcpClient(
      transport,
      endpoint,
      headers,
      authIdNum,
    );

    const tools = await mcpClient.listTools();

    return testSuccess(
      `${name || "MCPサーバー"}とのMCP接続に成功しました。(${tools.tools.length}個のツールが利用可能)`,
    );
  } catch (error) {
    return testFailure(
      error instanceof Error ? error.message : "server.mcpConnectionFailed",
    );
  }
}

export async function testAgent(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerId = Number(values.get("providerId"));
    const modelId = String(values.get("modelId") ?? "").trim();
    if (!Number.isInteger(providerId) || !modelId)
      return testFailure("server.providerAndModelRequired");
    const provider = await getProvider(providerId, user.id);
    if (!provider) return testFailure("server.selectedProviderNotFound");
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
    if (!modelInfo) return testFailure("server.modelsUnavailable");
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
      error instanceof Error ? error.message : "server.agentConnectionFailed",
    );
  }
}
