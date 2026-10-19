import { db } from "./db";
import { createCipheriv, randomBytes } from "node:crypto";
import type { CodecTypes } from "../../src/prisma/contract.d.ts";
import { hashPassword, type AuthUser } from "./auth";
import type { EntityRecord } from "../types/entities";

const jsonb = (value: unknown) => value as CodecTypes["pg/jsonb@1"]["input"];

const platforms: Record<string, string> = {
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
  line: "LINE",
};

const transports: Record<string, string> = {
  "streamable-http": "Streamable HTTP",
  sse: "SSE",
  stdio: "stdio",
};

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ja-JP");
}

function idList(value: string | null) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .filter((item) => item.trim() !== "")
        .map(Number)
        .filter(Number.isInteger),
    ),
  ];
}

function record(
  id: number,
  updatedAt: string,
  fields: Record<string, string | number>,
): EntityRecord {
  return { id, updated: timestamp(updatedAt), ...fields };
}

export async function listBots(user: AuthUser) {
  const bots = await db.orm.public.Chatbot.where({ ownerId: user.id })
    .include("agent")
    .include("adapters")
    .orderBy((bot) => bot.updatedAt.desc())
    .all();
  const agents = await db.orm.public.AgentDefinition.include("chatbot").all();
  const ownedBotIds = new Set(bots.map((bot) => bot.id));
  const adapters = bots.flatMap((bot) => bot.adapters);
  return {
    records: bots.map((bot) =>
      record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: bot.agent.name,
        agentId: bot.agentId,
        adapterIds: bot.adapters.map((adapter) => adapter.id).join(","),
        adapters: bot.adapters.map((adapter) => adapter.name).join("、") || "—",
        status: bot.isEnabled ? "稼働中" : "停止中",
      }),
    ),
    agentOptions: agents
      .filter((agent) => !agent.chatbot || ownedBotIds.has(agent.chatbot.id))
      .map((agent) => ({ label: agent.name, value: String(agent.id) })),
    adapterOptions: adapters.map((adapter) => ({
      label: adapter.name,
      value: String(adapter.id),
    })),
  };
}

export async function saveBot(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const agentId = Number(values.get("agentId"));
  const isEnabled = String(values.get("status")) === "稼働中";
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
  if (!name || !Number.isInteger(agentId))
    return { error: "ボット名とエージェントを入力してください。" };
  const agent = await db.orm.public.AgentDefinition.first({ id: agentId });
  if (!agent) return { error: "選択したエージェントが見つかりません。" };
  const assignedBot = await db.orm.public.Chatbot.first({ agentId });
  if (assignedBot && assignedBot.id !== id)
    return { error: "選択したエージェントは別のボットで使用されています。" };
  const ownedBots = await db.orm.public.Chatbot.where({ ownerId: user.id })
    .include("adapters")
    .all();
  const allowedAdapterIds = new Set(
    ownedBots.flatMap((bot) => bot.adapters.map((adapter) => adapter.id)),
  );
  if (adapterIds.some((adapterId) => !allowedAdapterIds.has(adapterId))) {
    return { error: "選択したアダプタを使用できません。" };
  }
  if (id !== null && !ownedBots.some((bot) => bot.id === id))
    return { error: "ボットが見つかりません。" };
  if (
    id !== null &&
    ownedBots
      .find((bot) => bot.id === id)!
      .adapters.some((adapter) => !adapterIds.includes(adapter.id)) &&
    ownedBots.length < 2
  ) {
    return { error: "アダプタは必ずいずれかのボットに接続してください。" };
  }

  await db.transaction(async (tx) => {
    let botId = id;
    if (botId === null) {
      const created = await tx.orm.public.Chatbot.create({
        name,
        description: description || null,
        agentId,
        ownerId: user.id,
        isEnabled,
      });
      botId = created.id;
    } else {
      await tx.orm.public.Chatbot.where({ id: botId, ownerId: user.id }).update(
        {
          name,
          description: description || null,
          agentId,
          isEnabled,
        },
      );
    }
    for (const adapterId of adapterIds) {
      await tx.orm.public.ChatAdapter.where({ id: adapterId }).update({
        chatbotId: botId!,
      });
    }
    if (id !== null) {
      const fallbackBotId = ownedBots.find((bot) => bot.id !== id)?.id;
      if (fallbackBotId !== undefined) {
        for (const adapter of ownedBots.find((bot) => bot.id === id)!
          .adapters) {
          if (!adapterIds.includes(adapter.id))
            await tx.orm.public.ChatAdapter.where({ id: adapter.id }).update({
              chatbotId: fallbackBotId,
            });
        }
      }
    }
  });
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: number) {
  const bot = await db.orm.public.Chatbot.first({ id, ownerId: user.id });
  if (!bot) return false;
  await db.orm.public.Chatbot.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function listAdapters(user: AuthUser) {
  const bots = await db.orm.public.Chatbot.where({ ownerId: user.id }).all();
  const adapters = await db.orm.public.ChatAdapter.all();
  const botById = new Map(bots.map((bot) => [bot.id, bot]));
  return {
    records: adapters
      .filter((adapter) => botById.has(adapter.chatbotId))
      .map((adapter) => {
        const config = adapter.config as {
          credentialCiphertext?: string;
        } | null;
        return record(adapter.id, adapter.updatedAt, {
          name: adapter.name,
          platform: platforms[adapter.platform] ?? adapter.platform,
          platformId: adapter.platform,
          bot: botById.get(adapter.chatbotId)!.name,
          chatbotId: adapter.chatbotId,
          status: adapter.isEnabled ? "有効" : "停止中",
          credentialConfigured: config?.credentialCiphertext
            ? "設定済み"
            : "未設定",
        });
      }),
    botOptions: bots.map((bot) => ({ label: bot.name, value: String(bot.id) })),
  };
}

function encryptCredential(credential: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error(
      "認証情報を保存するには CREDENTIALS_ENCRYPTION_KEY を設定してください。",
    );
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY は32バイトのbase64値にしてください。",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export async function saveAdapter(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const platform = String(values.get("platformId") ?? "").trim();
  const chatbotId = Number(values.get("chatbotId"));
  const isEnabled = String(values.get("status")) !== "停止中";
  const credential = String(values.get("credential") ?? "").trim();
  if (!name || !platform || !Number.isInteger(chatbotId))
    return {
      error: "接続名、プラットフォーム、接続先ボットを入力してください。",
    };
  const bot = await db.orm.public.Chatbot.first({
    id: chatbotId,
    ownerId: user.id,
  });
  if (!bot) return { error: "接続先ボットが見つかりません。" };
  if (id !== null) {
    const existing = await db.orm.public.ChatAdapter.first({ id });
    const ownedBot =
      existing &&
      (await db.orm.public.Chatbot.first({
        id: existing.chatbotId,
        ownerId: user.id,
      }));
    if (!existing || !ownedBot) return { error: "アダプタが見つかりません。" };
  }
  let config: unknown = null;
  if (id !== null)
    config = (await db.orm.public.ChatAdapter.first({ id }))?.config;
  const previousConfig = config as { credentialCiphertext?: string } | null;
  try {
    config = credential
      ? {
          ...previousConfig,
          credentialCiphertext: encryptCredential(credential),
        }
      : previousConfig;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "認証情報を暗号化できませんでした。",
    };
  }
  if (id === null) {
    await db.orm.public.ChatAdapter.create({
      name,
      platform,
      chatbotId,
      isEnabled,
      config: jsonb(config),
    });
  } else {
    await db.orm.public.ChatAdapter.where({ id }).update({
      name,
      platform,
      chatbotId,
      isEnabled,
      config: jsonb(config),
    });
  }
  return { ok: true };
}

