import * as oidc from "openid-client";
import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptCredential,
  encryptCredential,
  generateResourceId,
  parseStringList,
  record,
} from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { t } from "~/.server/i18n";
import { appLogger } from "../logger/app-logger";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";

const TOKEN_REFRESH_WINDOW_MS = 60_000;

export async function getOwnedOAuthAuthentication(id: string, organizationId: string) {
  return db.orm.aibot.OAuthAuthentication.first({ id, organizationId });
}

export async function getOwnedOAuthClient(id: string, organizationId: string) {
  return db.orm.aibot.OAuthClient.first({ id, organizationId });
}

async function revokeOAuthAuthenticationTokens(
  authentication: {
    accessToken: string;
    refreshToken: string | null;
  },
  client: {
    clientId: string;
    clientSecret: string | null;
    revocationEndpoint: string | null;
  },
) {
  if (!client.revocationEndpoint) return;

  let endpoint: URL;
  try {
    endpoint = new URL(client.revocationEndpoint);
  } catch {
    throw new Error("server.oauthRevocationEndpointInvalid");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:")
    throw new Error("server.oauthRevocationEndpointInvalid");

  const secret = client.clientSecret
    ? decryptCredential(client.clientSecret)
    : undefined;
  const config = new oidc.Configuration(
    {
      issuer: endpoint.origin,
      revocation_endpoint: endpoint.href,
    } as oidc.ServerMetadata,
    client.clientId,
    secret,
    secret ? oidc.ClientSecretPost(secret) : oidc.None(),
  );

  try {
    if (authentication.refreshToken) {
      await oidc.tokenRevocation(
        config,
        decryptCredential(authentication.refreshToken),
        { token_type_hint: "refresh_token" },
      );
    }
    await oidc.tokenRevocation(
      config,
      decryptCredential(authentication.accessToken),
      { token_type_hint: "access_token" },
    );
  } catch (error) {
    appLogger.error(error);
  }
}

function refreshConfiguration(client: {
  clientId: string;
  clientSecret: string | null;
  tokenEndpoint: string;
  refreshEndpoint: string | null;
}) {
  const endpoint = client.refreshEndpoint ?? client.tokenEndpoint;
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("server.oauthRefreshEndpointMustBeHttpUrl");

  const secret = client.clientSecret
    ? decryptCredential(client.clientSecret)
    : undefined;
  return new oidc.Configuration(
    {
      issuer: url.origin,
      token_endpoint: url.href,
    } as oidc.ServerMetadata,
    client.clientId,
    secret,
    secret ? oidc.ClientSecretPost(secret) : oidc.None(),
  );
}

interface AdapterOAuthInfo {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

export async function getAdapterOAuthInfo(authId: string) {
  const authentication = await db.orm.aibot.OAuthAuthentication.first({
    id: authId,
  });
  if (!authentication) throw new Error("server.oauthAuthenticationNotFound");

  const client = await db.orm.aibot.OAuthClient.first({
    id: authentication.oauthId,
    organizationId: authentication.organizationId,
  });
  if (!client) throw new Error("server.oauthClientNotFound");

  if (client.clientSecret !== null && authentication.refreshToken !== null) {
    const clientInfo: AdapterOAuthInfo = {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      accessToken: (await getAccessToken(authId)).accessToken,
      refreshToken: decryptCredential(authentication.refreshToken),
    };

    return clientInfo;
  }
  return null;
}

/** Return an authentication's access token, refreshing it shortly before expiry. */
export async function getAccessToken(authId: string) {
  const authentication = await db.orm.aibot.OAuthAuthentication.first({
    id: authId,
  });
  if (!authentication) throw new Error("server.oauthAuthenticationNotFound");

  const client = await db.orm.aibot.OAuthClient.first({
    id: authentication.oauthId,
    organizationId: authentication.organizationId,
  });
  if (!client) throw new Error("server.oauthClientNotFound");

  const expiresAt = authentication.expiresAt
    ? new Date(authentication.expiresAt).getTime()
    : Number.NaN;
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt - Date.now() >= TOKEN_REFRESH_WINDOW_MS
  )
    return {
      name: authentication.name,
      accessToken: decryptCredential(authentication.accessToken),
    };

  if (!authentication.refreshToken)
    throw new Error("server.refreshTokenRequiredToReconnect");

  const tokens = await oidc.refreshTokenGrant(
    refreshConfiguration(client),
    decryptCredential(authentication.refreshToken),
  );
  if (!tokens.access_token) throw new Error("server.oauthAccessTokenMissing");

  const refreshedExpiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
  const refreshToken = tokens.refresh_token
    ? encryptCredential(tokens.refresh_token)
    : authentication.refreshToken;
  await db.orm.aibot.OAuthAuthentication.where({
    id: authId,
    organizationId: authentication.organizationId,
  }).update({
    accessToken: encryptCredential(tokens.access_token),
    refreshToken,
    expiresAt: refreshedExpiresAt,
  });
  logAuditEvent("oauth.access_token.refreshed", "oauth_authentication", authId);

  return { name: authentication.name, accessToken: tokens.access_token };
}

export async function saveOAuthAuthentication(
  organizationId: string,
  principalId: string,
  id: string | null,
  values: {
    name: string;
    oauthId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  },
) {
  if (id === null) {
    const authentication = await db.transaction(async (tx) => {
      const authenticationId = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id: authenticationId });
      const created = await tx.orm.aibot.OAuthAuthentication.create({
        id: authenticationId,
        ...values,
        organizationId,
      });
      await tx.orm.aibot.Grant.create({
        organizationId,
        principalId,
        resourceId: authenticationId,
        role: "manager",
        grantedById: principalId,
      });
      return created;
    });
    logAuditEvent(
      "oauth.authentication.created",
      "oauth_authentication",
      authentication.id,
    );
    return authentication;
  }
  if (!(await hasResourceAccess({ id: principalId, organizationId }, id, "update")))
    throw new Response("Forbidden", { status: 403 });
  const updated = await db.orm.aibot.OAuthAuthentication.where({
    id,
    organizationId,
  }).update(values);
  logAuditEvent("oauth.authentication.updated", "oauth_authentication", id);
  return updated;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function listOAuthClients(user: AuthUser, ids: string[]) {
  const clients = await filterResourcesByRole(user, await db.orm.aibot.OAuthClient.where({ organizationId: user.organizationId })
    .where((client) => client.id.in(ids))
    .orderBy((client) => client.updatedAt.desc())
    .all());
  return {
    records: await includeResourcePermissions(user, clients.map((client) =>
      record(client.id, client.updatedAt, {
        name: client.name,
        clientId: client.clientId,
        authorizationEndpoint: client.authorizationEndpoint,
        tokenEndpoint: client.tokenEndpoint,
        refreshEndpoint: client.refreshEndpoint ?? "",
        revocationEndpoint: client.revocationEndpoint ?? "",
        scopes: JSON.stringify(client.scopes),
        secretConfigured: client.clientSecret
          ? "server.configured"
          : "server.notConfigured",
      }),
    )),
  };
}

