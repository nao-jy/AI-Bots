import { db } from "./db";
import type { AuthUser } from "../auth";
import { generatePublicId, idList, record } from "../utils";

export async function listBots(user: AuthUser, publicOrigin: string) {
  const bots = await db.orm.aibot.Chatbot.where({ ownerId: user.id })
    .include("agent")
    .include("adapters", (links) => links.include("adapter"))
    .orderBy((bot) => bot.updatedAt.desc())
    .all();
  const agents = await db.orm.aibot.AgentDefinition.include("chatbot")
    .include("provider")
    .all();
  const adapters = await db.orm.aibot.ChatAdapter.where({
    ownerId: user.id,
  }).all();
  return {
    records: bots.map((bot) =>
      record(bot.id, bot.updatedAt, {
        name: bot.name,
        description: bot.description ?? "",
        agent: bot.agent?.name ?? "—",
        agentId: bot.agentId ?? "",
        adapterIds: bot.adapters.map((link) => link.adapterId).join(","),
        adapters:
          bot.adapters.map((link) => link.adapter.name).join("、") || "—",
        webhooks: JSON.stringify(
          bot.adapters.map((link) => ({
            adapterName: link.adapter.name,
            url: new URL(
              `/api/webhooks/${bot.publicId}/${link.adapter.publicId}`,
              publicOrigin,
            ).toString(),
          })),
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
  const agentValue = String(values.get("agentId") ?? "").trim();
  const agentId = agentValue ? Number(agentValue) : null;
  const adapterIds = idList(values.get("adapterIds")?.toString() ?? null);
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
    const assignedBot = await db.orm.aibot.Chatbot.first({ agentId });
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
  if (
    id !== null &&
    !(await db.orm.aibot.Chatbot.first({ id, ownerId: user.id }))
  )
    return { error: "ボットが見つかりません。" };

  await db.transaction(async (tx) => {
    let botId = id;
    if (botId === null) {
      const created = await tx.orm.aibot.Chatbot.create({
        publicId: generatePublicId(),
        name,
        description: description || null,
        instruction: instruction,
        agentId,
        ownerId: user.id,
      });
      botId = created.id;
    } else {
      await tx.orm.aibot.Chatbot.where({ id: botId, ownerId: user.id }).update({
        name,
        description: description || null,
        instruction: instruction,
        agentId,
      });
    }
    await tx.orm.aibot.ChatbotAdapter.where({ chatbotId: botId! }).delete();
    for (const adapterId of adapterIds) {
      await tx.orm.aibot.ChatbotAdapter.create({
        chatbotId: botId!,
        adapterId,
      });
    }
  });
  return { ok: true };
}

export async function deleteBot(user: AuthUser, id: number) {
  const bot = await db.orm.aibot.Chatbot.first({ id, ownerId: user.id });
  if (!bot) return false;
  await db.orm.aibot.Chatbot.where({ id, ownerId: user.id }).delete();
  return true;
}

export async function setBotEnabled(
  user: AuthUser,
  id: number,
  isEnabled: boolean,
) {
  if (!(await db.orm.aibot.Chatbot.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.Chatbot.where({ id, ownerId: user.id }).update({
    isEnabled,
  });
  return true;
}

export async function getAvailableBot(botId: number) {
  const chatbot = await db.orm.aibot.Chatbot.where({
    id: botId,
    isEnabled: true,
  })
    .include("agent", (agent) =>
      agent
        .include("provider")
        .include("mcpServers", (links) => links.include("mcpServer")),
    )
    .first();
  return chatbot;
}

export async function getAvailableBotByPublicId(publicId: string) {
  const chatbot = await db.orm.aibot.Chatbot.where({
    publicId: publicId,
    isEnabled: true,
  })
    .include("adapters", (links) => links.include("adapter"))
    .first();
  return chatbot;
}
