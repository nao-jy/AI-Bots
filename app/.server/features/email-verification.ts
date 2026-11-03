import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { findUserById, markEmailVerified } from "../repository/users";
import { getEmailProvider } from "./email-providers";

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

type EmailVerificationPayload = {
  userId: number;
  emailHash: string;
  expiresAt: number;
};

function hashEmail(email: string) {
  return createHash("sha256").update(email).digest("base64url");
}

function signingKey() {
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
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest("base64url");
}

function createVerificationToken(userId: number, email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      emailHash: hashEmail(email),
      expiresAt: Date.now() + EMAIL_VERIFICATION_TTL_MS,
    } satisfies EmailVerificationPayload),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeVerificationToken(token: string): {
  payload: EmailVerificationPayload | null;
  expired: boolean;
} {
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
      !Number.isSafeInteger((value as EmailVerificationPayload).userId) ||
      typeof (value as EmailVerificationPayload).emailHash !== "string" ||
      !Number.isSafeInteger((value as EmailVerificationPayload).expiresAt)
    )
      return { payload: null, expired: false };

    const payload = value as EmailVerificationPayload;
    return {
      payload: payload.expiresAt > Date.now() ? payload : null,
      expired: payload.expiresAt <= Date.now(),
    };
  } catch {
    return { payload: null, expired: false };
  }
}

export function isEmailVerificationEnabled() {
  return getEmailProvider() !== null;
}

export async function sendEmailVerification(
  user: { id: number; email: string; name: string | null },
  requestUrl: string,
) {
  const provider = getEmailProvider();
  if (!provider) return false;

  const token = createVerificationToken(user.id, user.email);
  const baseUrl = process.env.PUBLIC_APP_URL || new URL(requestUrl).origin;
  const verificationUrl = new URL("/verify-email", baseUrl);
  verificationUrl.searchParams.set("token", token);
  await provider.sendVerificationEmail({
    to: user.email,
    name: user.name,
    verificationUrl: verificationUrl.toString(),
  });
  return true;
}

async function resolveVerification(token: string) {
  const decoded = decodeVerificationToken(token);
  if (decoded.expired) return { status: "expired" as const };
  if (!decoded.payload) return { status: "invalid" as const };

  const { userId, emailHash } = decoded.payload;
  const user = await findUserById(userId);
  if (!user || hashEmail(user.email) !== emailHash)
    return { status: "invalid" as const };
  if (user.emailVerified) return { status: "already-verified" as const };
  return { status: "ready" as const, userId };
}

export async function inspectEmailVerification(token: string) {
  return (await resolveVerification(token)).status;
}

export async function verifyEmail(token: string) {
  const resolved = await resolveVerification(token);
  if (resolved.status !== "ready") return resolved.status;

  await markEmailVerified(resolved.userId);
  return "verified" as const;
}
