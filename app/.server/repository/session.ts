import { db } from "./db";

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
  return db.transaction(async (tx) => {
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
}

export async function recordPendingMfaFailure(tokenHash: string) {
  return db.transaction(async (tx) => {
    const session = await tx.orm.aibot.Session.where({
      tokenHash,
      mfaVerified: false,
    })
      .forUpdate()
      .first();
    if (!session) return true;

    const mfaAttempts = session.mfaAttempts + 1;
    await tx.orm.aibot.Session.where({ id: session.id }).update({
      mfaAttempts,
      ...(mfaAttempts >= 5
        ? { expiresAt: new Date().toISOString() }
        : {}),
    });
    return mfaAttempts >= 5;
  });
}

export async function expireSessionByToken(tokenHash: string) {
  await db.orm.aibot.Session.where({
    tokenHash: tokenHash,
  }).update({ expiresAt: new Date().toISOString() });
}

export async function getSessionUser(tokehHash: string) {
  const session = await db.orm.aibot.Session.include("user").first({
    tokenHash: tokehHash,
  });
  return session;
}
