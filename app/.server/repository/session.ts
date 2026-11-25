import { kysely } from "./kysely";
import type { Selectable } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import type { UserTable } from "./db-schema";
import { logAuditEvent } from "../logger/audit-logger";

export async function createSession(
  tokenHash: string,
  userId: string,
  expiresAt: Date,
  organizationId: string,
  mfaVerified = true,
) {
  await kysely
    .insertInto("aibot.Session")
    .values({
      tokenHash,
      userId,
      organizationId,
      expiresAt: expiresAt.toISOString(),
      mfaVerified,
      updatedAt: new Date(),
    })
    .execute();
  logAuditEvent(
    "auth.session.created",
    "user",
    userId,
    mfaVerified ? userId : undefined,
  );
}

export async function createPendingSession(
  tokenHash: string,
  userId: string,
  expiresAt: Date,
) {
  const user = await kysely
    .selectFrom("aibot.User")
    .select("organizationId")
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) throw new Error("User not found");
  return createSession(
    tokenHash,
    userId,
    expiresAt,
    user.organizationId,
    false,
  );
}

export async function getPendingSession(tokenHash: string) {
  const session = await kysely
    .selectFrom("aibot.Session")
    .selectAll("aibot.Session")
    .select((eb) => [
      jsonObjectFrom(
        eb
          .selectFrom("aibot.User")
          .selectAll()
          .whereRef("aibot.User.id", "=", "aibot.Session.userId"),
      ).as("user"),
    ])
    .where("aibot.Session.tokenHash", "=", tokenHash)
    .where("aibot.Session.mfaVerified", "=", false)
    .executeTakeFirst();
  return session
    ? { ...session, user: session.user as unknown as Selectable<UserTable> }
    : undefined;
}

export async function completePendingSession(
  tokenHash: string,
  userId: string,
  expiresAt: Date,
) {
  const completed = await kysely.transaction().execute(async (tx) => {
    const session = await tx
      .selectFrom("aibot.Session")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("userId", "=", userId)
      .where("mfaVerified", "=", false)
      .forUpdate()
      .executeTakeFirst();
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return false;
    await tx
      .updateTable("aibot.Session")
      .set({ mfaVerified: true, expiresAt: expiresAt.toISOString() })
      .where("id", "=", session.id)
      .execute();
    return true;
  });
  if (completed) logAuditEvent("auth.login.succeeded", "user", userId, userId);
  return completed;
}

export async function recordPendingMfaFailure(tokenHash: string) {
  const outcome = await kysely.transaction().execute(async (tx) => {
    const session = await tx
      .selectFrom("aibot.Session")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("mfaVerified", "=", false)
      .forUpdate()
      .executeTakeFirst();
    if (!session) return { locked: true, userId: null };

    const mfaAttempts = session.mfaAttempts + 1;
    await tx
      .updateTable("aibot.Session")
      .set({
        mfaAttempts,
        ...(mfaAttempts >= 5 ? { expiresAt: new Date().toISOString() } : {}),
      })
      .where("id", "=", session.id)
      .execute();
    return { locked: mfaAttempts >= 5, userId: session.userId };
  });
  if (outcome.userId !== null)
    logAuditEvent("auth.mfa.failed", "user", outcome.userId);
  return outcome.locked;
}

export async function expireSessionByToken(tokenHash: string) {
  const session = await kysely
    .selectFrom("aibot.Session")
    .select(["id", "userId"])
    .where("tokenHash", "=", tokenHash)
    .executeTakeFirst();
  if (!session) return;
  await kysely
    .updateTable("aibot.Session")
    .set({ expiresAt: new Date().toISOString() })
    .where("tokenHash", "=", tokenHash)
    .execute();
  logAuditEvent("auth.session.expired", "user", session.userId);
}

export async function getSessionUser(tokehHash: string) {
  const session = await kysely
    .selectFrom("aibot.Session")
    .selectAll("aibot.Session")
    .select((eb) => [
      jsonObjectFrom(
        eb
          .selectFrom("aibot.User")
          .selectAll()
          .whereRef("aibot.User.id", "=", "aibot.Session.userId"),
      ).as("user"),
    ])
    .where("aibot.Session.tokenHash", "=", tokehHash)
    .executeTakeFirst();
  return session
    ? { ...session, user: session.user as unknown as Selectable<UserTable> }
    : undefined;
}