export async function deleteAdapter(user: AuthUser, id: number) {
  const adapter = await db.orm.public.ChatAdapter.first({ id });
  if (
    !adapter ||
    !(await db.orm.public.Chatbot.first({
      id: adapter.chatbotId,
      ownerId: user.id,
    }))
  )
    return false;
  await db.orm.public.ChatAdapter.where({ id }).delete();
  return true;
}

export async function listAgents(user: AuthUser) {
  const agents = await db.orm.public.AgentDefinition.include(
    "mcpServers",
    (links) => links.include("mcpServer"),
  )
    .include("chatbot")
    .all();
  const ownedBots = await db.orm.public.Chatbot.where({
    ownerId: user.id,
  }).all();
  const ownedAgentIds = new Set(ownedBots.map((bot) => bot.agentId));
  const servers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const availableServerIds = new Set(servers.map((server) => server.id));
  return {
    records: agents
      .filter((agent) => !agent.chatbot || ownedAgentIds.has(agent.id))
      .map((agent) => {
        const ownedLinks = agent.mcpServers.filter((link) =>
          availableServerIds.has(link.mcpServerId),
        );
        return record(agent.id, agent.updatedAt, {
          name: agent.name,
          provider: agent.provider,
          model: agent.model,
          mcpServerIds: ownedLinks.map((link) => link.mcpServerId).join(","),
          tools:
            ownedLinks.map((link) => link.mcpServer.name).join("、") || "—",
          prompt: agent.systemPrompt ?? "",
          temperature: agent.temperature ?? "",
          maxSteps: agent.maxSteps ?? "",
          status: agent.chatbot
            ? `ボット「${agent.chatbot.name}」で利用中`
            : "未使用",
        });
      }),
    serverOptions: servers.map((server) => ({
      label: server.name,
      value: String(server.id),
    })),
  };
}

