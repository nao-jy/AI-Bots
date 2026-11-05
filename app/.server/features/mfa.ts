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
import { clearCookie, getCookieValue, serializeCookie } from "../../cookie";

const MFA_SETUP_COOKIE = "bot_manager_mfa_setup";
const LEGACY_MFA_SETUP_COOKIE_PATH = "/mfa";
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;

type SetupChallenge = {
  userId: number;
  secret: string;
  expiresAt: number;
};

export function createMfaSecret() {
  return generateSecret();
}

function clearLegacyMfaSetupCookie() {
  return clearCookie(MFA_SETUP_COOKIE, {
    path: LEGACY_MFA_SETUP_COOKIE_PATH,
    httpOnly: true,
    sameSite: "strict",
  });
}

export function clearMfaSetupCookies() {
  return [
    clearCookie(MFA_SETUP_COOKIE, { httpOnly: true, sameSite: "strict" }),
    clearLegacyMfaSetupCookie(),
  ];
}

function encodeSetupChallenge(challenge: SetupChallenge) {
  return encryptCredential(JSON.stringify(challenge)).replaceAll(".", "~");
}

function createSetupCookie(
  userId: number,
  secret: string,
  expiresAt: Date,
) {
  return serializeCookie(
    MFA_SETUP_COOKIE,
    encodeSetupChallenge({
      userId,
      secret,
      expiresAt: expiresAt.getTime(),
    }),
    {
      maxAge: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
      httpOnly: true,
      sameSite: "strict",
    },
  );
}

function decodeSetupChallenge(request: Request): SetupChallenge | null {
  const value = getCookieValue(request.headers.get("Cookie"), MFA_SETUP_COOKIE);
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
    setupCookies: secret
      ? [createSetupCookie(userId, secret, expiresAt), clearLegacyMfaSetupCookie()]
      : clearMfaSetupCookies(),
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
  if (setup && setup.userId === session.user.id) {
    return {
      user: session.user,
      stage: "setup" as const,
      secret: setup.secret,
    };
  }

  const secret = createMfaSecret();
  const expiresAt = new Date(session.expiresAt);
  return {
    user: session.user,
    stage: "setup" as const,
    secret,
    setupCookies: [
      createSetupCookie(session.user.id, secret, expiresAt),
      clearLegacyMfaSetupCookie(),
    ],
  };
}

export async function getMfaSetupUri(secret: string, email: string) {
  return generateURI({
    issuer: APP_NAME,
    label: email,
    secret,
    algorithm: "sha1",
    digits: 6,
    period: 30,
  });
}

export async function verifyMfaCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  return (
    await verify({
      secret,
      token: code,
      algorithm: "sha1",
      digits: 6,
      period: 30,
      epochTolerance: 30,
    })
  ).valid;
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

  await saveMfaSecret(userId, encryptCredential(secret), userId);
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
