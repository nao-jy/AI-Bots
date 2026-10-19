import { db } from "./db";
import { hashPassword } from "../auth";
import { record } from "../utils";

export async function listUsers() {
  const users = await db.orm.public.User.orderBy((user) =>
    user.createdAt.asc(),
  ).all();
  return users.map((user) =>
    record(user.id, user.updatedAt, {
      name: user.name ?? "",
      email: user.email,
    }),
  );
}

export async function saveUser(id: number | null, values: FormData) {
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
    await db.orm.public.User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
    });
  } else {
    if (!(await db.orm.public.User.first({ id })))
      return { error: "ユーザーが見つかりません。" };
    if (password && password.length < 12)
      return { error: "パスワードは12文字以上で入力してください。" };
    await db.orm.public.User.where({ id }).update({
      name,
      email,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
  }
  return { ok: true };
}

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId) return false;
  if (!(await db.orm.public.User.first({ id }))) return false;
  await db.orm.public.User.where({ id }).delete();
  return true;
}
