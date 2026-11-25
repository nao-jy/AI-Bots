import { db } from "./db";

export function getDashboardResources(organizationId: string) {
  return Promise.all([
    db.orm.aibot.ChatBot.where({ organizationId }).all(),
    db.orm.aibot.AgentDefinition.where({ organizationId })
      .include("provider")
      .all(),
  ]);
}

export function getDashboardUsage(
  organizationId: string,
  start: string,
  end: string,
  botIds: string[],
  agentIds: string[],
) {
  if (!botIds.length || !agentIds.length) return Promise.resolve([]);
  return db.orm.aibot.AgentUsage.where({ organizationId })
    .where((row) => row.createdAt.gte(start))
    .where((row) => row.createdAt.lt(end))
    .where((row) => row.chatbotId.in(botIds))
    .where((row) => row.agentId.in(agentIds))
    .select("id", "createdAt", "inputTokens", "outputTokens", "platform", "chatbotId", "agentId")
    .all();
}

export const getSandboxApi = (id: string) => db.orm.aibot.SandboxAPI.first({ id });
export const getFilesystemApi = (id: string) => db.orm.aibot.FileSystemAPI.first({ id });
export const getOrganization = (id: string) => db.orm.aibot.Organization.first({ id });
export const getOrganizationFilesystemApi = (id: string, organizationId: string) =>
  db.orm.aibot.FileSystemAPI.first({ id, organizationId });
export const getBrowserFilesystemApi = (id: string, organizationId: string) =>
  db.orm.aibot.FileSystemAPI.first({ id, organizationId });
export const getBotFilesystemLink = (chatbotId: string, organizationId: string) =>
  db.orm.aibot.ChatBotFileSystem.first({ chatbotId, organizationId });
