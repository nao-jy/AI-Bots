import { db } from "./db";
import type { AuthUser } from "../auth";
import type { PublicIdSlot } from "../../types/entities";
import { generatePublicId, idList, jsonb, record } from "../utils";
import {
  listToolSetNames,
  listToolSetSchemas,
  validateToolSetContext,
} from "../features/toolsets";

export async function listBots(user: AuthUser, publicOrigin: string) {
  const bots = await db.orm.aibot.ChatBot.where({
    ownerId: user.id,
    isDeleted: false,
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
  return {
    records: bots.map((bot) =>
      record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: bot.agent?.name ?? "—",
        agentId: bot.agentId ?? "",
        adapterIds: bot.adapters.map((link) => link.adapterId).join(","),
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
          Object.fromEntries(
            toolSetContexts
              .filter((context) => context.chatbotId === bot.id)
              .map((context) => [
                context.toolSetName,
                context.toolSetContext ?? {},
              ]),
          ),
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
    toolSetSchemas: listToolSetSchemas(),
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
  const mcpServerIds = idList(values.get("mcpServerIds")?.toString() ?? null);
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
        const value =
          typeof authId === "number"
            ? authId
            : typeof authId === "string" && /^\d+$/.test(authId)
              ? Number(authId)
              : NaN;
        if (
          !/^\d+$/.test(serverId) ||
          !Number.isInteger(key) ||
          key < 1 ||
          !Number.isInteger(value) ||
          value < 1
        )
          throw new Error();
        return [String(key), value];
      }),
    );
  } catch {
    return { error: "MCP OAuth認証の設定形式を確認してください。" };
  }
  const sandboxIdRaw = values.get("sandboxId")?.toString() ?? null;
  const sandboxId = sandboxIdRaw !== null ? Number(sandboxIdRaw) : null;
  let toolSetContexts: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(
      String(values.get("toolSetContexts") ?? "{}").trim() || "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    toolSetContexts = parsed as Record<string, unknown>;
  } catch {
    return { error: "ToolSet context はJSONオブジェクトで入力してください。" };
  }
  const supportedToolSetNames = listToolSetNames();
  if (
    Object.keys(toolSetContexts).some(
      (name) => !supportedToolSetNames.includes(name),
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
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    ownerId: user.id,
  }).all();
  const allowedAuthenticationIds = new Set(
    authentications.map((authentication) => authentication.id),
  );
  if (
    Object.values(mcpAuthIds).some(
      (authId) => !allowedAuthenticationIds.has(authId),
    ) ||
    Object.keys(mcpAuthIds).some(
      (serverId) => !mcpServerIds.includes(Number(serverId)),
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
  for (const [toolSetName, toolSetContext] of Object.entries(toolSetContexts))
    if (
      !toolSetContext ||
      typeof toolSetContext !== "object" ||
      Array.isArray(toolSetContext)
    )
      return {
        error: `${toolSetName} ToolSet context はJSONオブジェクトで入力してください。`,
      };
    else {
      const validationError = validateToolSetContext(
        toolSetName,
        toolSetContext,
      );
      if (validationError)
        return { error: `${toolSetName}: ${validationError}` };
    }
  if (
    id !== null &&
    !(await db.orm.aibot.ChatBot.first({ id, ownerId: user.id }))
  )
    return { error: "ボットが見つかりません。" };

  await db.transaction(async (tx) => {
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
    for (const mcpServerId of mcpServerIds) {
      await tx.orm.aibot.ChatBotMcpServer.create({
        chatbotId: botId!,
        mcpServerId,
        authId: mcpAuthIds[String(mcpServerId)] ?? null,
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
    for (const [toolSetName, toolSetContext] of Object.entries(toolSetContexts))
      await tx.orm.aibot.ChatBotToolSetContext.create({
        chatbotId: botId!,
        toolSetName,
        toolSetContext: jsonb(toolSetContext),
      });
  });
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: number) {
  const bot = await db.orm.aibot.ChatBot.first({ id, ownerId: user.id });
  if (!bot) return false;
  await db.orm.aibot.ChatBot.where({ id, ownerId: user.id }).update({
    isDeleted: true,
  });
  return true;
}

export async function regenerateBotPublicIds(
  user: AuthUser,
  id: number,
  slot: PublicIdSlot,
) {
  return db.transaction(async (tx) => {
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
  return true;
}

export async function getAvailableBot(botId: number) {
  const chatbot = await db.orm.aibot.ChatBot.where({
    id: botId,
    isEnabled: true,
  })
    .include("agent", (agent) => agent.include("provider"))
    .include("mcpServers", (server) => server.include("mcpServer"))
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
