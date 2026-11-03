import type { Route } from "./+types/users";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteUser,
  findUserByEmail,
  findUserById,
  forceLogoutUser,
  listUsers,
  saveUser,
  setUserAdmin,
} from "../.server/repository/entities";
import { sendEmailVerification } from "../.server/features/email-verification";
import { requireAdmin } from "../.server/auth";
import { logger } from "../.server/logger";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "ユーザー",
  description: "ログインできるユーザーアカウントを管理します。",
  icon: "users",
  tableFeatures: { forceLogout: true, emailVerification: true },
  columns: [
    { key: "name", label: "ユーザー" },
    { key: "email", label: "メールアドレス" },
    {
      key: "emailVerification",
      label: "メールアドレス検証",
      presentation: "verification-status",
    },
    { key: "isAdmin", label: "権限", presentation: "admin-toggle" },
    { key: "loginStatus", label: "ログイン状態" },
    { key: "lastLogin", label: "最終ログイン" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "表示名", placeholder: "例：山田 花子" },
    {
      key: "email",
      label: "メールアドレス",
      type: "email",
      placeholder: "name@example.com",
    },
    {
      key: "password",
      label: "パスワード",
      type: "password",
      required: true,
      placeholder: "作成時は12文字以上、編集時は変更する場合のみ入力",
    },
  ],
};

export function meta() {
  return [{ title: `ユーザー | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUser = await requireAdmin(request);
  return { users: await listUsers(), currentUserId: currentUser.id };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete") {
    return Number.isInteger(id)
      ? deleteUser(id, actor.id)
      : { ok: false, error: "ユーザーが見つかりません。" };
  }
  if (intent === "toggle-admin") {
    const isAdminValue = String(form.get("isAdmin") ?? "");
    if (!Number.isInteger(id) || !["true", "false"].includes(isAdminValue))
      return { ok: false, error: "変更内容を確認してください。" };
    return setUserAdmin(id, isAdminValue === "true", actor.id);
  }
  if (intent === "force-logout") {
    return Number.isInteger(id)
      ? forceLogoutUser(id, actor.id)
      : { ok: false, error: "ユーザーが見つかりません。" };
  }
  if (intent === "send-verification") {
    if (!Number.isInteger(id))
      return { ok: false, error: "ユーザーが見つかりません。" };
    const user = await findUserById(id);
    if (!user) return { ok: false, error: "ユーザーが見つかりません。" };
    if (user.emailVerified)
      return { ok: false, error: "このメールアドレスは検証済みです。" };
    try {
      const sent = await sendEmailVerification(user, request.url);
      return sent
        ? { ok: true }
        : { ok: false, error: "メールプロバイダが設定されていません。" };
    } catch (error) {
      logger.error("Failed to send user verification email", {
        userId: user.id,
        error,
      });
      return {
        ok: false,
        error: "検証メールを送信できませんでした。設定を確認して再試行してください。",
      };
    }
  }
  if (intent === "create") {
    const result = await saveUser(null, form);
    if ("error" in result || !result.verificationRequired) return result;
    return sendNewUserVerification(
      String(form.get("email") ?? "").trim().toLowerCase(),
      request.url,
    );
  }
  if (intent === "update") {
    if (!Number.isInteger(id))
      return { ok: false, error: "ユーザーが見つかりません。" };
    const result = await saveUser(id, form);
    if ("error" in result || !result.verificationRequired) return result;
    return sendNewUserVerification(
      String(form.get("email") ?? "").trim().toLowerCase(),
      request.url,
    );
  }
  return { ok: false, error: "操作を判定できませんでした。" };
}

async function sendNewUserVerification(email: string, requestUrl: string) {
  const user = await findUserByEmail(email);
  if (!user) return { ok: false, error: "ユーザーが見つかりません。" };
  try {
    await sendEmailVerification(user, requestUrl);
    return { ok: true };
  } catch (error) {
    logger.error("Failed to send user verification email", {
      userId: user.id,
      error,
    });
    return {
      ok: false,
      error: "ユーザーを保存しましたが検証メールを送信できませんでした。ユーザー一覧から再送してください。",
    };
  }
}

export default function Users({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.users,
        protectedRecordId: loaderData.currentUserId,
      }}
    />
  );
}
