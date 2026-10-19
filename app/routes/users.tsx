import type { Route } from "./+types/users";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "../.server/mock-entities";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "ユーザー",
  description: "ワークスペースに参加するユーザーと権限を管理します。",
  icon: "users",
  columns: [
    { key: "name", label: "ユーザー" },
    { key: "email", label: "メールアドレス" },
    { key: "role", label: "権限" },
    { key: "status", label: "ステータス" },
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
      key: "role",
      label: "権限",
      type: "select",
      options: ["管理者", "メンバー"],
    },
    {
      key: "status",
      label: "ステータス",
      type: "select",
      options: ["有効", "招待中", "停止中"],
    },
  ],
};

export function meta() {
  return [{ title: "ユーザー | Orbit" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { users: listUsers() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && deleteUser(id)
      ? { ok: true }
      : { ok: false, error: "ユーザーが見つかりません。" };
  const values = {
    name: String(form.get("name") ?? "").trim(),
    email: String(form.get("email") ?? "")
      .trim()
      .toLowerCase(),
    role: String(form.get("role") ?? "メンバー"),
    status: String(form.get("status") ?? "招待中"),
  };
  if (!values.name || !values.email.includes("@"))
    return {
      ok: false,
      error: "表示名と有効なメールアドレスを入力してください。",
    };
  if (intent === "create") return { ok: true, user: createUser(values) };
  if (intent === "update")
    return Number.isInteger(id) && updateUser(id, values)
      ? { ok: true }
      : { ok: false, error: "ユーザーが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Users({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.users }} />;
}
