import { db } from "./db";
import type { AuthUser } from "../auth";
import type { PublicIdSlot } from "../../types/entities";
import { generatePublicId, idList, jsonb, record } from "../utils";
import { ToolSetFactoryRegistry } from "../features/toolsets";
import { logAuditEvent } from "../logger/audit-logger";

type ToolSetContextEntry = {
  toolSetName: string;
  context: Record<string, unknown>;
};

function positiveId(value: unknown): number {
  const id =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(id) || id < 1) throw new Error();
  return id;
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
  const bots = await db.orm.aibot.ChatBot.where({
    ownerId: user.id,
  })
    .include("agent")
    .include("adapters", (links) =>
      links.include("adapter", (adapter) => adapter.include("publicIds")),
    )
    .include("mcpServers", (links) => links.include("mcpServer"))
    .include("publicIds")
    .orderBy((bot) => bot.updatedAt.desc())
    .all();
  const agents = await db.orm.aibot.AgentDefinition.include("chatbot")
    .include("provider")
    .all();
  const adapters = await db.orm.aibot.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  const mcpServers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const [sandboxes, sandboxLinks, toolSetContexts, authentications] =
    await Promise.all([
      db.orm.aibot.Sandbox.where({ ownerId: user.id }).all(),
      db.orm.aibot.ChatBotToolSandbox.all(),
      db.orm.aibot.ChatBotToolSetContext.all(),
      db.orm.aibot.OAuthAuthentication.where({ ownerId: user.id }).all(),
    ]);
  const toolSetRegistry = new ToolSetFactoryRegistry(user.id);
  const toolSetSchemas = await toolSetRegistry.listToolSetSchemas();
  return {
    records: bots.map((bot) =>
      record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: bot.agent?.name ?? "—",
        agentId: bot.agentId ?? "",
        adapterIds: bot.adapters.map((link) => link.adapterId).join(","),
        mcpConnections: JSON.stringify(
          bot.mcpServers.map((link) => ({
            serverId: link.mcpServerId,
            authId: link.authId,
          })),
        ),
        mcpServerIds: bot.mcpServers.map((link) => link.mcpServerId).join(","),
        mcpAuthIds: JSON.stringify(
          Object.fromEntries(
            bot.mcpServers.flatMap((link) =>
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
          bot.publicIds.map(({ slot, id }) => ({ slot, id })),
        ),
        toolsets:
          toolSetContexts
            .filter((context) => context.chatbotId === bot.id)
            .map((context) => context.toolSetName)
            .join("、") || "—",
        adapters:
          bot.adapters
            .map((link) => link.adapter?.name)
            .filter((name): name is string => Boolean(name))
            .join("、") || "—",
        webhooks: JSON.stringify(
          bot.adapters.flatMap((link) => {
            const adapter = link.adapter;
            if (!adapter) return [];
            return bot.publicIds.flatMap((botPublicId) =>
              adapter.publicIds.map((adapterPublicId) => ({
                adapterName: `${adapter.name} (${botPublicId.slot}/${adapterPublicId.slot})`,
                url: new URL(
                  `/api/webhooks/${botPublicId.id}/${adapterPublicId.id}`,
                  publicOrigin,
                ).toString(),
              })),
            );
          }),
        ),
        status: bot.isEnabled ? "稼働中" : "停止中",
      }),
    ),
    agentOptions: agents
      .filter(
        (agent) =>
          agent.provider.ownerId === user.id &&
          (!agent.chatbot ||
            (agent.chatbot.ownerId === user.id &&
              bots.some((bot) => bot.id === agent.chatbot!.id))),
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
  id: number | null,
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
  const agentId = agentValue ? Number(agentValue) : null;
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
  let mcpConnections: { serverId: number; authId: number | null }[];
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
    return { error: "MCP接続の設定形式を確認してください。" };
  }
  const mcpServerIds = mcpConnections.map(({ serverId }) => serverId);
  const sandboxIdRaw = values.get("sandboxId")?.toString() ?? null;
  const sandboxId = sandboxIdRaw !== null ? Number(sandboxIdRaw) : null;
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
    return { error: "ToolSet context は有効な配列で入力してください。" };
  }
  const toolSetRegistry = new ToolSetFactoryRegistry(user.id);
  const supportedToolSetNames = await toolSetRegistry.listToolSetNames();
  if (
    toolSetContexts.some(
      ({ toolSetName }) => !supportedToolSetNames.includes(toolSetName),
    )
  )
    return {
      error: `利用できないToolSet名が含まれています。利用可能: ${supportedToolSetNames.join("、") || "なし"}`,
    };
  if (!name) return { error: "ボット名を入力してください。" };
  if (agentId !== null && !Number.isInteger(agentId))
    return { error: "エージェントを選択してください。" };
  if (agentId !== null) {
    const agent = await db.orm.aibot.AgentDefinition.where({ id: agentId })
      .include("provider")
      .first();
    if (!agent || agent.provider.ownerId !== user.id)
      return { error: "選択したエージェントが見つかりません。" };
  }
  if (agentId !== null) {
    const assignedBot = await db.orm.aibot.ChatBot.first({ agentId });
    if (
      assignedBot &&
      (assignedBot.ownerId !== user.id || assignedBot.id !== id)
    )
      return { error: "選択したエージェントは別のボットで使用されています。" };
  }
  const adapters = await db.orm.aibot.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  const allowedAdapterIds = new Set(adapters.map((adapter) => adapter.id));
  if (adapterIds.some((adapterId) => !allowedAdapterIds.has(adapterId))) {
    return { error: "選択したアダプタを使用できません。" };
  }
  const mcpServers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const allowedMcpServerIds = new Set(mcpServers.map((data) => data.id));
  if (mcpServerIds.some((id) => !allowedMcpServerIds.has(id))) {
    return { error: "選択したMCPサーバーを使用できません。" };
  }
  const mcpConnectionKeys = mcpConnections.map(
    ({ serverId, authId }) => `${serverId}:${authId ?? "none"}`,
  );
  if (new Set(mcpConnectionKeys).size !== mcpConnectionKeys.length)
    return { error: "同じMCPサーバーとOAuth認証の接続は重複できません。" };
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    ownerId: user.id,
  }).all();
  const allowedAuthenticationIds = new Set(
    authentications.map((authentication) => authentication.id),
  );
  if (
    mcpConnections.some(
      ({ authId }) => authId !== null && !allowedAuthenticationIds.has(authId),
    )
  )
    return {
      error:
        "MCP OAuth認証には選択済みサーバーと自分の認証情報を指定してください。",
    };
  const ownedSandboxes = await db.orm.aibot.Sandbox.where({
    ownerId: user.id,
  }).all();
  const allowedSandboxIds = new Set(
    ownedSandboxes.map((sandbox) => sandbox.id),
  );
  if (sandboxId !== null && !allowedSandboxIds.has(sandboxId))
    return { error: "選択したサンドボックスを使用できません。" };
  const toolSetContextKeys = toolSetContexts.map(({ toolSetName, context }) =>
    JSON.stringify([toolSetName, stableJson(context)]),
  );
  if (new Set(toolSetContextKeys).size !== toolSetContextKeys.length)
    return { error: "同じToolSet名とcontextの組み合わせは重複できません。" };
  for (const { toolSetName, context } of toolSetContexts) {
    const isValidContext = await toolSetRegistry.validateToolSetContext(
      toolSetName,
      context,
    );
    if (!isValidContext)
      return {
        error: `${toolSetName}: ToolSet context の設定を確認してください。`,
      };
  }
  if (
    id !== null &&
    !(await db.orm.aibot.ChatBot.first({ id, ownerId: user.id }))
  )
    return { error: "ボットが見つかりません。" };

  const botId = await db.transaction(async (tx) => {
    let botId = id;
    if (botId === null) {
      const created = await tx.orm.aibot.ChatBot.create({
        name,
        description: description || null,
        instruction: instruction,
        lookbackMessages: lookbackMessages,
        onFailedMessage: onFailedMessage,
        agentId,
        ownerId: user.id,
      });
      botId = created.id;
      for (const slot of ["first", "second"] as const) {
        await tx.orm.aibot.ChatBotPublicId.create({
          id: generatePublicId(),
          slot,
          chatbotId: botId,
        });
      }
    } else {
      await tx.orm.aibot.ChatBot.where({ id: botId, ownerId: user.id }).update({
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
        chatbotId: botId!,
        adapterId,
      });
    }
    await tx.orm.aibot.ChatBotMcpServer.where({ chatbotId: botId! }).delete();
    for (const { serverId, authId } of mcpConnections) {
      await tx.orm.aibot.ChatBotMcpServer.create({
        chatbotId: botId!,
        mcpServerId: serverId,
        authId,
      });
    }
    await tx.orm.aibot.ChatBotToolSandbox.where({ chatbotId: botId! }).delete();
    if (sandboxId !== null) {
      await tx.orm.aibot.ChatBotToolSandbox.create({
        chatbotId: botId!,
        sandboxId,
      });
    }
    await tx.orm.aibot.ChatBotToolSetContext.where({
      chatbotId: botId!,
    }).delete();
    for (const { toolSetName, context } of toolSetContexts)
      await tx.orm.aibot.ChatBotToolSetContext.create({
        chatbotId: botId!,
        toolSetName,
        toolSetContext: jsonb(context),
      });
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

export async function deleteBot(user: AuthUser, id: number) {
  const bot = await db.orm.aibot.ChatBot.first({ id, ownerId: user.id });
  if (!bot) return false;
  await db.orm.aibot.ChatBot.where({ id, ownerId: user.id }).delete();
  logAuditEvent("bot.deleted", "bot", id, user.id);
  return true;
}

export async function regenerateBotPublicIds(
  user: AuthUser,
  id: number,
  slot: PublicIdSlot,
) {
  const regenerated = await db.transaction(async (tx) => {
    const bot = await tx.orm.aibot.ChatBot.first({ id, ownerId: user.id });
    if (!bot) return false;

    const publicIds = await tx.orm.aibot.ChatBotPublicId.where({
      chatbotId: id,
    }).all();
    const publicId = publicIds.find((item) => item.slot === slot);
    if (publicId) {
      await tx.orm.aibot.ChatBotPublicId.where({ id: publicId.id }).update({
        id: generatePublicId(),
      });
    } else {
      await tx.orm.aibot.ChatBotPublicId.create({
        id: generatePublicId(),
        slot,
        chatbotId: id,
      });
    }
    return true;
  });
  if (regenerated)
    logAuditEvent(
      "bot.public_id.regenerated",
      "bot",
      id,
      user.id,
    );
  return regenerated;
}

export async function setBotEnabled(
  user: AuthUser,
  id: number,
  isEnabled: boolean,
) {
  if (!(await db.orm.aibot.ChatBot.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.ChatBot.where({ id, ownerId: user.id }).update({
    isEnabled,
  });
  logAuditEvent(
    isEnabled ? "bot.enabled" : "bot.disabled",
    "bot",
    id,
    user.id,
  );
  return true;
}

export async function getAvailableBot(botId: number) {
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
    id: publicId,
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
