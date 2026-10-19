import type { Route } from "./+types/adapters";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  createAdapter,
  deleteAdapter,
  listAdapters,
  updateAdapter,
} from "../.server/mock-entities";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "アダプタ",
  description: "SlackやDiscordなど、チャットアプリとの接続を管理します。",
  icon: "adapters",
  columns: [
    { key: "name", label: "接続名" },
    { key: "platform", label: "プラットフォーム" },
    { key: "bot", label: "接続先ボット" },
    { key: "status", label: "ステータス" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "接続名", placeholder: "例：サポート Slack" },
    {
      key: "platform",
      label: "プラットフォーム",
      type: "select",
      options: ["Slack", "Discord", "Microsoft Teams", "LINE"],
    },
    {
      key: "bot",
      label: "接続先ボット",
      type: "select",
      options: ["カスタマーサポート", "社内ナレッジアシスタント"],
    },
    {
      key: "status",
      label: "ステータス",
      type: "select",
      options: ["接続済み", "未接続", "停止中"],
    },
    {
      key: "credential",
      label: "アクセストークン",
      type: "password",
      wide: true,
      placeholder: "新しいトークンを入力（任意）",
    },
  ],
};

export function meta() {
  return [{ title: "アダプタ | Orbit" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { adapters: listAdapters() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && deleteAdapter(id)
      ? { ok: true }
      : { ok: false, error: "アダプタが見つかりません。" };
  const credential = String(form.get("credential") ?? "");
  const values = {
    name: String(form.get("name") ?? "").trim(),
    platform: String(form.get("platform") ?? ""),
    bot: String(form.get("bot") ?? ""),
    status: String(form.get("status") ?? "未接続"),
    ...(credential ? { credentialConfigured: "true" } : {}),
  };
  if (!values.name || !values.platform)
    return { ok: false, error: "接続名とプラットフォームを入力してください。" };
  if (intent === "create") return { ok: true, adapter: createAdapter(values) };
  if (intent === "update")
    return Number.isInteger(id) && updateAdapter(id, values)
      ? { ok: true }
      : { ok: false, error: "アダプタが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Adapters({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.adapters }} />;
}
