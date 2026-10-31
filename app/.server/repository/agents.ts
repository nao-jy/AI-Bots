import { db } from "./db";
import type { AuthUser } from "../auth";
import { idList, jsonb, record } from "../utils";
import type {
  LanguageModelUsage,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
} from "ai";

export async function listAgents(user: AuthUser) {
  const agents = await db.orm.aibot.AgentDefinition.where({
    ownerId: user.id,
    isDeleted: false,
  })
    .include("chatbot")
    .include("provider")
    .all();
  return {
    records: agents.map((agent) => {
      return record(agent.id, agent.updatedAt, {
        name: agent.name,
        model: agent.modelId,
        modelId: agent.modelId,
        provider: agent.provider.name,
        providerId: agent.provider.id,
        options: JSON.stringify(agent.options ?? {}, null, 2),
        status: agent.chatbot
          ? `ボット「${agent.chatbot.name}」で利用中`
          : "未使用",
      });
    }),
    providerOptions: (
      await db.orm.aibot.Provider.where({ ownerId: user.id }).all()
    ).map((provider) => ({
      label: `${provider.name} (${provider.providerName})`,
      value: String(provider.id),
    })),
  };
}

export async function saveAgent(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerId = Number(values.get("providerId"));
  const modelId = String(values.get("modelId") ?? "").trim();
  const optionsValue = String(values.get("options") ?? "{}").trim();
  const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
  let mcpAuthIds: Record<string, number>;
  try {
    const parsed: unknown = JSON.parse(
      String(values.get("mcpAuthIds") ?? "{}"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    mcpAuthIds = Object.fromEntries(
      Object.entries(parsed).map(([serverId, authId]) => {
        const key = Number(serverId);
        const value = Number(authId);
        if (!Number.isInteger(key) || !Number.isInteger(value))
          throw new Error();
        return [String(key), value];
      }),
    );
  } catch {
    return {
      error:
        "MCP OAuth認証の設定はサーバーIDと認証IDのJSONオブジェクトで入力してください。",
    };
  }
  if (!name) return { error: "エージェント名を入力してください。" };
  if (!Number.isInteger(providerId) || !modelId)
    return { error: "プロバイダーとモデルIDを入力してください。" };
  if (
    !(await db.orm.aibot.Provider.first({
      id: providerId,
      ownerId: user.id,
    }))
  )
    return { error: "選択したプロバイダーが見つかりません。" };
  let options: unknown;
  try {
    options = JSON.parse(optionsValue || "{}");
    if (!options || typeof options !== "object" || Array.isArray(options))
      return { error: "オプションにはJSONオブジェクトを入力してください。" };
  } catch {
    return { error: "オプションJSONの形式を確認してください。" };
  }
  const servers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const ownedBots = await db.orm.aibot.Chatbot.where({
    ownerId: user.id,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)))
    return { error: "選択したMCPサーバーを使用できません。" };
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    ownerId: user.id,
  }).all();
  const allowedAuthIds = new Set(authentications.map((auth) => auth.id));
  if (
    Object.values(mcpAuthIds).some((authId) => !allowedAuthIds.has(authId)) ||
    Object.keys(mcpAuthIds).some(
      (serverId) => !serverIds.includes(Number(serverId)),
    )
  )
    return {
      error:
        "MCP OAuth認証には選択済みサーバーと自分の認証情報を指定してください。",
    };
  if (id !== null) {
    const existing = await db.orm.aibot.AgentDefinition.where({ id })
      .include("provider")
      .first();
    if (!existing || existing.provider.ownerId !== user.id)
      return { error: "エージェントが見つかりません。" };
  }
  if (id !== null) {
    const assignedBot = await db.orm.aibot.Chatbot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "このエージェントを編集する権限がありません。" };
  }
  const valuesToSave = {
    name,
    providerId,
    modelId: modelId,
    options: jsonb(options),
    ownerId: user.id,
  };
  await db.transaction(async (tx) => {
    const agentId =
      id === null
        ? (await tx.orm.aibot.AgentDefinition.create(valuesToSave)).id
        : id;
    if (id !== null)
      await tx.orm.aibot.AgentDefinition.where({ id }).update(valuesToSave);
  });
  return { ok: true };
}

export async function deleteAgent(user: AuthUser, id: number) {
  const agent = await db.orm.aibot.AgentDefinition.where({ id })
    .include("provider")
    .first();
  if (!agent || agent.provider.ownerId !== user.id) return false;
  const bot = await db.orm.aibot.Chatbot.first({ agentId: id });
  if (bot) return false;
  await db.orm.aibot.AgentDefinition.where({ id }).update({
    isDeleted: true,
  });
  return true;
}

export async function insertUsage(
  chatbotId: number,
  agentId: number,
  usage: LanguageModelUsage,
  toolResults: Array<TypedToolResult<ToolSet>>,
) {
  await db.orm.aibot.AgentUsage.create({
    chatbotId: chatbotId,
    agentId: agentId,
    inputTokens: usage.inputTokens ?? 0,
    inputDetails: jsonb({
      noCacheTokens: usage.inputTokenDetails.noCacheTokens ?? null,
      cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? null,
      cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? null,
    }),
    outputTokens: usage.outputTokens ?? 0,
    outputDetails: jsonb({
      textTokens: usage.outputTokenDetails.textTokens ?? null,
      reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? null,
    }),
    toolHistory: jsonb(
      toolResults.map((v) => ({
        toolName: v.toolName,
        input: v.input,
        output: v.output,
      })),
    ),
  });
}
