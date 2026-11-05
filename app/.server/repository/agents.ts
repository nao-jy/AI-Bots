import { db } from "./db";
import type { AuthUser } from "../auth";
import { idList, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import type {
  LanguageModelUsage,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
} from "ai";

export async function listAgents(user: AuthUser) {
  const agents = await db.orm.aibot.AgentDefinition.where({
    ownerId: user.id,
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
          : "server.unused",
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
        "server.invalidMcpOauthConfiguration",
    };
  }
  if (!name) return { error: "server.agentNameRequired" };
  if (!Number.isInteger(providerId) || !modelId)
    return { error: "server.providerAndModelRequired" };
  if (
    !(await db.orm.aibot.Provider.first({
      id: providerId,
      ownerId: user.id,
    }))
  )
    return { error: "server.selectedProviderNotFound" };
  let options: unknown;
  try {
    options = JSON.parse(optionsValue || "{}");
    if (!options || typeof options !== "object" || Array.isArray(options))
      return { error: "server.optionsMustBeObject" };
  } catch {
    return { error: "server.invalidOptionsJson" };
  }
  const servers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const ownedBots = await db.orm.aibot.ChatBot.where({
    ownerId: user.id,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)))
    return { error: "server.selectedMcpServerUnavailable" };
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
        "server.mcpOauthRequiresSelectedServerAndOwnCredentials",
    };
  if (id !== null) {
    const existing = await db.orm.aibot.AgentDefinition.where({ id })
      .include("provider")
      .first();
    if (!existing || existing.provider.ownerId !== user.id)
      return { error: "server.agentNotFound" };
  }
  if (id !== null) {
    const assignedBot = await db.orm.aibot.ChatBot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "server.agentEditForbidden" };
  }
  const valuesToSave = {
    name,
    providerId,
    modelId: modelId,
    options: jsonb(options),
    ownerId: user.id,
  };
  const agentId = await db.transaction(async (tx) => {
    const agentId =
      id === null
        ? (await tx.orm.aibot.AgentDefinition.create(valuesToSave)).id
        : id;
    if (id !== null)
      await tx.orm.aibot.AgentDefinition.where({ id }).update(valuesToSave);
    return agentId;
  });
  logAuditEvent(
    id === null ? "agent.created" : "agent.updated",
    "agent",
    agentId,
    user.id,
  );
  return { ok: true };
}

export async function deleteAgent(user: AuthUser, id: number) {
  const agent = await db.orm.aibot.AgentDefinition.where({ id })
    .include("provider")
    .first();
  if (!agent || agent.provider.ownerId !== user.id) return false;
  const bot = await db.orm.aibot.ChatBot.first({ agentId: id });
  if (bot) return false;
  await db.orm.aibot.AgentDefinition.where({ id }).delete();
  logAuditEvent("agent.deleted", "agent", id, user.id);
  return true;
}

export async function insertUsage(
  chatbotId: number,
  agentId: number,
  providerId: number,
  usage: LanguageModelUsage,
  toolResults: Array<TypedToolResult<ToolSet>>,
  platform: string,
  threadId: string,
) {
  const created = await db.orm.aibot.AgentUsage.create({
    chatbotId: chatbotId,
    agentId: agentId,
    providerId: providerId,
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
    platform: platform,
    threadId: threadId,
  });
  logAuditEvent("agent.usage_recorded", "bot", chatbotId);
  return created.id;
}
