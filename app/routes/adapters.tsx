import type { Route } from "./+types/adapters";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteAdapter,
  listAdapters,
  saveAdapter,
  testAdapter,
} from "../.server/models/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "アダプタ",
  description: "SlackやDiscordなど、チャットアプリとの接続を管理します。",
  icon: "adapters",
  columns: [
    { key: "name", label: "接続名" },
    { key: "platform", label: "プラットフォーム" },
    { key: "envsConfigured", label: "環境変数" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "接続名", placeholder: "例：サポート Slack" },
    {
      key: "platformId",
      label: "プラットフォーム",
      type: "select",
      options: [
        { label: "Slack", value: "slack" },
        { label: "Discord", value: "discord" },
        { label: "Microsoft Teams", value: "teams" },
        { label: "LINE", value: "line" },
      ],
    },
    {
      key: "envs",
      label: "環境変数",
      type: "key-value",
      valueType: "string",
      wide: true,
      help: {
        text: "利用するアダプタや、プラットフォーム固有の設定方法を確認できます。",
        linkText: "Chat SDK アダプタドキュメント",
        href: "https://chat-sdk.dev/adapters",
      },
    },
  ],
};

export function meta() {
  return [{ title: `アダプタ | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return listAdapters(user);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "test") return testAdapter(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteAdapter(user, id))
      ? { ok: true }
      : { ok: false, error: "アダプタが見つかりません。" };
  if (intent === "create") return saveAdapter(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveAdapter(user, id, form)
      : { ok: false, error: "アダプタが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Adapters({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