export async function saveAgent(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const provider = String(values.get("provider") ?? "").trim();
  const model = String(values.get("model") ?? "").trim();
  const systemPrompt = String(values.get("prompt") ?? "").trim();
  const temperatureValue = String(values.get("temperature") ?? "").trim();
  const maxStepsValue = String(values.get("maxSteps") ?? "").trim();
  const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
  if (!name || !provider || !model)
    return {
      error: "エージェント名、プロバイダー、モデルを入力してください。",
    };
  const servers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const ownedBots = await db.orm.public.Chatbot.where({
    ownerId: user.id,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)))
    return { error: "選択したMCPサーバーを使用できません。" };
  if (id !== null && !(await db.orm.public.AgentDefinition.first({ id })))
    return { error: "エージェントが見つかりません。" };
  if (id !== null) {
    const assignedBot = await db.orm.public.Chatbot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "このエージェントを編集する権限がありません。" };
  }
  const temperature = temperatureValue ? Number(temperatureValue) : null;
  const maxSteps = maxStepsValue ? Number(maxStepsValue) : null;
  if (
    (temperature !== null &&
      (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) ||
    (maxSteps !== null && (!Number.isInteger(maxSteps) || maxSteps < 1))
  )
    return {
      error: "temperatureは0〜2、maxStepsは1以上の整数で入力してください。",
    };
  const valuesToSave = {
    name,
    provider,
    model,
    systemPrompt: systemPrompt || null,
    temperature,
    maxSteps,
  };
  await db.transaction(async (tx) => {
    const agentId =
      id === null
        ? (await tx.orm.public.AgentDefinition.create(valuesToSave)).id
        : id;
    if (id !== null)
      await tx.orm.public.AgentDefinition.where({ id }).update(valuesToSave);
    const links = await tx.orm.public.AgentMcpServer.where({ agentId }).all();
    for (const link of links) {
      if (!serverIds.includes(link.mcpServerId))
        await tx.orm.public.AgentMcpServer.where({
          agentId,
          mcpServerId: link.mcpServerId,
        }).delete();
    }
    for (const serverId of serverIds) {
      if (!links.some((link) => link.mcpServerId === serverId))
        await tx.orm.public.AgentMcpServer.create({
          agentId,
          mcpServerId: serverId,
          config: null,
        });
    }
  });
  return { ok: true };
}

export async function deleteAgent(user: AuthUser, id: number) {
  const agent = await db.orm.public.AgentDefinition.first({ id });
  if (!agent) return false;
  const bot = await db.orm.public.Chatbot.first({ agentId: id });
  if (bot) return false;
  const ownServers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const links = await db.orm.public.AgentMcpServer.where({ agentId: id }).all();
  if (
    links.some(
      (link) => !ownServers.some((server) => server.id === link.mcpServerId),
    )
  )
    return false;
  await db.orm.public.AgentDefinition.where({ id }).delete();
  return true;
}

export async function listMcpServers(user: AuthUser) {
  const servers = await db.orm.public.McpServer.where({ ownerId: user.id })
    .orderBy((server) => server.updatedAt.desc())
    .all();
  return {
    records: servers.map((server) => {
      const config = server.config as { tools?: string[] } | null;
      return record(server.id, server.updatedAt, {
        name: server.name,
        description: server.description ?? "",
        transport: transports[server.transport] ?? server.transport,
        transportId: server.transport,
        endpoint: server.endpoint ?? "",
        tools: config?.tools?.join(", ") ?? "",
        status: server.endpoint ? "接続先登録済み" : "接続先未設定",
      });
    }),
  };
}

export async function saveMcpServer(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const transport = String(values.get("transportId") ?? "").trim();
  const endpoint = String(values.get("endpoint") ?? "").trim();
  const tools = String(values.get("tools") ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  if (!name || !transport)
    return { error: "サーバー名とトランスポートを入力してください。" };
  if (
    id !== null &&
    !(await db.orm.public.McpServer.first({ id, ownerId: user.id }))
  )
    return { error: "MCPサーバーが見つかりません。" };
  const saved = {
    name,
    description: description || null,
    transport,
    endpoint: endpoint || null,
    config: jsonb({ tools }),
  };
  if (id === null)
    await db.orm.public.McpServer.create({ ...saved, ownerId: user.id });
  else
    await db.orm.public.McpServer.where({ id, ownerId: user.id }).update(saved);
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: number) {
  if (!(await db.orm.public.McpServer.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.McpServer.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function listUsers() {
  const users = await db.orm.public.User.orderBy((user) =>
    user.createdAt.asc(),
  ).all();
  return users.map((user) =>
    record(user.id, user.updatedAt, {
      name: user.name ?? "",
      email: user.email,
    }),
  );
}

export async function saveUser(id: number | null, values: FormData) {
  const name = String(values.get("name") ?? "").trim();
  const email = String(values.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(values.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return { error: "表示名と有効なメールアドレスを入力してください。" };
  if (id === null) {
    if (password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    await db.orm.public.User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
    });
  } else {
    if (!(await db.orm.public.User.first({ id })))
      return { error: "ユーザーが見つかりません。" };
    await db.orm.public.User.where({ id }).update({ name, email });
  }
  return { ok: true };
}

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId) return false;
  if (!(await db.orm.public.User.first({ id }))) return false;
  await db.orm.public.User.where({ id }).delete();
  return true;
}
