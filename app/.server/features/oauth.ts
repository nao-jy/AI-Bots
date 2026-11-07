import { timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";
import { redirect } from "react-router";
import { clearCookie, getCookieValue, serializeCookie } from "../../cookie";
import { OAUTH_CALLBACK_PATH } from "../../const";
import type { AuthUser } from "../auth";
import {
  getOwnedOAuthAuthentication,
  getOwnedOAuthClient,
  saveOAuthAuthentication,
} from "../repository/oauth";
import { decryptCredential, encryptCredential, sign } from "../utils";
import { hasResourceAccess } from "../authorization";

const FLOW_COOKIE = "oauth_authorization_flow";
const FLOW_TTL_SECONDS = 10 * 60;
const CALLBACK_PATH = `/${OAUTH_CALLBACK_PATH}`;
export const OAUTH_START_PATH = "/oauth/start";

type OAuthFlow = {
  state: string;
  codeVerifier: string;
  userId: string;
  organizationId: string;
  oauthId: string;
  authenticationId: string | null;
  name: string;
  expiresAt: number;
};

function flowCookie(value: string) {
  return serializeCookie(FLOW_COOKIE, value, {
    path: CALLBACK_PATH,
    maxAge: FLOW_TTL_SECONDS,
    httpOnly: true,
  });
}

function clearFlowCookie() {
  return clearCookie(FLOW_COOKIE, { path: CALLBACK_PATH, httpOnly: true });
}

function readCookie(request: Request, name: string) {
  return getCookieValue(request.headers.get("Cookie"), name) ?? undefined;
}

function verifyFlowPayload(value: string): OAuthFlow | null {
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
      typeof (decoded as OAuthFlow).userId !== "string" ||
      typeof (decoded as OAuthFlow).organizationId !== "string" ||
      typeof (decoded as OAuthFlow).oauthId !== "string" ||
      !(
        (decoded as OAuthFlow).authenticationId === null ||
        typeof (decoded as OAuthFlow).authenticationId === "string"
      ) ||
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

function encodeFlow(flow: OAuthFlow) {
  const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeFlow(request: Request): OAuthFlow | null {
  const value = readCookie(request, FLOW_COOKIE);
  return value ? verifyFlowPayload(value) : null;
}

function getCallbackUrl() {
  const value = process.env.OAUTH_BASE_URL;
  if (!value) throw new Error("server.oauthBaseUrlRequired");
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && url.hostname !== "localhost")
  )
    throw new Error("server.oauthBaseUrlMustBeHttpsOrigin");
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
    throw new Error("server.oauthEndpointMustBeHttpUrl");
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

export async function prepareOAuthAuthorization(
  user: AuthUser,
  form: FormData,
) {
  const name = String(form.get("name") ?? "").trim();
  const idValue = String(form.get("id") ?? "").trim();
  const authenticationId = idValue || null;
  const selectedClientId = String(form.get("oauthId") ?? "");
  if (!name) return { error: "server.oauthAuthenticationNameRequired" };
  if (authenticationId !== null && !/^[0-9a-f-]{36}$/i.test(authenticationId))
    return { error: "server.oauthAuthenticationNotFound" };
  const existing =
    authenticationId === null
      ? null
      : await getOwnedOAuthAuthentication(
          authenticationId,
          user.organizationId,
        );
  if (authenticationId !== null && !existing)
    return { error: "server.oauthAuthenticationNotFound" };
  if (
    authenticationId !== null &&
    !(await hasResourceAccess(user, authenticationId, "update"))
  )
    return { error: "server.oauthAuthenticationNotFound" };
  const oauthId = existing?.oauthId ?? selectedClientId;
  if (!/^[0-9a-f-]{36}$/i.test(oauthId))
    return { error: "server.oauthClientRequired" };
  const oauthClient = await getOwnedOAuthClient(oauthId, user.organizationId);
  if (!oauthClient || !(await hasResourceAccess(user, oauthId, "read")))
    return { error: "server.selectedOauthClientNotFound" };

  try {
    getCallbackUrl();
    configuration(oauthClient);
    const state = oidc.randomState();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const payload = encodeFlow({
      state,
      codeVerifier,
      userId: user.id,
      organizationId: user.organizationId,
      oauthId,
      authenticationId,
      name,
      expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
    } satisfies OAuthFlow);
    return redirect(
      `${OAUTH_START_PATH}?payload=${encodeURIComponent(payload)}`,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "server.oauthAuthorizationStartFailed",
    };
  }
}

export function isValidOAuthLaunchPayload(value: string) {
  return verifyFlowPayload(value);
}

export async function launchOAuthAuthorization(payloadValue: string) {
  const flow = isValidOAuthLaunchPayload(payloadValue);
  if (!flow) return redirect("/oauth-authentications?oauth=error");

  try {
    const oauthClient = await getOwnedOAuthClient(
      flow.oauthId,
      flow.organizationId,
    );
    if (
      !oauthClient ||
      !(await hasResourceAccess(
        { id: flow.userId, organizationId: flow.organizationId },
        flow.oauthId,
        "read",
      ))
    )
      throw new Error("server.oauthClientNotFound");
    const callbackUrl = getCallbackUrl();
    const config = configuration(oauthClient);
    const authorizationHost = new URL(oauthClient.authorizationEndpoint)
      .hostname;
    const isGoogleOAuth =
      authorizationHost === "google.com" ||
      authorizationHost.endsWith(".google.com") ||
      authorizationHost === "googleapis.com" ||
      authorizationHost.endsWith(".googleapis.com");
    const scopes = new Set(oauthClient.scopes);
    if (!isGoogleOAuth) scopes.add("offline_access");
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl.href,
      response_type: "code",
      scope: [...scopes].join(" "),
      ...(isGoogleOAuth ? { access_type: "offline" } : {}),
      prompt: "consent",
      state: flow.state,
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.codeVerifier),
      code_challenge_method: "S256",
    });
    return redirect(authorizationUrl.href, {
      headers: {
        "Set-Cookie": flowCookie(payloadValue),
      },
    });
  } catch {
    return redirect("/oauth-authentications?oauth=error");
  }
}

