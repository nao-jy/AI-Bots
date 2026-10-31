import type { Route } from "./+types/adapters";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteAdapter,
  listAdapters,
  regenerateAdapterPublicIds,
  saveAdapter,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { testAdapter } from "~/.server/test";
import { listAdapterNames } from "~/.server/features/chat-adapter";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "アダプタ",
  description: "SlackやDiscordなど、チャットアプリとの接続を管理します。",
  icon: "adapters",
  columns: [
    { key: "name", label: "接続名" },
    { key: "platform", label: "プラットフォーム" },
    { key: "authentication", label: "OAuth認証" },
    { key: "configured", label: "環境変数" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "接続名", placeholder: "例：サポート Slack" },
    {
      key: "platformId",
      label: "プラットフォーム",
      type: "select",
      options: [],
    },
    {
      key: "config",
      label: "コンフィグ",
      type: "key-value",
      valueType: "string",
      wide: true,
      help: {
        text: "利用するアダプタや、プラットフォーム固有の設定方法を確認できます。",
        linkText: "Chat SDK アダプタドキュメント",
        href: "https://chat-sdk.dev/adapters",
      },
    },
    {
      key: "authId",
      label: "OAuth認証情報",
      type: "select",
      options: [],
      placeholder: "使用しない",
    },
  ],
};

export function meta() {
  return [{ title: `アダプタ | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const [adapters, adapterNames] = await Promise.all([
    listAdapters(user),
    Promise.resolve(listAdapterNames()),
  ]);
  return {
    ...adapters,
    adapterOptions: adapterNames.map(({ id, displayName }) => ({
      value: id,
      label: displayName,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "regenerate-public-ids") {
    const slot = String(form.get("slot") ?? "");
    if (slot !== "first" && slot !== "second")
      return { ok: false, error: "再生成するパブリックIDを指定してください。" };
    return Number.isInteger(id) &&
      (await regenerateAdapterPublicIds(user, id, slot))
      ? { ok: true }
      : { ok: false, error: "アダプタが見つかりません。" };
  }
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
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "platformId"
              ? loaderData.adapterOptions
              : field.key === "authId"
                ? loaderData.authOptions
                : field.options,
        })),
      }}
    />
  );
}