export async function saveOAuthClient(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const clientId = String(values.get("clientId") ?? "").trim();
  const secret = String(values.get("clientSecret") ?? "");
  const authorizationEndpoint = String(
    values.get("authorizationEndpoint") ?? "",
  ).trim();
  const tokenEndpoint = String(values.get("tokenEndpoint") ?? "").trim();
  const refreshEndpoint = String(values.get("refreshEndpoint") ?? "").trim();
  const revocationEndpoint = String(
    values.get("revocationEndpoint") ?? "",
  ).trim();
  const scopes = parseStringList(String(values.get("scopes") ?? "[]").trim());

  if (!name || !clientId || !authorizationEndpoint || !tokenEndpoint)
    return {
      error: "server.oauthClientFieldsRequired",
    };
  if (!validHttpUrl(authorizationEndpoint) || !validHttpUrl(tokenEndpoint))
    return {
      error: "server.oauthEndpointsMustBeHttpUrls",
    };
  if (
    (refreshEndpoint && !validHttpUrl(refreshEndpoint)) ||
    (revocationEndpoint && !validHttpUrl(revocationEndpoint))
  )
    return { error: "server.invalidOauthRefreshOrRevokeUrl" };

  const existing =
    id === null
      ? null
      : await db.orm.aibot.OAuthClient.first({ id, organizationId: user.organizationId });
  if (id !== null && (!existing || !(await hasResourceAccess(user, id, "update")))) return { error: "server.oauthClientNotFound" };

  let clientSecret = existing?.clientSecret ?? null;
  if (secret) {
    try {
      clientSecret = encryptCredential(secret);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "server.oauthClientSecretEncryptionFailed",
      };
    }
  }

  const saved = {
    name,
    clientId,
    clientSecret,
    authorizationEndpoint,
    tokenEndpoint,
    refreshEndpoint: refreshEndpoint || null,
    revocationEndpoint: revocationEndpoint || null,
    scopes,
  };
  if (id === null) {
    const client = await db.transaction(async (tx) => {
      const id = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id });
      const created = await tx.orm.aibot.OAuthClient.create({
        id,
        ...saved,
        organizationId: user.organizationId,
      });
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: id,
        role: "manager",
        grantedById: user.id,
      });
      return created;
    });
    logAuditEvent("oauth.client.created", "oauth_client", client.id, user.id);
  } else {
    await db.orm.aibot.OAuthClient.where({ id, organizationId: user.organizationId }).update(
      saved,
    );
    logAuditEvent("oauth.client.updated", "oauth_client", id, user.id);
  }
  return { ok: true };
}

