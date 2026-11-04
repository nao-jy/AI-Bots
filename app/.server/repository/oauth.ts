import * as oidc from "openid-client";
import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptCredential,
  encryptCredential,
  parseStringList,
  record,
} from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

const TOKEN_REFRESH_WINDOW_MS = 60_000;

export async function getOwnedOAuthAuthentication(id: number, ownerId: number) {
  return db.orm.aibot.OAuthAuthentication.first({ id, ownerId });
}

export async function getOwnedOAuthClient(id: number, ownerId: number) {
  return db.orm.aibot.OAuthClient.first({ id, ownerId });
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
    throw new Error(
      "OAuth更新エンドポイントにはHTTPまたはHTTPSを指定してください。",
    );

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

export async function getAdapterOAuthInfo(authId: number) {
  const authentication = await db.orm.aibot.OAuthAuthentication.first({
    id: authId,
  });
  if (!authentication) throw new Error("OAuth認証情報が見つかりません。");

  const client = await db.orm.aibot.OAuthClient.first({
    id: authentication.oauthId,
    ownerId: authentication.ownerId,
  });
  if (!client) throw new Error("OAuthクライアントが見つかりません。");

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
export async function getAccessToken(authId: number) {
  const authentication = await db.orm.aibot.OAuthAuthentication.first({
    id: authId,
  });
  if (!authentication) throw new Error("OAuth認証情報が見つかりません。");

  const client = await db.orm.aibot.OAuthClient.first({
    id: authentication.oauthId,
    ownerId: authentication.ownerId,
  });
  if (!client) throw new Error("OAuthクライアントが見つかりません。");

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
    throw new Error(
      "アクセストークンの有効期限が切れています。refresh tokenがないためOAuth認証を再接続してください。",
    );

  const tokens = await oidc.refreshTokenGrant(
    refreshConfiguration(client),
    decryptCredential(authentication.refreshToken),
  );
  if (!tokens.access_token)
    throw new Error("OAuthサーバーからアクセストークンが返されませんでした。");

  const refreshedExpiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
  const refreshToken = tokens.refresh_token
    ? encryptCredential(tokens.refresh_token)
    : authentication.refreshToken;
  await db.orm.aibot.OAuthAuthentication.where({
    id: authId,
    ownerId: authentication.ownerId,
  }).update({
    accessToken: encryptCredential(tokens.access_token),
    refreshToken,
    expiresAt: refreshedExpiresAt,
  });
  logAuditEvent(
    "oauth.access_token.refreshed",
    "oauth_authentication",
    authId,
  );

  return { name: authentication.name, accessToken: tokens.access_token };
}

export async function saveOAuthAuthentication(
  ownerId: number,
  id: number | null,
  values: {
    name: string;
    oauthId: number;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  },
) {
  if (id === null) {
    const authentication = await db.orm.aibot.OAuthAuthentication.create({
      ...values,
      ownerId,
    });
    logAuditEvent(
      "oauth.authentication.created",
      "oauth_authentication",
      authentication.id,
    );
    return authentication;
  }
  const updated = await db.orm.aibot.OAuthAuthentication.where({
    id,
    ownerId,
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

export async function listOAuthClients(user: AuthUser) {
  const clients = await db.orm.aibot.OAuthClient.where({ ownerId: user.id })
    .orderBy((client) => client.updatedAt.desc())
    .all();
  return {
    records: clients.map((client) =>
      record(client.id, client.updatedAt, {
        name: client.name,
        clientId: client.clientId,
        authorizationEndpoint: client.authorizationEndpoint,
        tokenEndpoint: client.tokenEndpoint,
        refreshEndpoint: client.refreshEndpoint ?? "",
        revocationEndpoint: client.revocationEndpoint ?? "",
        scopes: JSON.stringify(client.scopes),
        secretConfigured: client.clientSecret ? "設定済み" : "未設定",
      }),
    ),
  };
}

export async function saveOAuthClient(
  user: AuthUser,
  id: number | null,
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
  const scopes = parseStringList(
    String(values.get("scopes") ?? "[]").trim(),
    "スコープ",
  );

  if (!name || !clientId || !authorizationEndpoint || !tokenEndpoint)
    return {
      error:
        "名前、クライアントID、認可エンドポイント、トークンエンドポイントを入力してください。",
    };
  if (!validHttpUrl(authorizationEndpoint) || !validHttpUrl(tokenEndpoint))
    return {
      error:
        "認可・トークンエンドポイントにはHTTPまたはHTTPSのURLを入力してください。",
    };
  if (
    (refreshEndpoint && !validHttpUrl(refreshEndpoint)) ||
    (revocationEndpoint && !validHttpUrl(revocationEndpoint))
  )
    return { error: "更新・失効エンドポイントのURL形式を確認してください。" };

  const existing =
    id === null
      ? null
      : await db.orm.aibot.OAuthClient.first({ id, ownerId: user.id });
  if (id !== null && !existing)
    return { error: "OAuthクライアントが見つかりません。" };

  let clientSecret = existing?.clientSecret ?? null;
  if (secret) {
    try {
      clientSecret = encryptCredential(secret);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "クライアントシークレットを暗号化できませんでした。",
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
    const client = await db.orm.aibot.OAuthClient.create({
      ...saved,
      ownerId: user.id,
    });
    logAuditEvent("oauth.client.created", "oauth_client", client.id, user.id);
  } else {
    await db.orm.aibot.OAuthClient.where({ id, ownerId: user.id }).update(
      saved,
    );
    logAuditEvent("oauth.client.updated", "oauth_client", id, user.id);
  }
  return { ok: true };
}

export async function deleteOAuthClient(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.OAuthClient.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.OAuthClient.where({ id, ownerId: user.id }).delete();
  logAuditEvent("oauth.client.deleted", "oauth_client", id, user.id);
  return true;
}

export async function listOauth(ownerId: number) {
  const data = await db.orm.aibot.OAuthClient.where({ ownerId })
    .include("authentications")
    .orderBy((authentication) => authentication.updatedAt.desc())
    .all();
  const ret = data
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((client) => ({
      name: client.name,
      authentications: client.authentications
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((auth) => ({
          id: auth.id,
          name: auth.name,
        })),
    }));
  return ret;
}
export async function listOAuthAuthentications(user: AuthUser) {
  const [authentications, clients] = await Promise.all([
    db.orm.aibot.OAuthAuthentication.where({ ownerId: user.id })
      .orderBy((authentication) => authentication.updatedAt.desc())
      .all(),
    db.orm.aibot.OAuthClient.where({ ownerId: user.id }).all(),
  ]);
  const clientsById = new Map(
    clients.map((client) => [client.id, client.name]),
  );
  return {
    records: authentications.map((authentication) =>
      record(authentication.id, authentication.updatedAt, {
        name: authentication.name,
        oauthId: String(authentication.oauthId),
        oauthName:
          clientsById.get(authentication.oauthId) ?? "不明なクライアント",
        expiresAt: authentication.expiresAt ?? "",
        accessTokenConfigured: "設定済み",
        refreshTokenConfigured: authentication.refreshToken
          ? "設定済み"
          : "未設定",
      }),
    ),
    clientOptions: clients.map((client) => ({
      value: String(client.id),
      label: client.name,
    })),
  };
}

export async function renameOAuthAuthentication(
  user: AuthUser,
  id: number,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  if (!name) return { error: "認証情報名を入力してください。" };
  if (!(await db.orm.aibot.OAuthAuthentication.first({ id, ownerId: user.id })))
    return { error: "OAuth認証情報が見つかりません。" };
  await db.orm.aibot.OAuthAuthentication.where({
    id,
    ownerId: user.id,
  }).update({ name });
  logAuditEvent(
    "oauth.authentication.renamed",
    "oauth_authentication",
    id,
    user.id,
  );
  return { ok: true };
}

export async function deleteOAuthAuthentication(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.OAuthAuthentication.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.OAuthAuthentication.where({
    id,
    ownerId: user.id,
  }).delete();
  logAuditEvent(
    "oauth.authentication.deleted",
    "oauth_authentication",
    id,
    user.id,
  );
  return true;
}
