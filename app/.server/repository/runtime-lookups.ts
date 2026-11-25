import { kysely } from "./kysely";
import type { Selectable } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import type { ProviderTable } from "./db-schema";

export function getDashboardResources(organizationId: string) {
  return Promise.all([
    kysely
      .selectFrom("aibot.ChatBot")
      .selectAll()
      .where("organizationId", "=", organizationId)
      .execute(),
    kysely
      .selectFrom("aibot.AgentDefinition")
      .selectAll("aibot.AgentDefinition")
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom("aibot.Provider")
            .selectAll()
            .whereRef("aibot.Provider.id", "=", "aibot.AgentDefinition.providerId"),
        ).as("provider"),
      ])
      .where("aibot.AgentDefinition.organizationId", "=", organizationId)
      .execute()
      .then((agents) =>
        agents.map((agent) => ({
          ...agent,
          provider: agent.provider as unknown as Selectable<ProviderTable>,
        })),
      ),
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
  return kysely
    .selectFrom("aibot.AgentUsage")
    .select([
      "id",
      "createdAt",
      "inputTokens",
      "outputTokens",
      "platform",
      "chatbotId",
      "agentId",
    ])
    .where("organizationId", "=", organizationId)
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .where("chatbotId", "in", botIds)
    .where("agentId", "in", agentIds)
    .execute();
}

export const getSandboxApi = (id: string) =>
  kysely
    .selectFrom("aibot.SandboxAPI")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
export const getFilesystemApi = (id: string) =>
  kysely
    .selectFrom("aibot.FileSystemAPI")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
export const getOrganization = (id: string) =>
  kysely
    .selectFrom("aibot.Organization")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
export const getOrganizationFilesystemApi = (id: string, organizationId: string) =>
  kysely
    .selectFrom("aibot.FileSystemAPI")
    .selectAll()
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();
export const getBrowserFilesystemApi = getOrganizationFilesystemApi;
export const getBotFilesystemLink = (chatbotId: string, organizationId: string) =>
  kysely
    .selectFrom("aibot.ChatBotFileSystem")
    .selectAll()
    .where("chatbotId", "=", chatbotId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();
