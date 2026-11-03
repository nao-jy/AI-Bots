import { db } from "./db";
import { hashPassword } from "../auth";
import { record, timestamp } from "../utils";

export async function hasUsers() {
  return Boolean(await db.orm.aibot.User.first());
}

export async function findUserByEmail(email: string) {
  return db.orm.aibot.User.first({ email });
}

export async function findUserById(id: number) {
  return db.orm.aibot.User.first({ id });
}

export async function markEmailVerified(id: number) {
  await db.orm.aibot.User.where({ id }).update({ emailVerified: true });
}

export async function saveMfaSecret(id: number, mfaSecret: string) {
  await db.orm.aibot.User.where({ id }).update({ mfaSecret });
}

export async function createUser(values: {
  email: string;
  name: string;
  passwordHash: string;
  isAdmin: boolean;
  emailVerified: boolean;
}) {
  return db.orm.aibot.User.create(values);
}

export async function listUsers(emailVerificationEnabled: boolean) {
  if (!emailVerificationEnabled)
    await db.orm.aibot.User.where({ emailVerified: false }).update({
      emailVerified: true,
    });
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
      loginStatus: active ? "ログイン中" : "ログアウト",
      lastLogin: sessions[0] ? timestamp(sessions[0].createdAt) : "—",
    });
  });
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
    await db.orm.aibot.User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      isAdmin: false,
      emailVerified,
    });
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

  return db.transaction(async (tx) => {
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
    return { ok: true };
  });
}

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId)
    return { error: "自分のアカウントは削除できません。" };

  return db.transaction(async (tx) => {
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
}

export async function forceLogoutUser(id: number, currentUserId: number) {
  if (id === currentUserId)
    return { error: "自分を強制ログアウトさせることはできません。" };
  return db.transaction(async (tx) => {
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
  return { ok: true };
}
