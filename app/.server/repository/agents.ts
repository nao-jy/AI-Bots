import { db } from "./db";
import type { AuthUser } from "../auth";
import { generateResourceId, idList, isUuid, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { t } from "~/.server/i18n";
import { filterResourcesByRole, hasResourceAccess, includeResourcePermissions } from "../authorization";
import type {
  LanguageModelUsage,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
} from "ai";

export async function listAgents(user: AuthUser, ids: string[]) {
  const agents = await filterResourcesByRole(
    user,
    await db.orm.aibot.AgentDefinition.where({
      organizationId: user.organizationId,
    })
      .where((agent) => agent.id.in(ids))
      .include("chatbots")
      .include("provider")
      .all(),
  );
  return {
    records: await includeResourcePermissions(user, agents.map((agent) => {
      return record(agent.id, agent.updatedAt, {
        name: agent.name,
        model: agent.modelId,
        modelId: agent.modelId,
        provider: agent.provider.name,
        providerId: agent.provider.id,
        options: JSON.stringify(agent.options ?? {}, null, 2),
        status: agent.chatbots.length
          ? t("server.usedByBot", { 0: agent.chatbots.length })
          : "server.unused",
      });
    })),
    providerOptions: (await filterResourcesByRole(user,
      await db.orm.aibot.Provider.where({ organizationId: user.organizationId }).all(),
    )).map((provider) => ({
      label: `${provider.name} (${provider.providerName})`,
      value: String(provider.id),
    })),
  };
}

export async function saveAgent(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerId = String(values.get("providerId") ?? "");
  const modelId = String(values.get("modelId") ?? "").trim();
  const optionsValue = String(values.get("options") ?? "{}").trim();
  const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
  let mcpAuthIds: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(
      String(values.get("mcpAuthIds") ?? "{}"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    mcpAuthIds = Object.fromEntries(
      Object.entries(parsed).map(([serverId, authId]) => {
        const key = serverId;
        const value = String(authId);
        if (!isUuid(key) || !isUuid(value))
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
  if (!isUuid(providerId) || !modelId)
    return { error: "server.providerAndModelRequired" };
  if (
    !(await db.orm.aibot.Provider.first({
      id: providerId,
      organizationId: user.organizationId,
    })) || !(await hasResourceAccess(user, providerId, "read"))
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
    organizationId: user.organizationId,
  }).all();
  const ownedBots = await db.orm.aibot.ChatBot.where({
    organizationId: user.organizationId,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)) ||
    (await Promise.all(serverIds.map((resourceId) => hasResourceAccess(user, resourceId, "read")))).some((allowed) => !allowed))
    return { error: "server.selectedMcpServerUnavailable" };
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    organizationId: user.organizationId,
  }).all();
  const allowedAuthIds = new Set(authentications.map((auth) => auth.id));
  if (
    Object.values(mcpAuthIds).some((authId) => !allowedAuthIds.has(authId)) ||
    (await Promise.all(Object.values(mcpAuthIds).map((authId) => hasResourceAccess(user, authId, "read")))).some((allowed) => !allowed) ||
    Object.keys(mcpAuthIds).some(
      (serverId) => !serverIds.includes(serverId),
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
    if (!existing || existing.provider.organizationId !== user.organizationId ||
      !(await hasResourceAccess(user, id, "update")))
      return { error: "server.agentNotFound" };
  }
  if (id !== null) {
    const assignedBot = await db.orm.aibot.ChatBot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "server.agentEditForbidden" };
  }
  const valuesToSave = {
    id: id ?? generateResourceId(),
    name,
    providerId,
    modelId: modelId,
    options: jsonb(options),
    organizationId: user.organizationId,
  };
  const agentId = await db.transaction(async (tx) => {
    let agentId = id;
    if (agentId === null) {
      agentId = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id: agentId });
      await tx.orm.aibot.AgentDefinition.create({ ...valuesToSave, id: agentId });
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: agentId,
        role: "manager",
        grantedById: user.id,
      });
    }
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

export async function deleteAgent(user: AuthUser, id: string) {
  const agent = await db.orm.aibot.AgentDefinition.where({ id })
    .include("provider")
    .first();
  if (!agent || agent.provider.organizationId !== user.organizationId ||
    !(await hasResourceAccess(user, id, "delete"))) return false;
  const bot = await db.orm.aibot.ChatBot.first({ agentId: id });
  if (bot) return false;
  await db.orm.aibot.ResourceBase.where({ id }).delete();
  logAuditEvent("agent.deleted", "agent", id, user.id);
  return true;
}

export async function insertUsage(
  chatbotId: string,
  agentId: string,
  providerId: string,
  usage: LanguageModelUsage,
  toolResults: Array<TypedToolResult<ToolSet>>,
  platform: string,
  threadId: string,
) {
  const chatbot = await db.orm.aibot.ChatBot.first({ id: chatbotId });
  if (!chatbot) throw new Error("server.botNotFound");
  const created = await db.orm.aibot.AgentUsage.create({
    organizationId: chatbot.organizationId,
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
