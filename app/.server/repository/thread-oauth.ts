import { db } from "./db";
import { generateResourceId } from "../utils";

export type ThreadOAuthScope = {
  organizationId: string;
  oauthClientId: string;
  chatbotId: string;
  adapterId: string;
  threadId: string;
};

/** Resolve only credentials belonging to the exact organization and thread. */
export async function getThreadOAuthAuthentication(scope: ThreadOAuthScope) {
  const connection = await db.orm.aibot.ThreadOAuthConnection.first(scope);
  if (!connection) return null;
  return db.orm.aibot.OAuthAuthentication.first({
    id: connection.authenticationId,
    organizationId: scope.organizationId,
    oauthId: scope.oauthClientId,
  });
}

/** Check that the current bot configuration still permits this OAuth client. */
export async function isThreadOAuthAllowed(scope: ThreadOAuthScope) {
  const [bot, adapter, client, mcp] = await Promise.all([
    db.orm.aibot.ChatBot.first({
      id: scope.chatbotId,
      organizationId: scope.organizationId,
      isEnabled: true,
    }),
    db.orm.aibot.ChatBotAdapter.first({
      chatbotId: scope.chatbotId,
      adapterId: scope.adapterId,
      organizationId: scope.organizationId,
    }),
    db.orm.aibot.OAuthClient.first({
      id: scope.oauthClientId,
      organizationId: scope.organizationId,
    }),
    db.orm.aibot.ChatBotMcpServer.first({
      chatbotId: scope.chatbotId,
      oauthClientId: scope.oauthClientId,
      organizationId: scope.organizationId,
    }),
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
  return db.transaction(async (tx) => {
    // Serialize creation and updates for this bot, including simultaneous callbacks.
    const bot = await tx.orm.aibot.ChatBot.where({
      id: scope.chatbotId,
      organizationId: scope.organizationId,
      isEnabled: true,
    })
      .forUpdate()
      .first();
    if (!bot) throw new Error("OAuth bot unavailable");
    const [adapter, client, mcp] = await Promise.all([
      tx.orm.aibot.ChatBotAdapter.first({
        chatbotId: scope.chatbotId,
        adapterId: scope.adapterId,
        organizationId: scope.organizationId,
      }),
      tx.orm.aibot.OAuthClient.where({
        id: scope.oauthClientId,
        organizationId: scope.organizationId,
      })
        .forUpdate()
        .first(),
      tx.orm.aibot.ChatBotMcpServer.first({
        chatbotId: scope.chatbotId,
        oauthClientId: scope.oauthClientId,
        organizationId: scope.organizationId,
      }),
    ]);
    const adapterResource = await tx.orm.aibot.ChatAdapter.where({
      id: scope.adapterId,
      organizationId: scope.organizationId,
    })
      .forUpdate()
      .first();
    if (!adapter || !adapterResource || !client || !mcp)
      throw new Error("OAuth client is not configured for this bot");
    const existing = await tx.orm.aibot.ThreadOAuthConnection.first(scope);
    if (existing) {
      const auth = await tx.orm.aibot.OAuthAuthentication.where({
        id: existing.authenticationId,
        organizationId: scope.organizationId,
        oauthId: scope.oauthClientId,
      })
        .forUpdate()
        .first();
      if (!auth) throw new Error("OAuth connection invalid");
      if (`${auth.id}:${auth.updatedAt.toISOString()}` !== expectedVersion)
        throw new Error("OAuth connection changed since authorization began");
      await tx.orm.aibot.OAuthAuthentication.where({ id: auth.id }).update(
        values,
      );
      return auth.id;
    }
    if (expectedVersion !== null)
      throw new Error("OAuth connection was disconnected");
    const id = generateResourceId();
    await tx.orm.aibot.ResourceBase.create({
      id,
      organizationId: scope.organizationId,
    });
    await tx.orm.aibot.OAuthAuthentication.create({
      id,
      organizationId: scope.organizationId,
      name: `thread-oauth-${id}`,
      oauthId: scope.oauthClientId,
      ...values,
    });
    await tx.orm.aibot.ThreadOAuthConnection.create({
      ...scope,
      authenticationId: id,
    });
    return id;
  });
}

export async function deleteThreadOAuthAuthentication(scope: ThreadOAuthScope) {
  return db.transaction(async (tx) => {
    const bot = await tx.orm.aibot.ChatBot.where({
      id: scope.chatbotId,
      organizationId: scope.organizationId,
    })
      .forUpdate()
      .first();
    if (!bot) return false;
    const connection = await tx.orm.aibot.ThreadOAuthConnection.first(scope);
    if (!connection) return false;
    const authentication = await tx.orm.aibot.OAuthAuthentication.first({
      id: connection.authenticationId,
      organizationId: scope.organizationId,
      oauthId: scope.oauthClientId,
    });
    if (!authentication) throw new Error("OAuth connection invalid");
    await tx.orm.aibot.ResourceBase.where({
      id: connection.authenticationId,
      organizationId: scope.organizationId,
    }).delete();
    return true;
  });
}
