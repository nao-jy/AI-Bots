import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword } from "../auth";
import {
  findUserByEmail,
  findUserById,
  resetUserPassword,
} from "../repository/users";
import { getEmailProvider } from "./email-providers";

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

type PasswordResetPayload = {
  userId: number;
  emailHash: string;
  passwordHashDigest: string;
  expiresAt: number;
};

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function signingKey() {
  const encoded = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded)
    throw new Error("server.credentialsEncryptionKeyRequired");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEYは32バイトのbase64値にしてください。",
    );
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function createPasswordResetToken(user: {
  id: number;
  email: string;
  passwordHash: string;
}) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      userId: user.id,
      emailHash: hashValue(user.email),
      passwordHashDigest: hashValue(user.passwordHash),
      expiresAt: Date.now() + PASSWORD_RESET_TTL_MS,
    } satisfies PasswordResetPayload),
  ).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodePasswordResetToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 2048)
    return { payload: null, expired: false };
  const [encodedPayload, suppliedSignature] = parts;

  const expectedSignature = Buffer.from(sign(encodedPayload));
  const actualSignature = Buffer.from(suppliedSignature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  )
    return { payload: null, expired: false };

  try {
    const value: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (
      !value ||
      typeof value !== "object" ||
      !Number.isSafeInteger((value as PasswordResetPayload).userId) ||
      typeof (value as PasswordResetPayload).emailHash !== "string" ||
      typeof (value as PasswordResetPayload).passwordHashDigest !== "string" ||
      !Number.isSafeInteger((value as PasswordResetPayload).expiresAt)
    )
      return { payload: null, expired: false };

    const payload = value as PasswordResetPayload;
    return {
      payload: payload.expiresAt > Date.now() ? payload : null,
      expired: payload.expiresAt <= Date.now(),
    };
  } catch {
    return { payload: null, expired: false };
  }
}

export function isPasswordResetEnabled() {
  return getEmailProvider() !== null;
}

export async function sendPasswordResetEmail(
  email: string,
  requestUrl: string,
) {
  const provider = getEmailProvider();
  if (!provider) return false;

  const user = await findUserByEmail(email);
  if (!user || !user.emailVerified) return false;

  const token = createPasswordResetToken(user);
  const baseUrl = process.env.PUBLIC_APP_URL || new URL(requestUrl).origin;
  const resetUrl = new URL("/reset-password", baseUrl);
  resetUrl.searchParams.set("token", token);
  await provider.sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl: resetUrl.toString(),
  });
  return true;
}

async function resolvePasswordReset(token: string) {
  const decoded = decodePasswordResetToken(token);
  if (decoded.expired) return { status: "expired" as const };
  if (!decoded.payload) return { status: "invalid" as const };

  const { userId, emailHash, passwordHashDigest } = decoded.payload;
  const user = await findUserById(userId);
  if (
    !user ||
    !user.emailVerified ||
    hashValue(user.email) !== emailHash ||
    hashValue(user.passwordHash) !== passwordHashDigest
  )
    return { status: "invalid" as const };
  return { status: "ready" as const, userId, passwordHashDigest };
}

export async function inspectPasswordReset(token: string) {
  return (await resolvePasswordReset(token)).status;
}

export async function completePasswordReset(token: string, password: string) {
  const resolved = await resolvePasswordReset(token);
  if (resolved.status !== "ready") return resolved;
  if (password.length < 12)
    return { status: "weak-password" as const };

  const updated = await resetUserPassword(
    resolved.userId,
    resolved.passwordHashDigest,
    await hashPassword(password),
    resolved.userId,
  );
  return updated
    ? { status: "reset" as const }
    : { status: "invalid" as const };
}
