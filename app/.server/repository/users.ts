import { createHash } from "node:crypto";
import { db } from "./db";
import { kysely } from "./kysely";
import { hashPassword } from "../auth";
import { generateResourceId, record, timestamp } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { getAppSettings } from "./app-settings";
import { meetsPasswordPolicy } from "../password-policy";

export async function hasUsers() {
  return Boolean(
    await kysely
      .selectFrom("aibot.User")
      .select("id")
      .limit(1)
      .executeTakeFirst(),
  );
}

export async function findUserByEmail(email: string) {
  return kysely
    .selectFrom("aibot.User")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

export async function findUserById(id: string) {
  return kysely
    .selectFrom("aibot.User")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function markEmailVerified(id: string, actorId?: string) {
  await kysely
    .updateTable("aibot.User")
    .set({ emailVerified: true, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
  logAuditEvent("user.email_verified", "user", id, actorId);
}

export async function resetUserPassword(
  id: string,
  expectedPasswordHashDigest: string,
  passwordHash: string,
  actorId?: string,
) {
  const updated = await kysely.transaction().execute(async (tx) => {
    const user = await tx
      .selectFrom("aibot.User")
      .select(["passwordHash"])
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (
      !user ||
      createHash("sha256").update(user.passwordHash).digest("base64url") !==
        expectedPasswordHashDigest
    )
      return false;

    const now = new Date();
    await tx
      .updateTable("aibot.User")
      .set({ passwordHash, updatedAt: now })
      .where("id", "=", id)
      .execute();
    await tx
      .updateTable("aibot.Session")
      .set({ expiresAt: now.toISOString(), updatedAt: now })
      .where("userId", "=", id)
      .execute();
    return true;
  });
  if (updated) logAuditEvent("user.password_reset", "user", id, actorId);
  return updated;
}

export async function saveMfaSecret(
  id: string,
  mfaSecret: string,
  actorId?: string,
) {
  await kysely
    .updateTable("aibot.User")
    .set({ mfaSecret, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
  logAuditEvent("user.mfa_configured", "user", id, actorId);
}

export async function createUser(values: {
  email: string;
  name: string;
  passwordHash: string;
  isAdmin: boolean;
  emailVerified: boolean;
  organizationId?: string;
  organizationName?: string;
}) {
  const user = await kysely.transaction().execute(async (tx) => {
    const {
      organizationId: providedOrganizationId,
      organizationName,
      ...userValues
    } = values;
    let organizationId = providedOrganizationId;
    if (!organizationId) {
      const name = organizationName?.trim();
      if (!name)
        throw new Error("Organization name is required for the first account");
      const organization = await tx
        .insertInto("aibot.Organization")
        .values({ id: generateResourceId(), name, updatedAt: new Date() })
        .returning("id")
        .executeTakeFirstOrThrow();
      organizationId = organization.id;
    }
    const id = generateResourceId();
    await tx
      .insertInto("aibot.PrincipalBase")
      .values({ id, organizationId })
      .execute();
    return tx
      .insertInto("aibot.User")
      .values({ ...userValues, id, organizationId, updatedAt: new Date() })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
  logAuditEvent("user.created", "user", user.id);
  return user;
}

export async function listUsers(
  emailVerificationEnabled: boolean,
  maxLoginAttempts: number,
  organizationId: string,
  ids: string[],
) {
  if (!emailVerificationEnabled) {
    const pendingUsers = await db.orm.aibot.User.where({
      emailVerified: false,
      organizationId,
    }).all();
    if (pendingUsers.length) {
      await db.orm.aibot.User.where({
        emailVerified: false,
        organizationId,
      }).update({
        emailVerified: true,
      });
      for (const user of pendingUsers)
        logAuditEvent("user.email_verified", "user", user.id);
    }
  }
  const users = await db.orm.aibot.User.where({ organizationId })
    .where((user) => user.id.in(ids))
    .include("sessions")
    .orderBy((user) => user.createdAt.asc())
    .all();
  const now = Date.now();
  return users.map((user) => {
    const sessions = user.sessions.sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    const active = sessions.some(
      (session) => Date.parse(session.expiresAt) > now,
    );
    return record(user.id, user.updatedAt, {
      name: user.name ?? "",
      email: user.email,
      isAdmin: user.isAdmin ? "server.administrator" : "server.regularUser",
      emailVerified: user.emailVerified,
      emailVerification: user.emailVerified
        ? "server.verified"
        : "server.unverified",
      mfaConfigured: Boolean(user.mfaSecret),
      mfaStatus: user.mfaSecret ? "server.configured" : "server.notConfigured",
      loginLocked: user.loginAttempts >= maxLoginAttempts,
      loginLockStatus:
        user.loginAttempts >= maxLoginAttempts ? "server.locked" : "—",
      loginActive: active,
      loginStatus: active ? "server.loggedIn" : "server.loggedOut",
      lastLogin: sessions[0] ? timestamp(sessions[0].createdAt) : "—",
    });
  });
}

export async function recordFailedLoginAttempt(
  id: string,
  maxLoginAttempts: number,
) {
  const outcome = await kysely.transaction().execute(async (tx) => {
    const user = await tx
      .selectFrom("aibot.User")
      .select("loginAttempts")
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!user || user.loginAttempts >= maxLoginAttempts)
      return { result: "locked" as const, attempts: null };

    const loginAttempts = user.loginAttempts + 1;
    await tx
      .updateTable("aibot.User")
      .set({ loginAttempts, updatedAt: new Date() })
      .where("id", "=", id)
      .execute();
    return {
      result:
        loginAttempts >= maxLoginAttempts
          ? ("locked" as const)
          : ("failed" as const),
      attempts: loginAttempts,
    };
  });
  if (outcome.attempts !== null) logAuditEvent("auth.login.failed", "user", id);
  return outcome.result;
}

export async function resetLoginAttemptsForLogin(
  id: string,
  maxLoginAttempts: number,
) {
  return kysely.transaction().execute(async (tx) => {
    const user = await tx
      .selectFrom("aibot.User")
      .select("loginAttempts")
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!user || user.loginAttempts >= maxLoginAttempts) return false;
    if (user.loginAttempts > 0)
      await tx
        .updateTable("aibot.User")
        .set({ loginAttempts: 0, updatedAt: new Date() })
        .where("id", "=", id)
        .execute();
    return true;
  });
}

export async function unlockUserLogin(id: string, organizationId: string) {
  const user = await kysely
    .selectFrom("aibot.User")
    .select("id")
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();
  if (!user) return { error: "server.userNotFound" };
  await kysely
    .updateTable("aibot.User")
    .set({ loginAttempts: 0, updatedAt: new Date() })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();
  logAuditEvent("user.login_unlocked", "user", id);
  return { ok: true };
}

export async function saveUser(
  id: string | null,
  values: FormData,
  emailVerificationEnabled: boolean,
  organizationId: string,
) {
  const name = String(values.get("name") ?? "").trim();
  const email = String(values.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(values.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return { error: "server.displayNameAndValidEmailRequired" };
  if (id === null) {
    const settings = await getAppSettings(organizationId);
    if (!meetsPasswordPolicy(password, settings.minimumPasswordStrength, email))
      return { error: "server.passwordStrengthInsufficient" };
    const emailVerified = !emailVerificationEnabled;
    const user = await createUser({
      name,
      email,
      passwordHash: await hashPassword(password),
      isAdmin: false,
      emailVerified,
      organizationId,
    });
    return { ok: true, verificationRequired: !emailVerified };
  } else {
    const user = await db.orm.aibot.User.first({ id, organizationId });
    if (!user) return { error: "server.userNotFound" };
    if (password) {
      const settings = await getAppSettings(organizationId);
      if (
        !meetsPasswordPolicy(password, settings.minimumPasswordStrength, email)
      )
        return { error: "server.passwordStrengthInsufficient" };
    }
    const emailChanged = user.email !== email;
    const emailVerified = emailChanged
      ? !emailVerificationEnabled
      : user.emailVerified;
    await db.orm.aibot.User.where({ id, organizationId }).update({
      name,
      email,
      emailVerified,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
    if (emailChanged) logAuditEvent("user.email_changed", "user", id);
    if (password) logAuditEvent("user.password_changed", "user", id);
    if (!emailChanged && !password) logAuditEvent("user.updated", "user", id);
    return {
      ok: true,
      verificationRequired: emailChanged && !emailVerified,
    };
  }
}

export async function setUserAdmin(
  id: string,
  isAdmin: boolean,
  currentUserId: string,
  organizationId: string,
) {
  if (id === currentUserId && !isAdmin)
    return { error: "server.cannotRevokeOwnAdmin" };

  let changed = false;
  const result = await db.transaction(async (tx) => {
    const administrators = await tx.orm.aibot.User.where({
      isAdmin: true,
      organizationId,
    })
      .orderBy((user) => user.id.asc())
      .forUpdate()
      .all();
    const user = await tx.orm.aibot.User.first({ id, organizationId });
    if (!user) return { error: "server.userNotFound" };
    if (user.isAdmin === isAdmin) return { ok: true };
    if (!isAdmin && administrators.length <= 1)
      return { error: "server.atLeastOneAdminRequired" };

    await tx.orm.aibot.User.where({ id, organizationId }).update({ isAdmin });
    changed = true;
    return { ok: true };
  });
  if (changed)
    logAuditEvent(
      isAdmin ? "user.admin_granted" : "user.admin_revoked",
      "user",
      id,
      currentUserId,
    );
  return result;
}

export async function deleteUser(
  id: string,
  currentUserId: string,
  organizationId: string,
) {
  if (id === currentUserId) return { error: "server.cannotDeleteOwnAccount" };

  const deleted = await db.transaction(async (tx) => {
    const administrators = await tx.orm.aibot.User.where({
      isAdmin: true,
      organizationId,
    })
      .orderBy((user) => user.id.asc())
      .forUpdate()
      .all();
    const user = await tx.orm.aibot.User.first({ id, organizationId });
    if (!user) return { error: "server.userNotFound" };
    if (user.isAdmin && administrators.length <= 1)
      return { error: "server.atLeastOneAdminRequired" };

    await tx.orm.aibot.PrincipalBase.where({ id }).delete();
    return { ok: true };
  });
  if ("ok" in deleted) logAuditEvent("user.deleted", "user", id, currentUserId);
  return deleted;
}

export async function forceLogoutUser(
  id: string,
  currentUserId: string,
  organizationId: string,
) {
  if (id === currentUserId) return { error: "server.cannotForceLogoutSelf" };
  const result = await db.transaction(async (tx) => {
    const user = await tx.orm.aibot.User.where({ id, organizationId })
      .include("sessions")
      .first();
    if (!user) return { error: "server.userNotFound" };
    const isLoggedIn = user.sessions.some(
      (session) => Date.parse(session.expiresAt) > Date.now(),
    );
    if (!isLoggedIn) return { error: "server.userNotLoggedIn" };

    await tx.orm.aibot.Session.where({ userId: id, organizationId }).update({
      expiresAt: new Date().toISOString(),
    });
    return { ok: true };
  });
  if ("ok" in result)
    logAuditEvent("user.force_logged_out", "user", id, currentUserId);
  return result;
}

export async function resetUserMfa(id: string, organizationId: string) {
  const user = await db.orm.aibot.User.first({ id, organizationId });
  if (!user) return { error: "server.userNotFound" };
  if (!user.mfaSecret) return { error: "server.userMfaNotConfigured" };

  await db.transaction(async (tx) => {
    await tx.orm.aibot.User.where({ id, organizationId }).update({
      mfaSecret: null,
    });
    await tx.orm.aibot.Session.where({ userId: id, organizationId }).update({
      expiresAt: new Date().toISOString(),
    });
  });
  logAuditEvent("user.mfa_reset", "user", id);
  return { ok: true };
}
