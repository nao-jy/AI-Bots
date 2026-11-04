import { createHash } from "node:crypto";
import { db } from "./db";
import { hashPassword } from "../auth";
import { record, timestamp } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

export async function hasUsers() {
  return Boolean(await db.orm.aibot.User.first());
}

export async function findUserByEmail(email: string) {
  return db.orm.aibot.User.first({ email });
}

export async function findUserById(id: number) {
  return db.orm.aibot.User.first({ id });
}

export async function markEmailVerified(id: number, actorId?: number) {
  await db.orm.aibot.User.where({ id }).update({ emailVerified: true });
  logAuditEvent("user.email_verified", "user", id, actorId);
}

export async function resetUserPassword(
  id: number,
  expectedPasswordHashDigest: string,
  passwordHash: string,
  actorId?: number,
) {
  const updated = await db.transaction(async (tx) => {
    const user = await tx.orm.aibot.User.where({ id }).forUpdate().first();
    if (
      !user ||
      createHash("sha256").update(user.passwordHash).digest("base64url") !==
        expectedPasswordHashDigest
    )
      return false;

    await tx.orm.aibot.User.where({ id }).update({ passwordHash });
    await tx.orm.aibot.Session.where({ userId: id }).update({
      expiresAt: new Date().toISOString(),
    });
    return true;
  });
  if (updated) logAuditEvent("user.password_reset", "user", id, actorId);
  return updated;
}

export async function saveMfaSecret(
  id: number,
  mfaSecret: string,
  actorId?: number,
) {
  await db.orm.aibot.User.where({ id }).update({ mfaSecret });
  logAuditEvent("user.mfa_configured", "user", id, actorId);
}

export async function createUser(values: {
  email: string;
  name: string;
  passwordHash: string;
  isAdmin: boolean;
  emailVerified: boolean;
}) {
  const user = await db.orm.aibot.User.create(values);
  logAuditEvent("user.created", "user", user.id);
  return user;
}

export async function listUsers(
  emailVerificationEnabled: boolean,
  maxLoginAttempts: number,
) {
  if (!emailVerificationEnabled) {
    const pendingUsers = await db.orm.aibot.User.where({
      emailVerified: false,
    }).all();
    if (pendingUsers.length) {
      await db.orm.aibot.User.where({ emailVerified: false }).update({
        emailVerified: true,
      });
      for (const user of pendingUsers)
        logAuditEvent("user.email_verified", "user", user.id);
    }
  }
  const users = await db.orm.aibot.User.include("sessions")
    .orderBy((user) => user.createdAt.asc())
    .all();
  const now = Date.now();
  return users.map((user) => {
    const sessions = user.sessions.sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    const active = sessions.some(
      (session) => Date.parse(session.expiresAt) > now,
    );
    return record(user.id, user.updatedAt, {
      name: user.name ?? "",
      email: user.email,
      isAdmin: user.isAdmin ? "管理者" : "一般ユーザー",
      emailVerification: user.emailVerified ? "検証済み" : "未検証",
      mfaStatus: user.mfaSecret ? "設定済み" : "未設定",
      loginLockStatus:
        user.loginAttempts >= maxLoginAttempts ? "ロック中" : "—",
      loginStatus: active ? "ログイン中" : "ログアウト",
      lastLogin: sessions[0] ? timestamp(sessions[0].createdAt) : "—",
    });
  });
}

export async function recordFailedLoginAttempt(
  id: number,
  maxLoginAttempts: number,
) {
  const outcome = await db.transaction(async (tx) => {
    const user = await tx.orm.aibot.User.where({ id }).forUpdate().first();
    if (!user || user.loginAttempts >= maxLoginAttempts)
      return { result: "locked" as const, attempts: null };

    const loginAttempts = user.loginAttempts + 1;
    await tx.orm.aibot.User.where({ id }).update({ loginAttempts });
    return {
      result: loginAttempts >= maxLoginAttempts ? ("locked" as const) : ("failed" as const),
      attempts: loginAttempts,
    };
  });
  if (outcome.attempts !== null)
    logAuditEvent("auth.login.failed", "user", id);
  return outcome.result;
}

export async function resetLoginAttemptsForLogin(
  id: number,
  maxLoginAttempts: number,
) {
  return db.transaction(async (tx) => {
    const user = await tx.orm.aibot.User.where({ id }).forUpdate().first();
    if (!user || user.loginAttempts >= maxLoginAttempts) return false;
    if (user.loginAttempts > 0)
      await tx.orm.aibot.User.where({ id }).update({ loginAttempts: 0 });
    return true;
  });
}

