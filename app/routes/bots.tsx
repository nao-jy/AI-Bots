import type { Route } from "./+types/bots";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteBot,
  listBots,
  saveBot,
  setBotEnabled,
} from "../.server/models/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "チャットボット",
  description:
    "チャットボットの基本情報、エージェント、利用するアダプタを管理します。",
  icon: "bots",
  columns: [
    { key: "name", label: "ボット名" },
    { key: "agent", label: "エージェント" },
    { key: "adapters", label: "接続アダプタ" },
    { key: "status", label: "ステータス" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "ボット名", placeholder: "例：サポートアシスタント" },
    {
      key: "description",
      label: "説明",
      type: "textarea",
      wide: true,
      placeholder: "ボットの役割や用途",
    },
    {
      key: "agentId",
      label: "エージェント",
      type: "select",
      options: [],
      placeholder: "指定しない",
    },
    {
      key: "adapterIds",
      label: "接続アダプタ",
      type: "multiselect",
      options: [],
      placeholder: "接続するアダプタを選択",
    },
  ],
};

export function meta() {
  return [{ title: `チャットボット | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return listBots(user);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteBot(user, id))
      ? { ok: true }
      : { ok: false, error: "ボットが見つかりません。" };
  if (intent === "toggle-status") {
    const enabled = String(form.get("enabled")) === "true";
    return Number.isInteger(id) && (await setBotEnabled(user, id, enabled))
      ? { ok: true }
      : { ok: false, error: "ボットが見つかりません。" };
  }
  if (intent === "create") return saveBot(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveBot(user, id, form)
      : { ok: false, error: "ボットが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Bots({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "agentId"
              ? loaderData.agentOptions
              : field.key === "adapterIds"
                ? loaderData.adapterOptions
                : field.options,
        })),
      }}
    />
  );
}
