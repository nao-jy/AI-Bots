import { kysely } from "./kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import type { AuthUser } from "../auth";
import { generateResourceId, idList, isUuid, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { t } from "~/.server/i18n";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";
import type {
  LanguageModelUsage,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
} from "ai";

export async function listAgents(user: AuthUser, ids: string[]) {
  const agents = await filterResourcesByRole(
    user,
    await kysely.selectFrom("aibot.AgentDefinition")
      .selectAll("aibot.AgentDefinition")
      .select((eb) => [
        jsonObjectFrom(eb.selectFrom("aibot.Provider").selectAll()
          .whereRef("aibot.Provider.id", "=", "aibot.AgentDefinition.providerId")).as("provider"),
        eb.selectFrom("aibot.ChatBot").select((eb2) => eb2.fn.countAll<number>().as("count"))
          .whereRef("aibot.ChatBot.agentId", "=", "aibot.AgentDefinition.id").as("chatbotCount"),
      ])
      .where("aibot.AgentDefinition.organizationId", "=", user.organizationId)
      .where("aibot.AgentDefinition.id", "in", ids)
      .execute(),
  );
  return {
    records: await includeResourcePermissions(
      user,
      agents.map((agent) => {
        return record(agent.id, agent.updatedAt, {
          name: agent.name,
          model: agent.modelId,
          modelId: agent.modelId,
          provider: agent.provider!.name,
          providerId: agent.provider!.id,
          options: JSON.stringify(agent.options ?? {}, null, 2),
          status: Number(agent.chatbotCount) > 0
            ? t("server.usedByBot", { 0: Number(agent.chatbotCount) })
            : "server.unused",
        });
      }),
    ),
    providerOptions: (
      await filterResourcesByRole(
        user,
        await kysely.selectFrom("aibot.Provider").selectAll()
          .where("organizationId", "=", user.organizationId).execute(),
      )
    ).map((provider) => ({
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
        if (!isUuid(key) || !isUuid(value)) throw new Error();
        return [String(key), value];
      }),
    );
  } catch {
    return {
      error: "server.invalidMcpOauthConfiguration",
    };
  }
  if (!name) return { error: "server.agentNameRequired" };
  if (!isUuid(providerId) || !modelId)
    return { error: "server.providerAndModelRequired" };
  if (
    !(await kysely.selectFrom("aibot.Provider").select("id")
      .where("id", "=", providerId).where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
    !(await hasResourceAccess(user, providerId, "read"))
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
  const [servers, ownedBots] = await Promise.all([
    kysely.selectFrom("aibot.McpServer").select("id")
      .where("organizationId", "=", user.organizationId).execute(),
    kysely.selectFrom("aibot.ChatBot").select("id")
      .where("organizationId", "=", user.organizationId).execute(),
  ]);
  const allowedIds = new Set(servers.map((server) => server.id));
  if (
    serverIds.some((serverId) => !allowedIds.has(serverId)) ||
    (
      await Promise.all(
        serverIds.map((resourceId) =>
          hasResourceAccess(user, resourceId, "read"),
        ),
      )
    ).some((allowed) => !allowed)
  )
    return { error: "server.selectedMcpServerUnavailable" };
  const authentications = await kysely.selectFrom("aibot.OAuthAuthentication").select("id")
    .where("organizationId", "=", user.organizationId).execute();
  const allowedAuthIds = new Set(authentications.map((auth) => auth.id));
  if (
    Object.values(mcpAuthIds).some((authId) => !allowedAuthIds.has(authId)) ||
    (
      await Promise.all(
        Object.values(mcpAuthIds).map((authId) =>
          hasResourceAccess(user, authId, "read"),
        ),
      )
    ).some((allowed) => !allowed) ||
    Object.keys(mcpAuthIds).some((serverId) => !serverIds.includes(serverId))
  )
    return {
      error: "server.mcpOauthRequiresSelectedServerAndOwnCredentials",
    };
  if (id !== null) {
    const existing = await kysely.selectFrom("aibot.AgentDefinition")
      .innerJoin("aibot.Provider", "aibot.Provider.id", "aibot.AgentDefinition.providerId")
      .select(["aibot.Provider.organizationId"])
      .where("aibot.AgentDefinition.id", "=", id).executeTakeFirst();
    if (
      !existing ||
      existing.organizationId !== user.organizationId ||
      !(await hasResourceAccess(user, id, "update"))
    )
      return { error: "server.agentNotFound" };
  }
  if (id !== null) {
    const assignedBot = await kysely.selectFrom("aibot.ChatBot").select(["id", "organizationId"])
      .where("agentId", "=", id).executeTakeFirst();
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
  const agentId = await kysely.transaction().execute(async (tx) => {
    let agentId = id;
    if (agentId === null) {
      agentId = generateResourceId();
      await tx.insertInto("aibot.ResourceBase").values({ id: agentId, organizationId: user.organizationId }).execute();
      await tx.insertInto("aibot.AgentDefinition").values({
        ...valuesToSave, id: agentId, updatedAt: new Date(),
      }).execute();
      await tx.insertInto("aibot.Grant").values({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: agentId,
        role: "manager",
        grantedById: user.id,
        updatedAt: new Date(),
      }).execute();
    }
    if (id !== null)
      await tx.updateTable("aibot.AgentDefinition").set({ ...valuesToSave, updatedAt: new Date() })
        .where("id", "=", id).execute();
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
  const agent = await kysely.selectFrom("aibot.AgentDefinition")
    .innerJoin("aibot.Provider", "aibot.Provider.id", "aibot.AgentDefinition.providerId")
    .select(["aibot.Provider.organizationId"])
    .where("aibot.AgentDefinition.id", "=", id).executeTakeFirst();
  if (
    !agent ||
    agent.organizationId !== user.organizationId ||
    !(await hasResourceAccess(user, id, "delete"))
  )
    return false;
  const bot = await kysely.selectFrom("aibot.ChatBot").select("id").where("agentId", "=", id).executeTakeFirst();
  if (bot) return false;
  await kysely.deleteFrom("aibot.ResourceBase").where("id", "=", id).execute();
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
  const chatbot = await kysely.selectFrom("aibot.ChatBot").select("organizationId")
    .where("id", "=", chatbotId).executeTakeFirst();
  if (!chatbot) throw new Error("server.botNotFound");
  const created = await kysely.insertInto("aibot.AgentUsage").values({
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
    updatedAt: new Date(),
  }).returning("id").executeTakeFirstOrThrow();
  logAuditEvent("agent.usage_recorded", "bot", chatbotId);
  return created.id;
}