export async function completeOAuthAuthorization(request: Request) {
  const callbackUrl = getCallbackUrl();
  const requestUrl = new URL(request.url);
  const params = requestUrl.searchParams;
  const authorizationResponseUrl = new URL(callbackUrl);
  authorizationResponseUrl.search = requestUrl.search;
  const flow = decodeFlow(request);
  const clearCookieHeader = clearFlowCookie();
  if (!flow || params.get("state") !== flow.state)
    return redirect("/oauth/complete?status=error", {
      headers: { "Set-Cookie": clearCookieHeader },
    });
  if (params.has("error"))
    return redirect("/oauth/complete?status=denied", {
      headers: { "Set-Cookie": clearCookieHeader },
    });

  try {
    const oauthClient = await getOwnedOAuthClient(
      flow.oauthId,
      flow.organizationId,
    );
    if (
      !oauthClient ||
      !(await hasResourceAccess(
        { id: flow.userId, organizationId: flow.organizationId },
        flow.oauthId,
        "read",
      ))
    )
      throw new Error("server.oauthClientNotFound");
    const config = configuration(oauthClient);
    const tokens = await oidc.authorizationCodeGrant(
      config,
      authorizationResponseUrl,
      {
        expectedState: flow.state,
        pkceCodeVerifier: flow.codeVerifier,
      },
    );
    if (!tokens.access_token) throw new Error("server.oauthAccessTokenMissing");

    const existing = flow.authenticationId
      ? await getOwnedOAuthAuthentication(
          flow.authenticationId,
          flow.organizationId,
        )
      : null;
    if (flow.authenticationId && !existing)
      throw new Error("server.oauthAuthenticationNotFound");
    if (
      flow.authenticationId &&
      !(await hasResourceAccess(
        { id: flow.userId, organizationId: flow.organizationId },
        flow.authenticationId,
        "update",
      ))
    )
      throw new Error("server.oauthAuthenticationNotFound");
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
    await saveOAuthAuthentication(
      flow.organizationId,
      flow.userId,
      existing?.id ?? null,
      saved,
    );
    return redirect("/oauth/complete?status=success", {
      headers: { "Set-Cookie": clearCookieHeader },
    });
  } catch {
    return redirect("/oauth/complete?status=error", {
      headers: { "Set-Cookie": clearCookieHeader },
    });
  }
}
