import type { Route } from "./+types/users";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteUser,
  listUsers,
  saveUser,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "ユーザー",
  description: "ワークスペースにログインできるユーザーアカウントを管理します。",
  icon: "users",
  columns: [
    { key: "name", label: "ユーザー" },
    { key: "email", label: "メールアドレス" },
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
  const currentUser = await requireUser(request);
  return { users: await listUsers(), currentUserId: currentUser.id };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete") {
    if (id === actor.id) {
      return { ok: false, error: "自分のアカウントは削除できません。" };
    }
    return Number.isInteger(id) && (await deleteUser(id, actor.id))
      ? { ok: true }
      : { ok: false, error: "ユーザーが見つかりません。" };
  }
  if (intent === "create") return saveUser(null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveUser(id, form)
      : { ok: false, error: "ユーザーが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
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
