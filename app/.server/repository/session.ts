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
