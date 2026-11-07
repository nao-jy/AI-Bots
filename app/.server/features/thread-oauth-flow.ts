import * as oidc from "openid-client";
import { redirect } from "react-router";
import { clearCookie, getCookieValue, serializeCookie } from "../../cookie";
import { decryptCredential, encryptCredential } from "../utils";
import { getOwnedOAuthClient } from "../repository/oauth";
import {
  isThreadOAuthAllowed,
  getThreadOAuthAuthentication,
  saveThreadOAuthAuthentication,
  type ThreadOAuthScope,
} from "../repository/thread-oauth";
import { configuration, getCallbackUrl } from "./oauth";

const COOKIE = "thread_oauth_flow";
const PATH = "/oauth/callback";
const TTL = 10 * 60 * 1000;
type Launch = {
  scope: ThreadOAuthScope;
  expiresAt: number;
  kind: "thread";
  expectedVersion: string | null;
};
type Flow = Launch & { state: string; codeVerifier: string };

function parse<T>(value: string): T | null {
  try {
    return JSON.parse(decryptCredential(value)) as T;
  } catch {
    return null;
  }
}
function validLaunch(value: unknown): value is Launch {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Launch>;
  return (
    item.kind === "thread" &&
    (item.expectedVersion === null ||
      typeof item.expectedVersion === "string") &&
    typeof item.expiresAt === "number" &&
    item.expiresAt > Date.now() &&
    !!item.scope &&
    [
      item.scope.organizationId,
      item.scope.oauthClientId,
      item.scope.chatbotId,
      item.scope.adapterId,
      item.scope.threadId,
    ].every((part) => typeof part === "string" && part.length > 0)
  );
}
export async function createThreadOAuthLaunch(scope: ThreadOAuthScope) {
  const existing = await getThreadOAuthAuthentication(scope);
  return encryptCredential(
    JSON.stringify({
      kind: "thread",
      scope,
      expectedVersion: existing
        ? `${existing.id}:${existing.updatedAt.toISOString()}`
        : null,
      expiresAt: Date.now() + TTL,
    } satisfies Launch),
  );
}
export function isValidThreadOAuthLaunch(value: string) {
  return validLaunch(parse(value));
}
export async function launchThreadOAuth(value: string) {
  const launch = parse<Launch>(value);
  if (!validLaunch(launch) || !(await isThreadOAuthAllowed(launch.scope)))
    return redirect("/oauth/complete?status=error");
  try {
    const client = await getOwnedOAuthClient(
      launch.scope.oauthClientId,
      launch.scope.organizationId,
    );
    if (!client) throw new Error("OAuth client not found");
    const state = oidc.randomState();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const flow: Flow = {
      ...launch,
      expiresAt: Date.now() + TTL,
      state,
      codeVerifier,
    };
    const host = new URL(client.authorizationEndpoint).hostname;
    const google =
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host === "googleapis.com" ||
      host.endsWith(".googleapis.com");
    const scopes = new Set(client.scopes);
    if (!google) scopes.add("offline_access");
    const url = oidc.buildAuthorizationUrl(configuration(client), {
      redirect_uri: getCallbackUrl().href,
      response_type: "code",
      scope: [...scopes].join(" "),
      ...(google ? { access_type: "offline" } : {}),
      prompt: "consent",
      state,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: "S256",
    });
    return redirect(url.href, {
      headers: {
        "Set-Cookie": serializeCookie(
          COOKIE,
          encryptCredential(JSON.stringify(flow)),
          { path: PATH, maxAge: TTL / 1000, httpOnly: true },
        ),
      },
    });
  } catch {
    return redirect("/oauth/complete?status=error");
  }
}

/** Return null when this callback belongs to the management OAuth flow. */
export async function completeThreadOAuth(
  request: Request,
): Promise<Response | null> {
  const encrypted = getCookieValue(request.headers.get("Cookie"), COOKIE);
  if (!encrypted) return null;
  const flow = parse<Flow>(encrypted);
  const url = new URL(request.url);
  if (
    !validLaunch(flow) ||
    !flow ||
    typeof flow.state !== "string" ||
    typeof flow.codeVerifier !== "string" ||
    url.searchParams.get("state") !== flow.state
  )
    return null;
  const headers = {
    "Set-Cookie": clearCookie(COOKIE, { path: PATH, httpOnly: true }),
  };
  if (url.searchParams.has("error"))
    return redirect("/oauth/complete?status=denied", { headers });
  try {
    if (!(await isThreadOAuthAllowed(flow.scope)))
      throw new Error("OAuth configuration changed");
    const client = await getOwnedOAuthClient(
      flow.scope.oauthClientId,
      flow.scope.organizationId,
    );
    if (!client) throw new Error("OAuth client not found");
    const callback = getCallbackUrl();
    callback.search = url.search;
    const tokens = await oidc.authorizationCodeGrant(
      configuration(client),
      callback,
      { expectedState: flow.state, pkceCodeVerifier: flow.codeVerifier },
    );
    if (!tokens.access_token) throw new Error("Missing access token");
    await saveThreadOAuthAuthentication(
      flow.scope,
      {
        accessToken: encryptCredential(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? encryptCredential(tokens.refresh_token)
          : null,
        expiresAt:
          typeof tokens.expires_in === "number"
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
      },
      flow.expectedVersion,
    );
    return redirect("/oauth/complete?status=success", { headers });
  } catch {
    return redirect("/oauth/complete?status=error", { headers });
  }
}
