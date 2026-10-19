import type { Route } from "./+types/bots";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  createBot,
  deleteBot,
  listBots,
  updateBot,
} from "../.server/mock-entities";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "チャットボット",
  description: "チャットボットの基本情報と利用するエージェントを管理します。",
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
      key: "status",
      label: "ステータス",
      type: "select",
      options: ["稼働中", "停止中"],
    },
    {
      key: "description",
      label: "説明",
      type: "textarea",
      wide: true,
      placeholder: "ボットの役割や用途",
    },
    {
      key: "agent",
      label: "エージェント",
      type: "select",
      options: [
        "カスタマーサポート",
        "社内ナレッジアシスタント",
        "新しいエージェント",
      ],
    },
    {
      key: "adapters",
      label: "接続アダプタ",
      type: "multiselect",
      options: ["サポート窓口", "社内ワークスペース", "開発コミュニティ"],
      placeholder: "接続するアダプタを選択",
    },
  ],
};

export function meta() {
  return [{ title: `チャットボット | ${APP_NAME}` }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { bots: listBots() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && deleteBot(id)
      ? { ok: true }
      : { ok: false, error: "ボットが見つかりません。" };
  const values = {
    name: String(form.get("name") ?? "").trim(),
    status: String(form.get("status") ?? "停止中"),
    description: String(form.get("description") ?? "").trim(),
    agent: String(form.get("agent") ?? ""),
    adapters: String(form.get("adapters") ?? "")
      .split(",")
      .map((adapter) => adapter.trim())
      .filter(Boolean)
      .join(", "),
  };
  if (!values.name) return { ok: false, error: "ボット名を入力してください。" };
  if (intent === "create") return { ok: true, bot: createBot(values) };
  if (intent === "update")
    return Number.isInteger(id) && updateBot(id, values)
      ? { ok: true }
      : { ok: false, error: "ボットが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Bots({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.bots }} />;
}
