import { createHmac, timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";
import { redirect } from "react-router";
import { OAUTH_CALLBACK_PATH } from "../../const";
import type { AuthUser } from "../auth";
import {
  getOwnedOAuthAuthentication,
  getOwnedOAuthClient,
  saveOAuthAuthentication,
} from "../repository/oauth";
import { decryptCredential, encryptCredential } from "../utils";

const FLOW_COOKIE = "oauth_authorization_flow";
const FLOW_TTL_SECONDS = 10 * 60;
const CALLBACK_PATH = `/${OAUTH_CALLBACK_PATH}`;

type OAuthFlow = {
  state: string;
  codeVerifier: string;
  userId: number;
  oauthId: number;
  authenticationId: number | null;
  name: string;
  expiresAt: number;
};

function encryptionKey() {
  const encoded = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded)
    throw new Error("CREDENTIALS_ENCRYPTION_KEYを設定してください。");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEYは32バイトのbase64値にしてください。",
    );
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", encryptionKey())
    .update(payload)
    .digest("base64url");
}

function secureCookie() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function flowCookie(value: string) {
  return `${FLOW_COOKIE}=${value}; Path=${CALLBACK_PATH}; Max-Age=${FLOW_TTL_SECONDS}; HttpOnly; SameSite=Lax${secureCookie()}`;
}

function clearFlowCookie() {
  return `${FLOW_COOKIE}=; Path=${CALLBACK_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie()}`;
}

function readCookie(request: Request, name: string) {
  return (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function decodeFlow(request: Request): OAuthFlow | null {
  const value = readCookie(request, FLOW_COOKIE);
  if (!value) return null;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return null;
  try {
    const expectedSignature = Buffer.from(sign(payload));
    const actualSignature = Buffer.from(suppliedSignature);
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    )
      return null;
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof (decoded as OAuthFlow).state !== "string" ||
      typeof (decoded as OAuthFlow).codeVerifier !== "string" ||
      typeof (decoded as OAuthFlow).userId !== "number" ||
      typeof (decoded as OAuthFlow).oauthId !== "number" ||
      typeof (decoded as OAuthFlow).name !== "string" ||
      typeof (decoded as OAuthFlow).expiresAt !== "number"
    )
      return null;
    const flow = decoded as OAuthFlow;
    if (flow.expiresAt <= Date.now()) return null;
    return flow;
  } catch {
    return null;
  }
}

function getCallbackUrl() {
  const value = process.env.OAUTH_BASE_URL;
  if (!value) throw new Error("OAUTH_BASE_URLを設定してください。");
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && url.hostname !== "localhost")
  )
    throw new Error(
      "OAUTH_BASE_URLにはパスなしのHTTPSオリジンを設定してください。",
    );
  return new URL(CALLBACK_PATH, url.origin);
}

function configuration(client: {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string | null;
}) {
  const secret = client.clientSecret
    ? decryptCredential(client.clientSecret)
    : undefined;
  const authorizationEndpoint = new URL(client.authorizationEndpoint);
  const tokenEndpoint = new URL(client.tokenEndpoint);
  if (
    !["https:", "http:"].includes(authorizationEndpoint.protocol) ||
    !["https:", "http:"].includes(tokenEndpoint.protocol)
  )
    throw new Error(
      "OAuthエンドポイントにはHTTPまたはHTTPSを指定してください。",
    );
  const server = {
    issuer: authorizationEndpoint.origin,
    authorization_endpoint: authorizationEndpoint.href,
    token_endpoint: tokenEndpoint.href,
  } as oidc.ServerMetadata;
  return new oidc.Configuration(
    server,
    client.clientId,
    secret,
    secret ? oidc.ClientSecretPost(secret) : oidc.None(),
  );
}

