import type { Route } from "./+types/providers";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteProvider,
  listProviders,
  saveProvider,
  testProvider,
} from "../.server/models/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "プロバイダー",
  description: "AI SDKプロバイダー接続とリクエスト設定を管理します。",
  icon: "providers",
  columns: [
    { key: "name", label: "接続名" },
    { key: "providerName", label: "プロバイダー" },
    { key: "headersConfigured", label: "HTTPヘッダー" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    {
      key: "name",
      label: "接続名",
      placeholder: "例：社内OpenAI",
    },
    {
      key: "providerName",
      label: "プロバイダー識別子",
      placeholder: "例：openai",
      help: {
        text: "各プロバイダーのモデル名や利用可能なオプションを確認できます。",
        linkText: "AI SDK プロバイダードキュメント",
        href: "https://ai-sdk.dev/providers/ai-sdk-providers",
      },
    },
    {
      key: "args",
      label: "プロバイダー引数",
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
    },
    {
      key: "headers",
      label: "HTTPヘッダー",
      type: "key-value",
      valueType: "string",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `プロバイダー | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return listProviders(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "test") return testProvider(user, form);
  if (intent === "delete") {
    const deleted = Number.isInteger(id) && (await deleteProvider(user, id));
    return deleted
      ? { ok: true }
      : {
          ok: false,
          error: "プロバイダーが見つからないか、エージェントで使用中です。",
        };
  }
  if (intent === "create") return saveProvider(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveProvider(user, id, form)
      : { ok: false, error: "プロバイダーが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Models({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.records }} />;
}
