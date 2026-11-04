import { db } from "./db";
import { logAuditEvent } from "../logger/audit-logger";

export async function createSession(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
  mfaVerified = true,
) {
  await db.orm.aibot.Session.create({
    tokenHash: tokenHash,
    userId,
    expiresAt: expiresAt.toISOString(),
    mfaVerified,
  });
  logAuditEvent(
    "auth.session.created",
    "user",
    userId,
    mfaVerified ? userId : undefined,
  );
}

export async function createPendingSession(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
) {
  return createSession(tokenHash, userId, expiresAt, false);
}

export async function getPendingSession(tokenHash: string) {
  const session = await db.orm.aibot.Session.include("user").first({
    tokenHash,
    mfaVerified: false,
  });
  return session;
}

export async function completePendingSession(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
) {
  const completed = await db.transaction(async (tx) => {
    const session = await tx.orm.aibot.Session.where({
      tokenHash,
      userId,
      mfaVerified: false,
    })
      .forUpdate()
      .first();
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return false;
    await tx.orm.aibot.Session.where({ id: session.id }).update({
      mfaVerified: true,
      expiresAt: expiresAt.toISOString(),
    });
    return true;
  });
  if (completed) logAuditEvent("auth.login.succeeded", "user", userId, userId);
  return completed;
}

export async function recordPendingMfaFailure(tokenHash: string) {
  const outcome = await db.transaction(async (tx) => {
    const session = await tx.orm.aibot.Session.where({
      tokenHash,
      mfaVerified: false,
    })
      .forUpdate()
      .first();
    if (!session) return { locked: true, userId: null };

    const mfaAttempts = session.mfaAttempts + 1;
    await tx.orm.aibot.Session.where({ id: session.id }).update({
      mfaAttempts,
      ...(mfaAttempts >= 5
        ? { expiresAt: new Date().toISOString() }
        : {}),
    });
    return { locked: mfaAttempts >= 5, userId: session.userId };
  });
  if (outcome.userId !== null)
    logAuditEvent("auth.mfa.failed", "user", outcome.userId);
  return outcome.locked;
}

export async function expireSessionByToken(tokenHash: string) {
  const session = await db.orm.aibot.Session.first({ tokenHash });
  if (!session) return;
  await db.orm.aibot.Session.where({ tokenHash }).update({
    expiresAt: new Date().toISOString(),
  });
  logAuditEvent("auth.session.expired", "user", session.userId);
}

export async function getSessionUser(tokehHash: string) {
  const session = await db.orm.aibot.Session.include("user").first({
    tokenHash: tokehHash,
  });
  return session;
}
