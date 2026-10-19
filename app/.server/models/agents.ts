import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  authHeaders,
  decryptMcpHeaders,
  idList,
  jsonb,
  parseObject,
  providerBaseUrl,
  record,
  requestTest,
  testFailure,
  testSuccess,
} from "./entity-shared";

export async function testAgent(user: AuthUser, values: FormData) {
  try {
    const name = String(values.get("name") ?? "").trim();
    const providerId = Number(values.get("providerId"));
    const modelId = String(values.get("model_id") ?? "").trim();
    if (!Number.isInteger(providerId) || !modelId)
      return testFailure("プロバイダーとモデルIDを入力してください。");
    const provider = await db.orm.public.Provider.first({
      id: providerId,
      ownerId: user.id,
    });
    if (!provider) return testFailure("選択したプロバイダーが見つかりません。");
    const args = (
      provider.args && typeof provider.args === "object" ? provider.args : {}
    ) as Record<string, unknown>;
    const headers = decryptMcpHeaders(provider.headers);
    const options = parseObject(values.get("options"), "オプション");
    const baseUrl = providerBaseUrl(provider.providerName, args);
    if (!baseUrl)
      return testFailure(
        "このプロバイダーの接続先が特定できません。プロバイダー引数に baseURL を設定してください。",
      );
    await requestTest(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(headers) },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 8,
        ...options,
      }),
    });
    return testSuccess(
      `${name || "エージェント"}のモデル「${modelId}」に接続できました。`,
    );
  } catch (error) {
    return testFailure(
      error instanceof Error
        ? error.message
        : "エージェントの接続テストに失敗しました。",
    );
  }
}

export async function listAgents(user: AuthUser) {
  const agents = await db.orm.public.AgentDefinition.include(
    "mcpServers",
    (links) => links.include("mcpServer"),
  )
    .include("chatbot")
    .include("provider")
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
      .filter(
        (agent) =>
          agent.provider.ownerId === user.id &&
          (!agent.chatbot || ownedAgentIds.has(agent.id)),
      )
      .map((agent) => {
        const ownedLinks = agent.mcpServers.filter((link) =>
          availableServerIds.has(link.mcpServerId),
        );
        return record(agent.id, agent.updatedAt, {
          name: agent.name,
          model: agent.model_id,
          provider: agent.provider.name,
          mcpServerIds: ownedLinks.map((link) => link.mcpServerId).join(","),
          servers:
            ownedLinks.map((link) => link.mcpServer.name).join("、") || "—",
          options: JSON.stringify(agent.options ?? {}, null, 2),
          status: agent.chatbot
            ? `ボット「${agent.chatbot.name}」で利用中`
            : "未使用",
        });
      }),
    serverOptions: servers.map((server) => ({
      label: server.name,
      value: String(server.id),
    })),
    providerOptions: (
      await db.orm.public.Provider.where({ ownerId: user.id }).all()
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
  const modelId = String(values.get("model_id") ?? "").trim();
  const optionsValue = String(values.get("options") ?? "{}").trim();
  const serverIds = idList(values.get("mcpServerIds")?.toString() ?? null);
  if (!name) return { error: "エージェント名を入力してください。" };
  if (!Number.isInteger(providerId) || !modelId)
    return { error: "プロバイダーとモデルIDを入力してください。" };
  if (
    !(await db.orm.public.Provider.first({
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
  const servers = await db.orm.public.McpServer.where({
    ownerId: user.id,
  }).all();
  const ownedBots = await db.orm.public.Chatbot.where({
    ownerId: user.id,
  }).all();
  const allowedIds = new Set(servers.map((server) => server.id));
  if (serverIds.some((serverId) => !allowedIds.has(serverId)))
    return { error: "選択したMCPサーバーを使用できません。" };
  if (id !== null) {
    const existing = await db.orm.public.AgentDefinition.where({ id })
      .include("provider")
      .first();
    if (!existing || existing.provider.ownerId !== user.id)
      return { error: "エージェントが見つかりません。" };
  }
  if (id !== null) {
    const assignedBot = await db.orm.public.Chatbot.first({ agentId: id });
    if (assignedBot && !ownedBots.some((bot) => bot.id === assignedBot.id))
      return { error: "このエージェントを編集する権限がありません。" };
  }
  const valuesToSave = {
    name,
    providerId,
    model_id: modelId,
    options: jsonb(options),
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
        });
    }
  });
  return { ok: true };
}

export async function deleteAgent(user: AuthUser, id: number) {
  const agent = await db.orm.public.AgentDefinition.where({ id })
    .include("provider")
    .first();
  if (!agent || agent.provider.ownerId !== user.id) return false;
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
