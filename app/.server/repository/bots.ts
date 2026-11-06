import { db } from "./db";
import type { AuthUser } from "../auth";
import type { PublicIdSlot } from "../../types/entities";
import { generatePublicId, generateResourceId, idList, isUuid, jsonb, record } from "../utils";
import { ToolSetFactoryRegistry } from "../features/toolsets";
import { logAuditEvent } from "../logger/audit-logger";
import { localizedMessage } from "../../i18n";
import { filterResourcesByRole, grantResourceRole, hasResourceAccess } from "../authorization";

type ToolSetContextEntry = {
  toolSetName: string;
  context: Record<string, unknown>;
};

function positiveId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) throw new Error();
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function listBots(user: AuthUser, publicOrigin: string) {
  const bots = await filterResourcesByRole(user, await db.orm.aibot.ChatBot.where({
    organizationId: user.organizationId,
  })
    .include("agent")
    .include("adapters", (links) =>
      links.include("adapter", (adapter) => adapter.include("publicIds")),
    )
    .include("mcpServers", (links) => links.include("mcpServer"))
    .include("publicIds")
    .orderBy((bot) => bot.updatedAt.desc())
    .all());
  const agents = await filterResourcesByRole(user, await db.orm.aibot.AgentDefinition.where({ organizationId: user.organizationId }).include("chatbots")
    .include("provider")
    .all());
  const adapters = await filterResourcesByRole(user, await db.orm.aibot.ChatAdapter.where({ organizationId: user.organizationId }).all());
  const mcpServers = await filterResourcesByRole(user, await db.orm.aibot.McpServer.where({ organizationId: user.organizationId }).all());
  const [sandboxRows, sandboxLinks, contextRows, authRows] =
    await Promise.all([
      db.orm.aibot.Sandbox.where({ organizationId: user.organizationId }).all(),
      db.orm.aibot.ChatBotToolSandbox.all(),
      db.orm.aibot.ChatBotToolSetContext.all(),
      db.orm.aibot.OAuthAuthentication.where({ organizationId: user.organizationId }).all(),
    ]);
  const [sandboxes, toolSetContexts, authentications] = await Promise.all([
    filterResourcesByRole(user, sandboxRows),
    filterResourcesByRole(user, contextRows),
    filterResourcesByRole(user, authRows),
  ]);
  const toolSetRegistry = new ToolSetFactoryRegistry(user.organizationId, user.id);
  const toolSetSchemas = await toolSetRegistry.listToolSetSchemas();
  return {
    records: bots.map((bot) => {
      const visibleAdapterLinks = bot.adapters.filter(
        (link) => link.adapter && adapters.some((adapter) => adapter.id === link.adapterId),
      );
      const visibleMcpLinks = bot.mcpServers.filter(
        (link) => mcpServers.some((server) => server.id === link.mcpServerId) &&
          (link.authId === null || authentications.some((auth) => auth.id === link.authId)),
      );
      const visibleAgent = bot.agent && agents.some((agent) => agent.id === bot.agentId) ? bot.agent : null;
      return record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: visibleAgent?.name ?? "—",
        agentId: visibleAgent ? (bot.agentId ?? "") : "",
        adapterIds: visibleAdapterLinks.map((link) => link.adapterId).join(","),
        mcpConnections: JSON.stringify(
          visibleMcpLinks.map((link) => ({
            serverId: link.mcpServerId,
            authId: link.authId,
          })),
        ),
        mcpServerIds: visibleMcpLinks.map((link) => link.mcpServerId).join(","),
        mcpAuthIds: JSON.stringify(
          Object.fromEntries(
            visibleMcpLinks.flatMap((link) =>
              link.authId === null
                ? []
                : [[String(link.mcpServerId), String(link.authId)]],
            ),
          ),
        ),
        instruction: bot.instruction,
        lookbackMessages: bot.lookbackMessages,
        onFailedMessage: bot.onFailedMessage,
        sandboxId: sandboxLinks
          .filter(
            (link) =>
              link.chatbotId === bot.id &&
              sandboxes.some((sandbox) => sandbox.id === link.sandboxId),
          )
          .map((link) => link.sandboxId)
          .join(","),
        sandboxes:
          sandboxLinks
            .filter((link) => link.chatbotId === bot.id)
            .map(
              (link) =>
                sandboxes.find((sandbox) => sandbox.id === link.sandboxId)
                  ?.sandboxType,
            )
            .filter(Boolean)
            .join("、") || "—",
        toolSetContexts: JSON.stringify(
          toolSetContexts
            .filter((context) => context.chatbotId === bot.id)
            .map((context) => ({
              toolSetName: context.toolSetName,
              context: context.toolSetContext ?? {},
            })),
          null,
          2,
        ),
        publicIds: JSON.stringify(
          bot.publicIds.map(({ slot, publicId }) => ({ slot, id: publicId })),
        ),
        toolsets:
          toolSetContexts
            .filter((context) => context.chatbotId === bot.id)
            .map((context) => context.toolSetName)
            .join("、") || "—",
        adapters:
          visibleAdapterLinks
            .map((link) => link.adapter?.name)
            .filter((name): name is string => Boolean(name))
            .join("、") || "—",
        webhooks: JSON.stringify(
          visibleAdapterLinks.flatMap((link) => {
            const adapter = link.adapter;
            if (!adapter) return [];
            return bot.publicIds.flatMap((botPublicId) =>
              adapter.publicIds.map((adapterPublicId) => ({
                adapterName: `${adapter.name} (${botPublicId.slot}/${adapterPublicId.slot})`,
                url: new URL(
                  `/api/webhooks/${botPublicId.publicId}/${adapterPublicId.publicId}`,
                  publicOrigin,
                ).toString(),
              })),
            );
          }),
        ),
        status: bot.isEnabled ? "server.active" : "server.inactive",
      });
    }),
    agentOptions: agents
      .filter(
        (agent) =>
          agent.provider.organizationId === user.organizationId &&
          (agent.chatbots.length === 0 ||
            bots.some((bot) => agent.chatbots.some((item) => item.id === bot.id))),
      )
      .map((agent) => ({ label: agent.name, value: String(agent.id) })),
    adapterOptions: adapters.map((adapter) => ({
      label: adapter.name,
      value: String(adapter.id),
    })),
    mcpServerOptions: mcpServers.map((mcpServer) => ({
      label: mcpServer.name,
      value: String(mcpServer.id),
    })),
    mcpAuthenticationOptions: authentications.map((authentication) => ({
      label: authentication.name,
      value: String(authentication.id),
    })),
    sandboxOptions: sandboxes.map((sandbox) => ({
      label: `${sandbox.sandboxType} (${sandbox.sandboxScope})`,
      value: String(sandbox.id),
    })),
    toolSetSchemas: toolSetSchemas,
  };
}

