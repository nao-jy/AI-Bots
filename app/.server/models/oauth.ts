import { db } from "./db";
import type { AuthUser } from "../auth";
import { encryptCredential, record } from "../utils";

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
        scopes: client.scopes.join(", "),
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
  const scopes = String(values.get("scopes") ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

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
  if (id === null)
    await db.orm.aibot.OAuthClient.create({ ...saved, ownerId: user.id });
  else
    await db.orm.aibot.OAuthClient.where({ id, ownerId: user.id }).update(
      saved,
    );
  return { ok: true };
}

export async function deleteOAuthClient(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.OAuthClient.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.OAuthClient.where({ id, ownerId: user.id }).delete();
  return true;
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
  return { ok: true };
}

export async function deleteOAuthAuthentication(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.OAuthAuthentication.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.OAuthAuthentication.where({
    id,
    ownerId: user.id,
  }).delete();
  return true;
}
