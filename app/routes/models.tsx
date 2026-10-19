import type { Route } from "./+types/models";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteModelDefinition,
  listModelDefinitions,
  saveModelDefinition,
} from "../.server/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "モデル定義",
  description: "AIプロバイダー、モデル名、APIキーを管理します。",
  icon: "models",
  columns: [
    { key: "modelName", label: "モデル名" },
    { key: "provider", label: "プロバイダー" },
    { key: "apiKeyConfigured", label: "APIキー" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "provider", label: "プロバイダー", placeholder: "例：OpenAI" },
    { key: "modelName", label: "モデル名", placeholder: "例：gpt-4.1" },
    {
      key: "apiKey",
      label: "APIキー",
      type: "password",
      required: true,
      wide: true,
      placeholder: "作成時は必須、編集時は変更する場合のみ入力",
    },
  ],
};

export function meta() {
  return [{ title: `モデル定義 | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return listModelDefinitions(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete") {
    const deleted = Number.isInteger(id) && (await deleteModelDefinition(user, id));
    return deleted
      ? { ok: true }
      : { ok: false, error: "モデル定義が見つからないか、エージェントで使用中です。" };
  }
  if (intent === "create") return saveModelDefinition(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveModelDefinition(user, id, form)
      : { ok: false, error: "モデル定義が見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Models({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