export async function unlockUserLogin(id: number) {
  const user = await db.orm.aibot.User.first({ id });
  if (!user) return { error: "ユーザーが見つかりません。" };
  await db.orm.aibot.User.where({ id }).update({ loginAttempts: 0 });
  logAuditEvent("user.login_unlocked", "user", id);
  return { ok: true };
}

export async function saveUser(
  id: number | null,
  values: FormData,
  emailVerificationEnabled: boolean,
) {
  const name = String(values.get("name") ?? "").trim();
  const email = String(values.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(values.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return { error: "表示名と有効なメールアドレスを入力してください。" };
  if (id === null) {
    if (password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    const emailVerified = !emailVerificationEnabled;
    const user = await db.orm.aibot.User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      isAdmin: false,
      emailVerified,
    });
    logAuditEvent("user.created", "user", user.id);
    return { ok: true, verificationRequired: !emailVerified };
  } else {
    const user = await db.orm.aibot.User.first({ id });
    if (!user)
      return { error: "ユーザーが見つかりません。" };
    if (password && password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    const emailChanged = user.email !== email;
    const emailVerified = emailChanged
      ? !emailVerificationEnabled
      : user.emailVerified;
    await db.orm.aibot.User.where({ id }).update({
      name,
      email,
      emailVerified,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
    if (emailChanged) logAuditEvent("user.email_changed", "user", id);
    if (password) logAuditEvent("user.password_changed", "user", id);
    if (!emailChanged && !password)
      logAuditEvent("user.updated", "user", id);
    return {
      ok: true,
      verificationRequired: emailChanged && !emailVerified,
    };
  }
}

export async function setUserAdmin(
  id: number,
  isAdmin: boolean,
  currentUserId: number,
) {
  if (id === currentUserId && !isAdmin)
    return { error: "自分の管理者権限は解除できません。" };

  let changed = false;
  const result = await db.transaction(async (tx) => {
    const administrators = await tx.orm.aibot.User.where({ isAdmin: true })
      .orderBy((user) => user.id.asc())
      .forUpdate()
      .all();
    const user = await tx.orm.aibot.User.first({ id });
    if (!user) return { error: "ユーザーが見つかりません。" };
    if (user.isAdmin === isAdmin) return { ok: true };
    if (!isAdmin && administrators.length <= 1)
      return { error: "管理者は最低1人必要です。" };

    await tx.orm.aibot.User.where({ id }).update({ isAdmin });
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

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId)
    return { error: "自分のアカウントは削除できません。" };

  const deleted = await db.transaction(async (tx) => {
    const administrators = await tx.orm.aibot.User.where({ isAdmin: true })
      .orderBy((user) => user.id.asc())
      .forUpdate()
      .all();
    const user = await tx.orm.aibot.User.first({ id });
    if (!user) return { error: "ユーザーが見つかりません。" };
    if (user.isAdmin && administrators.length <= 1)
      return { error: "管理者は最低1人必要です。" };

    await tx.orm.aibot.User.where({ id }).delete();
    return { ok: true };
  });
  if ("ok" in deleted)
    logAuditEvent("user.deleted", "user", id, currentUserId);
  return deleted;
}

export async function forceLogoutUser(id: number, currentUserId: number) {
  if (id === currentUserId)
    return { error: "自分を強制ログアウトさせることはできません。" };
  const result = await db.transaction(async (tx) => {
    const user = await tx.orm.aibot.User.include("sessions").first({ id });
    if (!user) return { error: "ユーザーが見つかりません。" };
    const isLoggedIn = user.sessions.some(
      (session) => Date.parse(session.expiresAt) > Date.now(),
    );
    if (!isLoggedIn) return { error: "このユーザーはログインしていません。" };

    await tx.orm.aibot.Session.where({ userId: id }).update({
      expiresAt: new Date().toISOString(),
    });
    return { ok: true };
  });
  if ("ok" in result)
    logAuditEvent("user.force_logged_out", "user", id, currentUserId);
  return result;
}

export async function resetUserMfa(id: number) {
  const user = await db.orm.aibot.User.first({ id });
  if (!user) return { error: "ユーザーが見つかりません。" };
  if (!user.mfaSecret) return { error: "このユーザーはMFAを設定していません。" };

  await db.transaction(async (tx) => {
    await tx.orm.aibot.User.where({ id }).update({ mfaSecret: null });
    await tx.orm.aibot.Session.where({ userId: id }).update({
      expiresAt: new Date().toISOString(),
    });
  });
  logAuditEvent("user.mfa_reset", "user", id);
  return { ok: true };
}