export async function saveBot(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const instruction = String(values.get("instruction") ?? "").trim();
  const onFailedMessage = String(values.get("onFailedMessage") ?? "").trim();
  const lookbackMessages = Number(
    String(values.get("lookbackMessages") ?? "").trim(),
  );
  const agentValue = String(values.get("agentId") ?? "").trim();
  const agentId = agentValue || null;
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
  let mcpConnections: { serverId: string; authId: string | null }[];
  try {
    const rawConnections = values.get("mcpConnections");
    if (rawConnections !== null) {
      const parsed: unknown = JSON.parse(String(rawConnections));
      if (!Array.isArray(parsed)) throw new Error();
      mcpConnections = parsed.map((connection) => {
        if (
          !connection ||
          typeof connection !== "object" ||
          Array.isArray(connection) ||
          !("serverId" in connection)
        )
          throw new Error();
        const parsedServerId = positiveId(connection.serverId);
        const parsedAuthId =
          !("authId" in connection) ||
          connection.authId === null ||
          connection.authId === undefined
            ? null
            : positiveId(connection.authId);
        return { serverId: parsedServerId, authId: parsedAuthId };
      });
    } else {
      const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
      const parsedAuthIds: unknown = JSON.parse(
        String(values.get("mcpAuthIds") ?? "{}"),
      );
      if (
        !parsedAuthIds ||
        typeof parsedAuthIds !== "object" ||
        Array.isArray(parsedAuthIds)
      )
        throw new Error();
      const authIds = Object.fromEntries(
        Object.entries(parsedAuthIds).map(([serverId, authId]) => {
          positiveId(serverId);
          return [serverId, positiveId(authId)];
        }),
      );
      mcpConnections = serverIds.map((serverId) => ({
        serverId,
        authId: authIds[String(serverId)] ?? null,
      }));
    }
  } catch {
    return { error: "server.invalidMcpConnectionSettings" };
  }
  const mcpServerIds = mcpConnections.map(({ serverId }) => serverId);
  const sandboxIdRaw = values.get("sandboxId")?.toString() ?? null;
  const sandboxId = sandboxIdRaw || null;
  let toolSetContexts: ToolSetContextEntry[];
  try {
    const parsed: unknown = JSON.parse(
      String(values.get("toolSetContexts") ?? "[]").trim() || "[]",
    );
    if (Array.isArray(parsed)) {
      toolSetContexts = parsed.map((entry) => {
        if (
          !entry ||
          typeof entry !== "object" ||
          !("toolSetName" in entry) ||
          typeof entry.toolSetName !== "string" ||
          !("context" in entry) ||
          !entry.context ||
          typeof entry.context !== "object" ||
          Array.isArray(entry.context)
        )
          throw new Error();
        return {
          toolSetName: entry.toolSetName,
          context: entry.context as Record<string, unknown>,
        };
      });
    } else if (parsed && typeof parsed === "object") {
      toolSetContexts = Object.entries(parsed).map(([toolSetName, context]) => {
        if (!context || typeof context !== "object" || Array.isArray(context))
          throw new Error();
        return {
          toolSetName,
          context: context as Record<string, unknown>,
        };
      });
    } else {
      throw new Error();
    }
  } catch {
    return { error: "server.toolsetContextMustBeArray" };
  }
  const toolSetRegistry = new ToolSetFactoryRegistry(user.organizationId, user.id);
  const supportedToolSetNames = await toolSetRegistry.listToolSetNames();
  if (
    toolSetContexts.some(
      ({ toolSetName }) => !supportedToolSetNames.includes(toolSetName),
    )
  )
    return {
      error: localizedMessage("server.unavailableToolsetNames", {
        0: supportedToolSetNames.join("、") || "なし",
      }),
    };
  if (!name) return { error: "server.botNameRequired" };
  if (agentId !== null && !isUuid(agentId))
    return { error: "server.agentRequired" };
  if (agentId !== null) {
    const agent = await db.orm.aibot.AgentDefinition.where({ id: agentId })
      .include("provider")
      .first();
    if (!agent || agent.provider.organizationId !== user.organizationId ||
      !(await hasResourceAccess(user, agentId, "read")))
      return { error: "server.selectedAgentNotFound" };
  }
  if (agentId !== null) {
    const assignedBot = await db.orm.aibot.ChatBot.first({ agentId });
    if (
      assignedBot &&
      (assignedBot.organizationId !== user.organizationId || assignedBot.id !== id)
    )
      return { error: "server.selectedAgentAlreadyUsed" };
  }
  const adapters = await db.orm.aibot.ChatAdapter.where({
    organizationId: user.organizationId,
  }).all();
  const allowedAdapterIds = new Set(adapters.map((adapter) => adapter.id));
  if (adapterIds.some((adapterId) => !allowedAdapterIds.has(adapterId)) ||
    (await Promise.all(adapterIds.map((resourceId) => hasResourceAccess(user, resourceId, "read")))).some((allowed) => !allowed)) {
    return { error: "server.selectedAdapterUnavailable" };
  }
  const mcpServers = await db.orm.aibot.McpServer.where({
    organizationId: user.organizationId,
  }).all();
  const allowedMcpServerIds = new Set(mcpServers.map((data) => data.id));
  if (mcpServerIds.some((id) => !allowedMcpServerIds.has(id)) ||
    (await Promise.all(mcpServerIds.map((resourceId) => hasResourceAccess(user, resourceId, "read")))).some((allowed) => !allowed)) {
    return { error: "server.selectedMcpServerUnavailable" };
  }
  const mcpConnectionKeys = mcpConnections.map(
    ({ serverId, authId }) => `${serverId}:${authId ?? "none"}`,
  );
  if (new Set(mcpConnectionKeys).size !== mcpConnectionKeys.length)
    return { error: "server.duplicateMcpOauthConnection" };
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    organizationId: user.organizationId,
  }).all();
  const allowedAuthenticationIds = new Set(
    authentications.map((authentication) => authentication.id),
  );
  if (
    mcpConnections.some(
      ({ authId }) => authId !== null && !allowedAuthenticationIds.has(authId),
    ) || (await Promise.all(mcpConnections.flatMap(({ authId }) => authId ? [hasResourceAccess(user, authId, "read")] : []))).some((allowed) => !allowed)
  )
    return {
      error: "server.mcpOauthRequiresSelectedServerAndOwnCredentials",
    };
  const ownedSandboxes = await db.orm.aibot.Sandbox.where({
    organizationId: user.organizationId,
  }).all();
  const allowedSandboxIds = new Set(
    ownedSandboxes.map((sandbox) => sandbox.id),
  );
  if (sandboxId !== null && (!isUuid(sandboxId) || !allowedSandboxIds.has(sandboxId) || !(await hasResourceAccess(user, sandboxId, "read"))))
    return { error: "server.selectedSandboxUnavailable" };
  const toolSetContextKeys = toolSetContexts.map(({ toolSetName, context }) =>
    JSON.stringify([toolSetName, stableJson(context)]),
  );
  if (new Set(toolSetContextKeys).size !== toolSetContextKeys.length)
    return { error: "server.duplicateToolsetContext" };
  for (const { toolSetName, context } of toolSetContexts) {
    const isValidContext = await toolSetRegistry.validateToolSetContext(
      toolSetName,
      context,
    );
    if (!isValidContext)
      return {
        error: localizedMessage("server.invalidToolsetContextForItem", {
          0: toolSetName,
        }),
      };
  }
  if (
    id !== null &&
    (!(await db.orm.aibot.ChatBot.first({ id, organizationId: user.organizationId })) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.botNotFound" };

  const botId = await db.transaction(async (tx) => {
    let botId = id;
    if (botId === null) {
      const created = await tx.orm.aibot.ChatBot.create({
        id: generateResourceId(),
        name,
        description: description || null,
        instruction: instruction,
        lookbackMessages: lookbackMessages,
        onFailedMessage: onFailedMessage,
        agentId,
        organizationId: user.organizationId,
      });
      botId = created.id;
      for (const slot of ["first", "second"] as const) {
        await tx.orm.aibot.ChatBotPublicId.create({
          organizationId: user.organizationId,
          publicId: generatePublicId(),
          slot,
          chatbotId: botId,
        });
      }
    } else {
      await tx.orm.aibot.ChatBot.where({ id: botId, organizationId: user.organizationId }).update({
        name,
        description: description || null,
        instruction: instruction,
        onFailedMessage: onFailedMessage,
        lookbackMessages: lookbackMessages,
        agentId,
      });
    }
    await tx.orm.aibot.ChatBotAdapter.where({ chatbotId: botId! }).delete();
    for (const adapterId of adapterIds) {
      await tx.orm.aibot.ChatBotAdapter.create({
        organizationId: user.organizationId,
        chatbotId: botId!,
        adapterId,
      });
    }
    await tx.orm.aibot.ChatBotMcpServer.where({ chatbotId: botId! }).delete();
    for (const { serverId, authId } of mcpConnections) {
      await tx.orm.aibot.ChatBotMcpServer.create({
        organizationId: user.organizationId,
        chatbotId: botId!,
        mcpServerId: serverId,
        authId,
      });
    }
    await tx.orm.aibot.ChatBotToolSandbox.where({ chatbotId: botId! }).delete();
    if (sandboxId !== null) {
      await tx.orm.aibot.ChatBotToolSandbox.create({
        organizationId: user.organizationId,
        chatbotId: botId!,
        sandboxId,
      });
    }
    await tx.orm.aibot.ChatBotToolSetContext.where({
      chatbotId: botId!,
    }).delete();
    for (const { toolSetName, context } of toolSetContexts) {
      const contextId = generateResourceId();
      await tx.orm.aibot.ChatBotToolSetContext.create({
        id: contextId,
        name: `${toolSetName} ${contextId}`,
        organizationId: user.organizationId,
        chatbotId: botId!,
        toolSetName,
        toolSetContext: jsonb(context),
      });
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: contextId,
        role: "manager",
        grantedById: user.id,
      });
    }
    return botId;
  });
  if (id === null) await grantResourceRole(user, botId, "manager");
  logAuditEvent(
    id === null ? "bot.created" : "bot.updated",
    "bot",
    botId,
    user.id,
  );
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: string) {
  const bot = await db.orm.aibot.ChatBot.first({ id, organizationId: user.organizationId });
  if (!bot || !(await hasResourceAccess(user, id, "delete"))) return false;
  await db.orm.aibot.ChatBot.where({ id, organizationId: user.organizationId }).delete();
  logAuditEvent("bot.deleted", "bot", id, user.id);
  return true;
}

