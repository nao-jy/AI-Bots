import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { APP_NAME } from "../../const";
import { getAppSettings } from "../repository/app-settings";
import { saveMfaSecret } from "../repository/users";
import {
  createPendingSession as createPendingSessionInner,
  getPendingSession,
  completePendingSession,
  recordPendingMfaFailure,
} from "../repository/session";
import { decryptCredential, encryptCredential } from "../utils";
import { getSessionToken, hashSessionToken } from "../auth";

const MFA_SETUP_COOKIE = "bot_manager_mfa_setup";
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;

type SetupChallenge = {
  userId: number;
  secret: string;
  expiresAt: number;
};

export function createMfaSecret() {
  return generateSecret();
}

function secureCookie() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function serializeCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/mfa; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureCookie()}`;
}

export function clearMfaSetupCookie() {
  return serializeCookie(MFA_SETUP_COOKIE, "", 0);
}

function encodeSetupChallenge(challenge: SetupChallenge) {
  return encryptCredential(JSON.stringify(challenge)).replaceAll(".", "~");
}

function decodeSetupChallenge(request: Request): SetupChallenge | null {
  const value = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${MFA_SETUP_COOKIE}=`))
    ?.slice(MFA_SETUP_COOKIE.length + 1);
  if (!value) return null;

  try {
    const decoded: unknown = JSON.parse(
      decryptCredential(value.replaceAll("~", ".")),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      !Number.isSafeInteger((decoded as SetupChallenge).userId) ||
      typeof (decoded as SetupChallenge).secret !== "string" ||
      !Number.isSafeInteger((decoded as SetupChallenge).expiresAt) ||
      (decoded as SetupChallenge).expiresAt <= Date.now()
    )
      return null;
    return decoded as SetupChallenge;
  } catch {
    return null;
  }
}

export async function createMfaLoginChallenge(
  userId: number,
  secret?: string,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
  await createPendingSessionInner(hashSessionToken(token), userId, expiresAt);
  return {
    token,
    expiresAt,
    setupCookie: secret
      ? serializeCookie(
          MFA_SETUP_COOKIE,
          encodeSetupChallenge({
            userId,
            secret,
            expiresAt: expiresAt.getTime(),
          }),
          MFA_CHALLENGE_TTL_MS / 1000,
        )
      : clearMfaSetupCookie(),
  };
}

export async function getMfaChallenge(request: Request) {
  const token = getSessionToken(request);
  if (!token) return null;
  const session = await getPendingSession(hashSessionToken(token));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  if (session.mfaAttempts >= 5) return null;

  if (session.user.mfaSecret) {
    return {
      user: session.user,
      stage: "verify" as const,
      secret: decryptCredential(session.user.mfaSecret),
    };
  }

  const setup = decodeSetupChallenge(request);
  if (!setup || setup.userId !== session.user.id) return null;
  return { user: session.user, stage: "setup" as const, secret: setup.secret };
}

export async function getMfaSetupUri(secret: string, email: string) {
  return generateURI({ issuer: APP_NAME, label: email, secret });
}

export async function verifyMfaCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  return (await verify({ secret, token: code })).valid;
}

export async function recordMfaFailure(request: Request) {
  const token = getSessionToken(request);
  if (!token) return true;
  return recordPendingMfaFailure(hashSessionToken(token));
}

export async function finishMfaSetup(
  request: Request,
  userId: number,
  secret: string,
) {
  const token = getSessionToken(request);
  if (!token) return null;
  const session = await getPendingSession(hashSessionToken(token));
  if (!session || session.user.id !== userId || session.user.mfaSecret)
    return null;

  await saveMfaSecret(userId, encryptCredential(secret));
  return finishMfaLogin(token, userId);
}

export async function finishMfaLogin(token: string, userId: number) {
  const settings = await getAppSettings();
  const expiresAt = new Date(
    Date.now() + settings.sessionDurationSeconds * 1000,
  );
  const completed = await completePendingSession(
    hashSessionToken(token),
    userId,
    expiresAt,
  );
  return completed ? { expiresAt } : null;
}
