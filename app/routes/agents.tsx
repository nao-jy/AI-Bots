import type { Route } from "./+types/agents";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteAgent,
  listAgents,
  saveAgent,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { testAgent } from "~/.server/test";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "エージェント",
  description:
    "利用するプロバイダー、モデルID、オプション、MCPサーバーを設定します。",
  icon: "agents",
  columns: [
    { key: "name", label: "エージェント" },
    { key: "model", label: "モデル" },
    { key: "servers", label: "MCPサーバー" },
    { key: "mcpAuthentications", label: "MCP OAuth認証" },
    { key: "status", label: "利用状況" },
  ],
  fields: [
    {
      key: "name",
      label: "エージェント名",
      placeholder: "例：カスタマーサポート",
    },
    {
      key: "providerId",
      label: "プロバイダー",
      type: "select",
      options: [],
      placeholder: "プロバイダーを選択",
    },
    {
      key: "model_id",
      label: "モデルID",
      placeholder: "例：gpt-4.1",
    },
    {
      key: "mcpServerIds",
      label: "MCPサーバー",
      type: "multiselect",
      options: [],
      placeholder: "利用するMCPサーバーを選択",
    },
    {
      key: "mcpAuthIds",
      label: "MCPごとのOAuth認証 (JSON)",
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
      help: { text: "キーにMCPサーバーID、値にOAuth認証IDを入力します。ID一覧はこのページの利用可能なMCPサーバーとOAuth認証情報です。", linkText: "OAuth認証情報を管理", href: "/oauth-authentications" },
    },
    {
      key: "options",
      label: "モデルオプション",
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `エージェント | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return listAgents(user);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "test") return testAgent(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteAgent(user, id))
      ? { ok: true }
      : { ok: false, error: "エージェントが見つかりません。" };
  if (intent === "create") return saveAgent(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveAgent(user, id, form)
      : { ok: false, error: "エージェントが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Agents({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          ...(field.key === "mcpAuthIds" ? { help: { ...field.help!, text: `${field.help!.text} 利用可能な認証情報: ${loaderData.authOptions.map((option) => option.label).join("、") || "なし"}` } } : {}),
          options:
            field.key === "mcpServerIds"
              ? loaderData.serverOptions
              : field.key === "providerId"
                ? loaderData.providerOptions
                : field.options,
        })),
      }}
    />
  );
}
