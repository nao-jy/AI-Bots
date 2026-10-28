import type { Route } from "./+types/sandboxes";
import { requireUser } from "../.server/auth";
import {
  deleteSandbox,
  listSandboxes,
  saveSandbox,
} from "../.server/repository/entities";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME, SANDBOX_SCOPES } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "サンドボックス",
  description:
    "チャットボットが利用する実行環境、環境変数、ネットワーク制限を管理します。",
  icon: "sandboxes",
  columns: [
    { key: "name", label: "サンドボックス" },
    { key: "type", label: "タイプ" },
    { key: "scope", label: "適用範囲" },
    { key: "allowedDomainList", label: "許可ドメイン" },
  ],
  fields: [
    { key: "sandboxType", label: "タイプ", type: "select", options: [] },
    {
      key: "sandboxScope",
      label: "適用範囲",
      type: "select",
      options: Object.entries(SANDBOX_SCOPES).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      key: "envs",
      label: "環境変数",
      type: "key-value",
      valueType: "string",
      wide: true,
    },
    {
      key: "allowedDomainList",
      label: "許可ドメイン",
      type: "tags",
      placeholder: "example.com を入力して Enter",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `サンドボックス | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return listSandboxes(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteSandbox(user, id))
      ? { ok: true }
      : { ok: false, error: "サンドボックスが見つかりません。" };
  if (intent === "create") return saveSandbox(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveSandbox(user, id, form)
      : { ok: false, error: "サンドボックスが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Sandboxes({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) =>
          field.key === "sandboxType"
            ? { ...field, options: loaderData.sandboxTypeOptions }
            : field,
        ),
      }}
    />
  );
}
