import { kysely } from "./kysely";
import { generateResourceId } from "../utils";

export type ThreadOAuthScope = {
  organizationId: string;
  oauthClientId: string;
  chatbotId: string;
  adapterId: string;
  authorId: string;
};

/** Resolve only credentials belonging to the invoking user. */
export async function getThreadOAuthAuthentication(scope: ThreadOAuthScope) {
  const connection = await kysely
    .selectFrom("aibot.ThreadOAuthConnection")
    .select("authenticationId")
    .where("organizationId", "=", scope.organizationId)
    .where("oauthClientId", "=", scope.oauthClientId)
    .where("chatbotId", "=", scope.chatbotId)
    .where("adapterId", "=", scope.adapterId)
    .where("authorId", "=", scope.authorId)
    .executeTakeFirst();
  if (!connection) return null;
  return kysely
    .selectFrom("aibot.OAuthAuthentication")
    .selectAll()
    .where("id", "=", connection.authenticationId)
    .where("organizationId", "=", scope.organizationId)
    .where("oauthId", "=", scope.oauthClientId)
    .executeTakeFirst();
}

/** Check that the current bot configuration still permits this OAuth client. */
export async function isThreadOAuthAllowed(scope: ThreadOAuthScope) {
  const [bot, adapter, client, mcp] = await Promise.all([
    kysely.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", scope.chatbotId)
      .where("organizationId", "=", scope.organizationId)
      .where("isEnabled", "=", true).executeTakeFirst(),
    kysely.selectFrom("aibot.ChatBotAdapter").select("id")
      .where("chatbotId", "=", scope.chatbotId)
      .where("adapterId", "=", scope.adapterId)
      .where("organizationId", "=", scope.organizationId).executeTakeFirst(),
    kysely.selectFrom("aibot.OAuthClient").select("id")
      .where("id", "=", scope.oauthClientId)
      .where("organizationId", "=", scope.organizationId).executeTakeFirst(),
    kysely.selectFrom("aibot.ChatBotMcpServer").select("id")
      .where("chatbotId", "=", scope.chatbotId)
      .where("oauthClientId", "=", scope.oauthClientId)
      .where("organizationId", "=", scope.organizationId).executeTakeFirst(),
  ]);
  return Boolean(bot && adapter && client && mcp);
}

/** Save encrypted token values. The caller must validate the current configuration. */
export async function saveThreadOAuthAuthentication(
  scope: ThreadOAuthScope,
  values: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  },
  expectedVersion: string | null,
) {
  return kysely.transaction().execute(async (tx) => {
    // Serialize creation and updates for this bot, including simultaneous callbacks.
    const bot = await tx.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", scope.chatbotId)
      .where("organizationId", "=", scope.organizationId)
      .where("isEnabled", "=", true)
      .forUpdate()
      .executeTakeFirst();
    if (!bot) throw new Error("OAuth bot unavailable");
    const [adapter, client, mcp] = await Promise.all([
      tx.selectFrom("aibot.ChatBotAdapter").select("id")
        .where("chatbotId", "=", scope.chatbotId)
        .where("adapterId", "=", scope.adapterId)
        .where("organizationId", "=", scope.organizationId).executeTakeFirst(),
      tx.selectFrom("aibot.OAuthClient").select("id")
        .where("id", "=", scope.oauthClientId)
        .where("organizationId", "=", scope.organizationId)
        .forUpdate()
        .executeTakeFirst(),
      tx.selectFrom("aibot.ChatBotMcpServer").select("id")
        .where("chatbotId", "=", scope.chatbotId)
        .where("oauthClientId", "=", scope.oauthClientId)
        .where("organizationId", "=", scope.organizationId).executeTakeFirst(),
    ]);
    const adapterResource = await tx.selectFrom("aibot.ChatAdapter").select("id")
      .where("id", "=", scope.adapterId)
      .where("organizationId", "=", scope.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!adapter || !adapterResource || !client || !mcp)
      throw new Error("OAuth client is not configured for this bot");
    const existing = await tx.selectFrom("aibot.ThreadOAuthConnection")
      .select("authenticationId")
      .where("organizationId", "=", scope.organizationId)
      .where("oauthClientId", "=", scope.oauthClientId)
      .where("chatbotId", "=", scope.chatbotId)
      .where("adapterId", "=", scope.adapterId)
      .where("authorId", "=", scope.authorId)
      .executeTakeFirst();
    if (existing) {
      const auth = await tx.selectFrom("aibot.OAuthAuthentication").selectAll()
        .where("id", "=", existing.authenticationId)
        .where("organizationId", "=", scope.organizationId)
        .where("oauthId", "=", scope.oauthClientId)
        .forUpdate()
        .executeTakeFirst();
      if (!auth) throw new Error("OAuth connection invalid");
      if (`${auth.id}:${auth.updatedAt.toISOString()}` !== expectedVersion)
        throw new Error("OAuth connection changed since authorization began");
      await tx.updateTable("aibot.OAuthAuthentication")
        .set({ ...values, updatedAt: new Date() })
        .where("id", "=", auth.id)
        .execute();
      return auth.id;
    }
    if (expectedVersion !== null)
      throw new Error("OAuth connection was disconnected");
    const id = generateResourceId();
    await tx.insertInto("aibot.ResourceBase")
      .values({ id, organizationId: scope.organizationId }).execute();
    await tx.insertInto("aibot.OAuthAuthentication")
      .values({
        id,
        organizationId: scope.organizationId,
        name: `thread-oauth-${id}`,
        oauthId: scope.oauthClientId,
        ...values,
        updatedAt: new Date(),
      }).execute();
    await tx.insertInto("aibot.ThreadOAuthConnection")
      .values({ ...scope, authenticationId: id, updatedAt: new Date() })
      .execute();
    return id;
  });
}

export async function deleteThreadOAuthAuthentication(scope: ThreadOAuthScope) {
  return kysely.transaction().execute(async (tx) => {
    const bot = await tx.selectFrom("aibot.ChatBot").select("id")
      .where("id", "=", scope.chatbotId)
      .where("organizationId", "=", scope.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!bot) return false;
    const connection = await tx.selectFrom("aibot.ThreadOAuthConnection")
      .select("authenticationId")
      .where("organizationId", "=", scope.organizationId)
      .where("oauthClientId", "=", scope.oauthClientId)
      .where("chatbotId", "=", scope.chatbotId)
      .where("adapterId", "=", scope.adapterId)
      .where("authorId", "=", scope.authorId)
      .executeTakeFirst();
    if (!connection) return false;
    const authentication = await tx.selectFrom("aibot.OAuthAuthentication")
      .select("id")
      .where("id", "=", connection.authenticationId)
      .where("organizationId", "=", scope.organizationId)
      .where("oauthId", "=", scope.oauthClientId)
      .executeTakeFirst();
    if (!authentication) throw new Error("OAuth connection invalid");
    await tx.deleteFrom("aibot.ResourceBase")
      .where("id", "=", connection.authenticationId)
      .where("organizationId", "=", scope.organizationId)
      .execute();
    return true;
  });
}