export async function startOAuthAuthorization(user: AuthUser, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const idValue = String(form.get("id") ?? "").trim();
  const authenticationId = idValue ? Number(idValue) : null;
  const selectedClientId = Number(form.get("oauthId"));
  if (!name) return { error: "認証情報名を入力してください。" };
  if (authenticationId !== null && !Number.isInteger(authenticationId))
    return { error: "OAuth認証情報が見つかりません。" };
  const existing =
    authenticationId === null
      ? null
      : await getOwnedOAuthAuthentication(authenticationId, user.id);
  if (authenticationId !== null && !existing)
    return { error: "OAuth認証情報が見つかりません。" };
  const oauthId = existing?.oauthId ?? selectedClientId;
  if (!Number.isInteger(oauthId))
    return { error: "OAuthクライアントを選択してください。" };
  const oauthClient = await getOwnedOAuthClient(oauthId, user.id);
  if (!oauthClient)
    return { error: "選択したOAuthクライアントが見つかりません。" };

  try {
    const callbackUrl = getCallbackUrl();
    const config = configuration(oauthClient);
    const state = oidc.randomState();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const authorizationHost = new URL(
      oauthClient.authorizationEndpoint,
    ).hostname;
    const isGoogleOAuth =
      authorizationHost === "google.com" ||
      authorizationHost.endsWith(".google.com") ||
      authorizationHost === "googleapis.com" ||
      authorizationHost.endsWith(".googleapis.com");
    const scopes = new Set(oauthClient.scopes);
    if (!isGoogleOAuth) scopes.add("offline_access");
    const payload = Buffer.from(
      JSON.stringify({
        state,
        codeVerifier,
        userId: user.id,
        oauthId,
        authenticationId,
        name,
        expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
      } satisfies OAuthFlow),
    ).toString("base64url");
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl.href,
      response_type: "code",
      scope: [...scopes].join(" "),
      ...(isGoogleOAuth ? { access_type: "offline" } : {}),
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return redirect(authorizationUrl.href, {
      headers: { "Set-Cookie": flowCookie(`${payload}.${sign(payload)}`) },
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "OAuth認証を開始できませんでした。",
    };
  }
}

export async function completeOAuthAuthorization(
  request: Request,
  user: AuthUser,
) {
  const callbackUrl = getCallbackUrl();
  const requestUrl = new URL(request.url);
  const params = requestUrl.searchParams;
  const authorizationResponseUrl = new URL(callbackUrl);
  authorizationResponseUrl.search = requestUrl.search;
  const flow = decodeFlow(request);
  const clearCookie = clearFlowCookie();
  if (!flow || flow.userId !== user.id || params.get("state") !== flow.state)
    return redirect("/oauth-authentications?oauth=error", {
      headers: { "Set-Cookie": clearCookie },
    });
  if (params.has("error"))
    return redirect("/oauth-authentications?oauth=denied", {
      headers: { "Set-Cookie": clearCookie },
    });

  try {
    const oauthClient = await getOwnedOAuthClient(flow.oauthId, user.id);
    if (!oauthClient) throw new Error("OAuthクライアントが見つかりません。");
    const config = configuration(oauthClient);
    const tokens = await oidc.authorizationCodeGrant(
      config,
      authorizationResponseUrl,
      {
        expectedState: flow.state,
        pkceCodeVerifier: flow.codeVerifier,
      },
    );
    if (!tokens.access_token)
      throw new Error(
        "OAuthサーバーからアクセストークンが返されませんでした。",
      );

    const existing = flow.authenticationId
      ? await getOwnedOAuthAuthentication(flow.authenticationId, user.id)
      : null;
    if (flow.authenticationId && !existing)
      throw new Error("OAuth認証情報が見つかりません。");
    const expiresAt =
      typeof tokens.expires_in === "number"
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;
    const saved = {
      name: flow.name,
      oauthId: flow.oauthId,
      accessToken: encryptCredential(tokens.access_token),
      refreshToken: tokens.refresh_token
        ? encryptCredential(tokens.refresh_token)
        : (existing?.refreshToken ?? null),
      expiresAt,
    };
    await saveOAuthAuthentication(user.id, existing?.id ?? null, saved);
    return redirect("/oauth-authentications?oauth=success", {
      headers: { "Set-Cookie": clearCookie },
    });
  } catch {
    return redirect("/oauth-authentications?oauth=error", {
      headers: { "Set-Cookie": clearCookie },
    });
  }
}
