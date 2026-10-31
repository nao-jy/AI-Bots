import { db } from "./db";
import type { AuthUser } from "../auth";
import { idList, jsonb, record } from "../utils";

export async function listAgents(user: AuthUser) {
  const [agents, authentications] = await Promise.all([
    db.orm.aibot.AgentDefinition.include("mcpServers", (links) =>
      links.include("mcpServer"),
    )
      .include("chatbot")
      .include("provider")
      .all(),
    db.orm.aibot.OAuthAuthentication.where({ ownerId: user.id }).all(),
  ]);
  const ownedBots = await db.orm.aibot.Chatbot.where({
    ownerId: user.id,
  }).all();
  const ownedAgentIds = new Set(ownedBots.map((bot) => bot.agentId));
  const servers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const availableServerIds = new Set(servers.map((server) => server.id));
  const authNames = new Map(
    authentications.map((auth) => [auth.id, auth.name]),
  );
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
          model_id: agent.model_id,
          provider: agent.provider.name,
          providerId: agent.provider.id,
          mcpServerIds: ownedLinks.map((link) => link.mcpServerId).join(","),
          mcpAuthIds: JSON.stringify(
            Object.fromEntries(
              ownedLinks
                .filter((link) => link.authId !== null)
                .map((link) => [String(link.mcpServerId), String(link.authId)]),
            ),
          ),
          mcpAuthentications:
            ownedLinks
              .filter((link) => link.authId !== null)
              .map(
                (link) =>
                  `${link.mcpServer.name}: ${authNames.get(link.authId!) ?? "不明"}`,
              )
              .join("、") || "未設定",
          servers:
            ownedLinks.map((link) => link.mcpServer.name).join("、") || "—",
          options: JSON.stringify(agent.options ?? {}, null, 2),
          status: agent.chatbot
            ? `ボット「${agent.chatbot.name}」で利用中`
            : "未使用",
        });
      }),
    serverOptions: servers.map((server) => ({
      label: `${server.name} (#${server.id})`,
      value: String(server.id),
    })),
    providerOptions: (
      await db.orm.aibot.Provider.where({ ownerId: user.id }).all()
    ).map((provider) => ({
      label: `${provider.name} (${provider.providerName})`,
      value: String(provider.id),
    })),
    authOptions: authentications.map((auth) => ({
      label: `${auth.name} (#${auth.id})`,
      value: String(auth.id),
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
    model_id: modelId,
    options: jsonb(options),
  };
  await db.transaction(async (tx) => {
    const agentId =
      id === null
        ? (await tx.orm.aibot.AgentDefinition.create(valuesToSave)).id
        : id;
    if (id !== null)
      await tx.orm.aibot.AgentDefinition.where({ id }).update(valuesToSave);
    const links = await tx.orm.aibot.AgentMcpServer.where({ agentId }).all();
    for (const link of links) {
      if (!serverIds.includes(link.mcpServerId))
        await tx.orm.aibot.AgentMcpServer.where({
          agentId,
          mcpServerId: link.mcpServerId,
        }).delete();
    }
    for (const serverId of serverIds) {
      const authId = mcpAuthIds[String(serverId)] ?? null;
      const existingLink = links.find((link) => link.mcpServerId === serverId);
      if (!existingLink)
        await tx.orm.aibot.AgentMcpServer.create({
          agentId,
          mcpServerId: serverId,
          authId,
        });
      else if (existingLink.authId !== authId)
        await tx.orm.aibot.AgentMcpServer.where({
          agentId,
          mcpServerId: serverId,
        }).update({ authId });
    }
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
  const ownServers = await db.orm.aibot.McpServer.where({
    ownerId: user.id,
  }).all();
  const links = await db.orm.aibot.AgentMcpServer.where({ agentId: id }).all();
  if (
    links.some(
      (link) => !ownServers.some((server) => server.id === link.mcpServerId),
    )
  )
    return false;
  await db.orm.aibot.AgentDefinition.where({ id }).delete();
  return true;
}
