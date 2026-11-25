import { kysely } from "./kysely";
import type { AuthUser } from "../auth";
import type { PublicIdSlot } from "../../types/entities";
import type { DataPersistenceScope } from "../features/data-persistence-scope";
import {
  generatePublicId,
  generateResourceId,
  idList,
  isUuid,
  jsonb,
  decryptMcpContext,
  encryptMcpContext,
  decryptMcpHeaders,
  record,
} from "../utils";
import {
  getMcpContextSchema,
  validateMcpContext,
} from "../features/mcp-schema";
import { logAuditEvent } from "../logger/audit-logger";
import { isDataPersistenceScope } from "../features/data-persistence-scope";
import { listOauth } from "./oauth";
import { t } from "../i18n";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";

function positiveId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error();
  return value;
}

export async function listBots(
  user: AuthUser,
  publicOrigin: string,
  ids: string[],
) {
  const rawBots = await kysely.selectFrom("aibot.ChatBot").selectAll()
    .where("organizationId", "=", user.organizationId).where("id", "in", ids)
    .orderBy("updatedAt", "desc").execute();
  const botIds = rawBots.map(({ id }) => id);
  const [agentRows, providerRows, allBotAssignments, adapterLinks, adapterRows,
    adapterPublicIds, mcpLinks, mcpServerRows, botPublicIds] = await Promise.all([
    kysely.selectFrom("aibot.AgentDefinition").selectAll().where("organizationId", "=", user.organizationId).execute(),
    kysely.selectFrom("aibot.Provider").selectAll().where("organizationId", "=", user.organizationId).execute(),
    kysely.selectFrom("aibot.ChatBot").select(["id", "agentId"]).where("organizationId", "=", user.organizationId).execute(),
    botIds.length ? kysely.selectFrom("aibot.ChatBotAdapter").selectAll().where("chatbotId", "in", botIds).execute() : [],
    kysely.selectFrom("aibot.ChatAdapter").selectAll().where("organizationId", "=", user.organizationId).execute(),
    botIds.length ? kysely.selectFrom("aibot.ChatAdapterPublicId").selectAll()
      .where("adapterId", "in", (await kysely.selectFrom("aibot.ChatBotAdapter").select("adapterId").where("chatbotId", "in", botIds).execute()).map(({ adapterId }) => adapterId)).execute() : [],
    botIds.length ? kysely.selectFrom("aibot.ChatBotMcpServer").selectAll().where("chatbotId", "in", botIds).execute() : [],
    kysely.selectFrom("aibot.McpServer").selectAll().where("organizationId", "=", user.organizationId).execute(),
    botIds.length ? kysely.selectFrom("aibot.ChatBotPublicId").selectAll().where("chatbotId", "in", botIds).execute() : [],
  ]);
  const providersById = new Map(providerRows.map((provider) => [provider.id, provider]));
  const adaptersById = new Map(adapterRows.map((adapter) => [adapter.id, adapter]));
  const publicIdsByAdapter = new Map<string, typeof adapterPublicIds>();
  for (const item of adapterPublicIds) publicIdsByAdapter.set(item.adapterId, [...(publicIdsByAdapter.get(item.adapterId) ?? []), item]);
  const mcpServersById = new Map(mcpServerRows.map((server) => [server.id, server]));
  const bots = await filterResourcesByRole(user, rawBots.map((bot) => ({
    ...bot,
    agent: bot.agentId ? agentRows.find((agent) => agent.id === bot.agentId) ?? null : null,
    adapters: adapterLinks.filter((link) => link.chatbotId === bot.id).map((link) => ({
      ...link,
      adapter: adaptersById.get(link.adapterId) ? {
        ...adaptersById.get(link.adapterId)!,
        publicIds: publicIdsByAdapter.get(link.adapterId) ?? [],
      } : null,
    })),
    mcpServers: mcpLinks.filter((link) => link.chatbotId === bot.id).map((link) => ({
      ...link,
      mcpServer: mcpServersById.get(link.mcpServerId)!,
    })),
    publicIds: botPublicIds.filter((item) => item.chatbotId === bot.id),
  })));
  const agents = await filterResourcesByRole(user, agentRows.map((agent) => ({
    ...agent,
    provider: providersById.get(agent.providerId)!,
    chatbots: allBotAssignments.filter((bot) => bot.agentId === agent.id).map(({ id }) => ({ id })),
  })));
  const adapters = await filterResourcesByRole(user, adapterRows);
  const mcpServers = await filterResourcesByRole(user, mcpServerRows);
  const [sandboxRows, sandboxLinks, authRows] = await Promise.all([
    kysely.selectFrom("aibot.Sandbox").selectAll().where("organizationId", "=", user.organizationId).execute(),
    botIds.length ? kysely.selectFrom("aibot.ChatBotToolSandbox").selectAll()
      .where("organizationId", "=", user.organizationId).where("chatbotId", "in", botIds).execute() : [],
    kysely.selectFrom("aibot.OAuthAuthentication").selectAll().where("organizationId", "=", user.organizationId).execute(),
  ]);
  const [sandboxes, authentications] = await Promise.all([
    filterResourcesByRole(user, sandboxRows),
    filterResourcesByRole(user, authRows),
  ]);
  const [fileSystems, fileSystemLinks] = await Promise.all([
    kysely.selectFrom("aibot.FileSystemAPI").selectAll().where("organizationId", "=", user.organizationId).execute(),
    botIds.length ? kysely.selectFrom("aibot.ChatBotFileSystem").selectAll()
      .where("organizationId", "=", user.organizationId).where("chatbotId", "in", botIds).execute() : [],
  ]);
  const mcpContextSchemas = await Promise.all(
    mcpServers.map(async (server) => {
      if (!server.contextEndpoint || !server.endpoint)
        return { serverId: server.id, schema: null, error: false };
      try {
        return {
          serverId: server.id,
          schema: await getMcpContextSchema(
            server.contextEndpoint,
            decryptMcpHeaders(server.headers),
            server.endpoint,
          ),
          error: false,
        };
      } catch {
        return { serverId: server.id, schema: null, error: true };
      }
    }),
  );
  const oauthClients = await listOauth(user.organizationId, user.id);
  return {
    records: await includeResourcePermissions(
      user,
      bots.map((bot) => {
        const visibleAdapterLinks = bot.adapters.filter(
          (link) =>
            link.adapter &&
            adapters.some((adapter) => adapter.id === link.adapterId),
        );
        const visibleMcpLinks = bot.mcpServers.filter(
          (link) =>
            mcpServers.some((server) => server.id === link.mcpServerId) &&
            (link.oauthClientId === null ||
              oauthClients.some(
                (client) => client.id === link.oauthClientId,
              )) &&
            (link.authId === null ||
              authentications.some((auth) => auth.id === link.authId)),
        );
        const visibleAgent =
          bot.agent && agents.some((agent) => agent.id === bot.agentId)
            ? bot.agent
            : null;
        return record(bot.id, bot.updatedAt, {
          name: bot.name,
          description: bot.description ?? "",
          agent: visibleAgent?.name ?? "—",
          agentId: visibleAgent ? (bot.agentId ?? "") : "",
          adapterIds: visibleAdapterLinks
            .map((link) => link.adapterId)
            .join(","),
          mcpConnections: JSON.stringify(
            visibleMcpLinks.map((link) => ({
              serverId: link.mcpServerId,
              authId: link.oauthClientId
                ? `thread:${link.oauthClientId}`
                : link.authId,
              context: decryptMcpContext(link.context),
            })),
          ),
          mcpServerIds: visibleMcpLinks
            .map((link) => link.mcpServerId)
            .join(","),
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
          maxAgentSteps: bot.maxAgentSteps,
          dataPersistenceScope: bot.dataPersistenceScope,
          onFailedMessage: bot.onFailedMessage,
          fileSystemId:
            fileSystemLinks.find((link) => link.chatbotId === bot.id)
              ?.sandboxId ?? "",
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
                    ?.name,
              )
              .filter(Boolean)
              .join("、") || "—",
          publicIds: JSON.stringify(
            bot.publicIds.map(({ slot, publicId }) => ({ slot, id: publicId })),
          ),
          toolsets:
            visibleMcpLinks.map((link) => link.mcpServer.name).join("、") ||
            "—",
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
    ),
    agentOptions: agents
      .filter(
        (agent) =>
          agent.provider.organizationId === user.organizationId &&
          (agent.chatbots.length === 0 ||
            bots.some((bot) =>
              agent.chatbots.some((item) => item.id === bot.id),
            )),
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
    mcpAuthenticationOptions: [
      ...authentications.map((authentication) => ({
        label: authentication.name,
        value: String(authentication.id),
      })),
      ...oauthClients.map((client) => ({
        label: t("server.threadOAuthSelection", { 0: client.name }),
        value: `thread:${client.id}`,
      })),
    ],
    fileSystemOptions: fileSystems.map((item) => ({
      label: item.name,
      value: item.id,
    })),
    sandboxOptions: sandboxes.map((sandbox) => ({
      label: sandbox.name,
      value: String(sandbox.id),
    })),
    mcpContextSchemas,
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
  const maxAgentStepsValue = String(values.get("maxAgentSteps") ?? "").trim();
  const maxAgentSteps = Number(maxAgentStepsValue);
  if (
    !maxAgentStepsValue ||
    !Number.isInteger(maxAgentSteps) ||
    maxAgentSteps < 1 ||
    maxAgentSteps > 2147483647
  )
    return { error: "server.invalidMaxAgentSteps" };
  const dataPersistenceScope = String(
    values.get("dataPersistenceScope") ?? "",
  );
  if (!isDataPersistenceScope(dataPersistenceScope))
    return { error: "server.invalidDataPersistenceScope" };
  const agentValue = String(values.get("agentId") ?? "").trim();
  const agentId = agentValue || null;
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
  let mcpConnections: {
    serverId: string;
    authId: string | null;
    context: Record<string, unknown>;
  }[];
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
            : typeof connection.authId === "string" &&
                connection.authId.startsWith("thread:")
              ? `thread:${positiveId(connection.authId.slice(7))}`
              : positiveId(connection.authId);
        const context = "context" in connection ? connection.context : {};
        if (!context || typeof context !== "object" || Array.isArray(context))
          throw new Error();
        return {
          serverId: parsedServerId,
          authId: parsedAuthId,
          context: context as Record<string, unknown>,
        };
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
        context: {},
      }));
    }
  } catch {
    return { error: "server.invalidMcpConnectionSettings" };
  }
  const mcpServerIds = mcpConnections.map(({ serverId }) => serverId);
  const fileSystemId = String(values.get("fileSystemId") ?? "") || null;
  const sandboxIdRaw = values.get("sandboxId")?.toString() ?? null;
  const sandboxId = sandboxIdRaw || null;
  if (!name) return { error: "server.botNameRequired" };
  if (agentId !== null && !isUuid(agentId))
    return { error: "server.agentRequired" };
  if (agentId !== null) {
    const agent = await kysely.selectFrom("aibot.AgentDefinition")
      .innerJoin("aibot.Provider", "aibot.Provider.id", "aibot.AgentDefinition.providerId")
      .select(["aibot.Provider.organizationId"]).where("aibot.AgentDefinition.id", "=", agentId).executeTakeFirst();
    if (
      !agent ||
      agent.organizationId !== user.organizationId ||
      !(await hasResourceAccess(user, agentId, "read"))
    )
      return { error: "server.selectedAgentNotFound" };
  }
  if (agentId !== null) {
    const assignedBot = await kysely.selectFrom("aibot.ChatBot").select(["id", "organizationId"])
      .where("agentId", "=", agentId).executeTakeFirst();
    if (
      assignedBot &&
      (assignedBot.organizationId !== user.organizationId ||
        assignedBot.id !== id)
    )
      return { error: "server.selectedAgentAlreadyUsed" };
  }
  const adapters = await kysely.selectFrom("aibot.ChatAdapter").select("id")
    .where("organizationId", "=", user.organizationId).execute();
  const allowedAdapterIds = new Set(adapters.map((adapter) => adapter.id));
  if (
    adapterIds.some((adapterId) => !allowedAdapterIds.has(adapterId)) ||
    (
      await Promise.all(
        adapterIds.map((resourceId) =>
          hasResourceAccess(user, resourceId, "read"),
        ),
      )
    ).some((allowed) => !allowed)
  ) {
    return { error: "server.selectedAdapterUnavailable" };
  }
  const mcpServers = await kysely.selectFrom("aibot.McpServer").selectAll()
    .where("organizationId", "=", user.organizationId).execute();
  const allowedMcpServerIds = new Set(mcpServers.map((data) => data.id));
  if (
    mcpServerIds.some((id) => !allowedMcpServerIds.has(id)) ||
    (
      await Promise.all(
        mcpServerIds.map((resourceId) =>
          hasResourceAccess(user, resourceId, "read"),
        ),
      )
    ).some((allowed) => !allowed)
  ) {
    return { error: "server.selectedMcpServerUnavailable" };
  }
  const mcpConnectionKeys = mcpConnections.map(
    ({ serverId, authId }) => `${serverId}:${authId ?? "none"}`,
  );
  if (new Set(mcpConnectionKeys).size !== mcpConnectionKeys.length)
    return { error: "server.duplicateMcpOauthConnection" };
  const authentications = await kysely.selectFrom("aibot.OAuthAuthentication").select("id")
    .where("organizationId", "=", user.organizationId).execute();
  const allowedAuthenticationIds = new Set(
    authentications.map((authentication) => authentication.id),
  );
  const allowedClients = new Set(
    (await listOauth(user.organizationId, user.id)).map((client) => client.id),
  );
  if (
    mcpConnections.some(
      ({ authId }) =>
        authId !== null &&
        (authId.startsWith("thread:")
          ? !allowedClients.has(authId.slice(7))
          : !allowedAuthenticationIds.has(authId)),
    ) ||
    (
      await Promise.all(
        mcpConnections.flatMap(({ authId }) =>
          authId && !authId.startsWith("thread:")
            ? [hasResourceAccess(user, authId, "read")]
            : [],
        ),
      )
    ).some((allowed) => !allowed)
  )
    return {
      error: "server.mcpOauthRequiresSelectedServerAndOwnCredentials",
    };
  const ownedSandboxes = await kysely.selectFrom("aibot.Sandbox").select("id")
    .where("organizationId", "=", user.organizationId).execute();
  const allowedSandboxIds = new Set(
    ownedSandboxes.map((sandbox) => sandbox.id),
  );
  if (
    sandboxId !== null &&
    (!isUuid(sandboxId) ||
      !allowedSandboxIds.has(sandboxId) ||
      !(await hasResourceAccess(user, sandboxId, "read")))
  )
    return { error: "server.selectedSandboxUnavailable" };
  if (
    fileSystemId &&
    (!isUuid(fileSystemId) ||
      !(await kysely.selectFrom("aibot.FileSystemAPI").select("id")
        .where("id", "=", fileSystemId).where("organizationId", "=", user.organizationId).executeTakeFirst()))
  )
    return { error: "Selected filesystem API not found" };
  for (const { serverId, context } of mcpConnections) {
    const server = mcpServers.find((item) => item.id === serverId)!;
    if (!server.contextEndpoint) {
      if (Object.keys(context).length)
        return { error: "server.mcpContextSchemaRequired" };
      continue;
    }
    try {
      if (!server.endpoint) throw new Error();
      const schema = await getMcpContextSchema(
        server.contextEndpoint,
        decryptMcpHeaders(server.headers),
        server.endpoint,
      );
      if (!validateMcpContext(schema, context))
        return { error: "server.mcpContextInvalid" };
    } catch {
      return { error: "server.mcpContextSchemaUnavailable" };
    }
  }
  if (
    id !== null &&
    (!(await kysely.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.botNotFound" };

  const botId = await kysely.transaction().execute(async (tx) => {
    let botId = id;
    if (botId === null) {
      botId = generateResourceId();
      await tx.insertInto("aibot.ResourceBase").values({ id: botId, organizationId: user.organizationId }).execute();
      const created = await tx.insertInto("aibot.ChatBot").values({
        id: botId,
        name,
        description: description || null,
        instruction: instruction,
        lookbackMessages: lookbackMessages,
        maxAgentSteps,
        dataPersistenceScope,
        onFailedMessage: onFailedMessage,
        agentId,
        organizationId: user.organizationId,
        updatedAt: new Date(),
      }).returning("id").executeTakeFirstOrThrow();
      botId = created.id;
      await tx.insertInto("aibot.Grant").values({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: botId,
        role: "manager",
        grantedById: user.id,
        updatedAt: new Date(),
      }).execute();
      for (const slot of ["first", "second"] as const) {
        await tx.insertInto("aibot.ChatBotPublicId").values({
          organizationId: user.organizationId,
          publicId: generatePublicId(),
          slot,
          chatbotId: botId,
          updatedAt: new Date(),
        }).execute();
      }
    } else {
      await tx.updateTable("aibot.ChatBot").set({
        name,
        description: description || null,
        instruction: instruction,
        onFailedMessage: onFailedMessage,
        lookbackMessages: lookbackMessages,
        maxAgentSteps,
        dataPersistenceScope,
        agentId,
        updatedAt: new Date(),
      }).where("id", "=", botId).where("organizationId", "=", user.organizationId).execute();
    }
    await tx.deleteFrom("aibot.ChatBotAdapter").where("chatbotId", "=", botId!).execute();
    for (const adapterId of adapterIds) {
      await tx.insertInto("aibot.ChatBotAdapter").values({
        organizationId: user.organizationId,
        chatbotId: botId!,
        adapterId,
        updatedAt: new Date(),
      }).execute();
    }
    await tx.deleteFrom("aibot.ChatBotMcpServer").where("chatbotId", "=", botId!).execute();
    for (const { serverId, authId, context } of mcpConnections) {
      await tx.insertInto("aibot.ChatBotMcpServer").values({
        organizationId: user.organizationId,
        chatbotId: botId!,
        mcpServerId: serverId,
        authId: authId?.startsWith("thread:") ? null : authId,
        oauthClientId: authId?.startsWith("thread:") ? authId.slice(7) : null,
        context: jsonb(encryptMcpContext(context)),
        updatedAt: new Date(),
      }).execute();
    }
    await tx.deleteFrom("aibot.ChatBotFileSystem").where("chatbotId", "=", botId!).execute();
    if (fileSystemId)
      await tx.insertInto("aibot.ChatBotFileSystem").values({
        organizationId: user.organizationId,
        chatbotId: botId!,
        sandboxId: fileSystemId,
        updatedAt: new Date(),
      }).execute();
    await tx.deleteFrom("aibot.ChatBotToolSandbox").where("chatbotId", "=", botId!).execute();
    if (sandboxId !== null) {
      await tx.insertInto("aibot.ChatBotToolSandbox").values({
        organizationId: user.organizationId,
        chatbotId: botId!,
        sandboxId,
        updatedAt: new Date(),
      }).execute();
    }
    return botId;
  });
  logAuditEvent(
    id === null ? "bot.created" : "bot.updated",
    "bot",
    botId,
    user.id,
  );
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: string) {
  const bot = await kysely.selectFrom("aibot.ChatBot").select("id")
    .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst();
  if (!bot || !(await hasResourceAccess(user, id, "delete"))) return false;
  const deleted = await kysely.transaction().execute(async (tx) => {
    const bot = await tx.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", id).where("organizationId", "=", user.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!bot) return false;
    const connections = await tx.selectFrom("aibot.ThreadOAuthConnection").select("authenticationId")
      .where("chatbotId", "=", id).where("organizationId", "=", user.organizationId).execute();
    if (connections.length) await tx.deleteFrom("aibot.ResourceBase")
      .where("id", "in", connections.map(({ authenticationId }) => authenticationId))
      .where("organizationId", "=", user.organizationId).execute();
    await tx.deleteFrom("aibot.ResourceBase").where("id", "=", id).execute();
    return true;
  });
  if (!deleted) return false;
  logAuditEvent("bot.deleted", "bot", id, user.id);
  return true;
}

export async function regenerateBotPublicIds(
  user: AuthUser,
  id: string,
  slot: PublicIdSlot,
) {
  const regenerated = await kysely.transaction().execute(async (tx) => {
    const bot = await tx.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst();
    if (!bot || !(await hasResourceAccess(user, id, "manageGrant")))
      return false;

    const publicIds = await tx.selectFrom("aibot.ChatBotPublicId").select(["id", "slot"])
      .where("chatbotId", "=", id).execute();
    const publicId = publicIds.find((item) => item.slot === slot);
    if (publicId) {
      await tx.updateTable("aibot.ChatBotPublicId").set({ publicId: generatePublicId(), updatedAt: new Date() })
        .where("id", "=", publicId.id).execute();
    } else {
      await tx.insertInto("aibot.ChatBotPublicId").values({
        organizationId: user.organizationId,
        publicId: generatePublicId(),
        slot,
        chatbotId: id,
        updatedAt: new Date(),
      }).execute();
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
  if (
    !(await kysely.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
    !(await hasResourceAccess(user, id, "update"))
  )
    return false;
  await kysely.updateTable("aibot.ChatBot").set({ isEnabled, updatedAt: new Date() })
    .where("id", "=", id).where("organizationId", "=", user.organizationId).execute();
  logAuditEvent(isEnabled ? "bot.enabled" : "bot.disabled", "bot", id, user.id);
  return true;
}

export async function getAvailableBot(botId: string) {
  const chatbot = await kysely.selectFrom("aibot.ChatBot").selectAll()
    .where("id", "=", botId).where("isEnabled", "=", true).executeTakeFirst();
  if (!chatbot) return undefined;
  const [agent, mcpLinks] = await Promise.all([
    chatbot.agentId
      ? kysely.selectFrom("aibot.AgentDefinition")
          .innerJoin("aibot.Provider", "aibot.Provider.id", "aibot.AgentDefinition.providerId")
          .selectAll("aibot.AgentDefinition")
          .select([
            "aibot.Provider.id as providerIdValue", "aibot.Provider.name as providerName",
            "aibot.Provider.organizationId as providerOrganizationId", "aibot.Provider.providerName",
            "aibot.Provider.args as providerArgs", "aibot.Provider.headers as providerHeaders",
          ])
          .where("aibot.AgentDefinition.id", "=", chatbot.agentId).executeTakeFirst()
      : undefined,
    kysely.selectFrom("aibot.ChatBotMcpServer").selectAll()
      .where("chatbotId", "=", botId).execute(),
  ]);
  const servers = mcpLinks.length
    ? await kysely.selectFrom("aibot.McpServer").selectAll()
        .where("id", "in", mcpLinks.map(({ mcpServerId }) => mcpServerId)).execute()
    : [];
  const authIds = mcpLinks.flatMap(({ authId }) => authId ? [authId] : []);
  const authentications = authIds.length
    ? await kysely.selectFrom("aibot.OAuthAuthentication").selectAll().where("id", "in", authIds).execute()
    : [];
  const serversById = new Map(servers.map((server) => [server.id, server]));
  const authById = new Map(authentications.map((auth) => [auth.id, auth]));
  return {
    ...chatbot,
    dataPersistenceScope: chatbot.dataPersistenceScope as DataPersistenceScope,
    agent: agent ? {
      id: agent.id, name: agent.name, organizationId: agent.organizationId,
      providerId: agent.providerId, modelId: agent.modelId, options: agent.options,
      provider: {
        id: agent.providerIdValue, name: agent.providerName,
        organizationId: agent.providerOrganizationId, providerName: agent.providerName,
        args: agent.providerArgs, headers: agent.providerHeaders,
      },
    } : null,
    mcpServers: mcpLinks.map((link) => ({
      ...link,
      mcpServer: serversById.get(link.mcpServerId)!,
      authentication: link.authId ? authById.get(link.authId) ?? null : null,
    })),
  };
}

export async function getAvailableBotByPublicId(publicId: string) {
  const botPublicId = await kysely.selectFrom("aibot.ChatBotPublicId").select("chatbotId")
    .where("publicId", "=", publicId).executeTakeFirst();
  if (!botPublicId) return null;

  const chatbot = await kysely.selectFrom("aibot.ChatBot").selectAll()
    .where("id", "=", botPublicId.chatbotId).where("isEnabled", "=", true).executeTakeFirst();
  if (!chatbot) return null;
  const links = await kysely.selectFrom("aibot.ChatBotAdapter").selectAll()
    .where("chatbotId", "=", chatbot.id).execute();
  const adapterIds = links.map(({ adapterId }) => adapterId);
  const adapters = adapterIds.length
    ? await kysely.selectFrom("aibot.ChatAdapter").selectAll()
        .where("id", "in", adapterIds).execute()
    : [];
  const publicIds = adapterIds.length
    ? await kysely.selectFrom("aibot.ChatAdapterPublicId").selectAll()
        .where("adapterId", "in", adapterIds).execute()
    : [];
  const publicIdsByAdapter = new Map<string, typeof publicIds>();
  for (const item of publicIds) publicIdsByAdapter.set(item.adapterId, [...(publicIdsByAdapter.get(item.adapterId) ?? []), item]);
  const adaptersById = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  return {
    ...chatbot,
    adapters: links.map((link) => ({
      ...link,
      adapter: { ...adaptersById.get(link.adapterId)!, publicIds: publicIdsByAdapter.get(link.adapterId) ?? [] },
    })),
  };
}
