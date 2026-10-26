import { db } from "./db";

export async function createSession(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
) {
  await db.orm.aibot.Session.create({
    tokenHash: tokenHash,
    userId,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function deleteSessionByToken(tokenHash: string) {
  await db.orm.aibot.Session.where({
    tokenHash: tokenHash,
  }).delete();
}

export async function deleteSessionById(sessionId: number) {
  await db.orm.aibot.Session.where({
    id: sessionId,
  }).delete();
}

export async function getSessionUser(tokehHash: string) {
  const session = await db.orm.aibot.Session.include("user").first({
    tokenHash: tokehHash,
  });
  return session;
}