export async function deleteOAuthClient(user: AuthUser, id: string) {
  const client = await db.orm.aibot.OAuthClient.first({
    id,
    organizationId: user.organizationId,
  });
  if (!client || !(await hasResourceAccess(user, id, "delete"))) return false;
  const authentications = await db.orm.aibot.OAuthAuthentication.where({
    oauthId: id,
    organizationId: user.organizationId,
  }).all();
  for (const authentication of authentications)
    await revokeOAuthAuthenticationTokens(authentication, client);

  await db.orm.aibot.OAuthClient.where({ id, organizationId: user.organizationId }).delete();
  for (const authentication of authentications)
    logAuditEvent(
      "oauth.authentication.deleted",
      "oauth_authentication",
      authentication.id,
      user.id,
    );
  logAuditEvent("oauth.client.deleted", "oauth_client", id, user.id);
  return true;
}

export async function listOauth(organizationId: string, principalId?: string) {
  const user = principalId ? { id: principalId, organizationId } : null;
  const clientRows = await db.orm.aibot.OAuthClient.where({ organizationId })
    .include("authentications")
    .orderBy((authentication) => authentication.updatedAt.desc())
    .all();
  const data = user ? await filterResourcesByRole(user, clientRows) : clientRows;
  const authRows = user
    ? await filterResourcesByRole(user, await db.orm.aibot.OAuthAuthentication.where({ organizationId }).all())
    : null;
  const allowedAuthIds = authRows ? new Set(authRows.map(({ id }) => id)) : null;
  const ret = data
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((client) => ({
      name: client.name,
      authentications: client.authentications
        .filter((auth) => !allowedAuthIds || allowedAuthIds.has(auth.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((auth) => ({
          id: auth.id,
          name: auth.name,
        })),
    }));
  return ret;
}
export async function listOAuthAuthentications(user: AuthUser, ids: string[]) {
  const [authentications, clientRows] = await Promise.all([
    filterResourcesByRole(user, await db.orm.aibot.OAuthAuthentication.where({ organizationId: user.organizationId })
      .where((authentication) => authentication.id.in(ids))
      .orderBy((authentication) => authentication.updatedAt.desc())
      .all()),
    db.orm.aibot.OAuthClient.where({ organizationId: user.organizationId }).all(),
  ]);
  const clients = await filterResourcesByRole(user, clientRows);
  const clientsById = new Map(
    clients.map((client) => [client.id, client.name]),
  );
  return {
    records: await includeResourcePermissions(user, authentications.map((authentication) =>
      record(authentication.id, authentication.updatedAt, {
        name: authentication.name,
        oauthId: String(authentication.oauthId),
        oauthName:
          clientsById.get(authentication.oauthId) ?? t("server.unknownClient"),
        expiresAt: authentication.expiresAt ?? "",
        accessTokenConfigured: "server.configured",
        refreshTokenConfigured: authentication.refreshToken
          ? "server.configured"
          : "server.notConfigured",
      }),
    )),
    clientOptions: clients.map((client) => ({
      value: String(client.id),
      label: client.name,
    })),
  };
}

export async function renameOAuthAuthentication(
  user: AuthUser,
  id: string,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  if (!name) return { error: "server.oauthAuthenticationNameRequired" };
  if (!(await db.orm.aibot.OAuthAuthentication.first({ id, organizationId: user.organizationId })) ||
    !(await hasResourceAccess(user, id, "update")))
    return { error: "server.oauthAuthenticationNotFound" };
  await db.orm.aibot.OAuthAuthentication.where({
    id,
    organizationId: user.organizationId,
  }).update({ name });
  logAuditEvent(
    "oauth.authentication.renamed",
    "oauth_authentication",
    id,
    user.id,
  );
  return { ok: true };
}

export async function deleteOAuthAuthentication(user: AuthUser, id: string) {
  const authentication = await db.orm.aibot.OAuthAuthentication.first({
    id,
    organizationId: user.organizationId,
  });
  if (!authentication || !(await hasResourceAccess(user, id, "delete"))) return false;
  const client = await db.orm.aibot.OAuthClient.first({
    id: authentication.oauthId,
    organizationId: user.organizationId,
  });
  if (!client) throw new Error("server.oauthClientNotFound");
  await revokeOAuthAuthenticationTokens(authentication, client);

  await db.orm.aibot.OAuthAuthentication.where({
    id,
    organizationId: user.organizationId,
  }).delete();
  logAuditEvent(
    "oauth.authentication.deleted",
    "oauth_authentication",
    id,
    user.id,
  );
  return true;
}