export async function regenerateBotPublicIds(
  user: AuthUser,
  id: string,
  slot: PublicIdSlot,
) {
  const regenerated = await db.transaction(async (tx) => {
    const bot = await tx.orm.aibot.ChatBot.first({ id, organizationId: user.organizationId });
    if (!bot || !(await hasResourceAccess(user, id, "manageGrant"))) return false;

    const publicIds = await tx.orm.aibot.ChatBotPublicId.where({
      chatbotId: id,
    }).all();
    const publicId = publicIds.find((item) => item.slot === slot);
    if (publicId) {
      await tx.orm.aibot.ChatBotPublicId.where({ id: publicId.id }).update({
        publicId: generatePublicId(),
      });
    } else {
      await tx.orm.aibot.ChatBotPublicId.create({
        organizationId: user.organizationId,
        publicId: generatePublicId(),
        slot,
        chatbotId: id,
      });
    }
    return true;
  });
  if (regenerated)
    logAuditEvent("bot.public_id.regenerated", "bot", id, user.id);
  return regenerated;
}

export async function setBotEnabled(
  user: AuthUser,
  id: string,
  isEnabled: boolean,
) {
  if (!(await db.orm.aibot.ChatBot.first({ id, organizationId: user.organizationId })) ||
    !(await hasResourceAccess(user, id, "update")))
    return false;
  await db.orm.aibot.ChatBot.where({ id, organizationId: user.organizationId }).update({
    isEnabled,
  });
  logAuditEvent(isEnabled ? "bot.enabled" : "bot.disabled", "bot", id, user.id);
  return true;
}

export async function getAvailableBot(botId: string) {
  const chatbot = await db.orm.aibot.ChatBot.where({
    id: botId,
    isEnabled: true,
  })
    .include("agent", (agent) => agent.include("provider"))
    .include("mcpServers", (server) =>
      server.include("mcpServer").include("authentication"),
    )
    .include("toolSets")
    .first();
  return chatbot;
}

export async function getAvailableBotByPublicId(publicId: string) {
  const botPublicId = await db.orm.aibot.ChatBotPublicId.where({
    publicId,
  }).first();
  if (!botPublicId) return null;

  const chatbot = await db.orm.aibot.ChatBot.where({
    id: botPublicId.chatbotId,
    isEnabled: true,
  })
    .include("adapters", (links) =>
      links.include("adapter", (adapter) => adapter.include("publicIds")),
    )
    .first();
  return chatbot;
}
