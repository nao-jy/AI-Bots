import type { Route } from "./+types/bots";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteBot,
  listBots,
  regenerateBotPublicIds,
  saveBot,
  setBotEnabled,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "チャットボット",
  description:
    "チャットボットの設定と接続アダプタを管理し、各アダプタの Webhook URL を確認・コピーできます。",
  icon: "bots",
  columns: [
    { key: "name", label: "ボット名" },
    { key: "agent", label: "エージェント" },
    { key: "adapters", label: "接続アダプタ" },
    { key: "sandboxes", label: "サンドボックス" },
    { key: "toolsets", label: "ToolSet" },
    { key: "webhooks", label: "Webhook エンドポイント" },
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
      placeholder: "ボットの説明",
    },
    {
      key: "instruction",
      label: "指示プロンプト",
      type: "textarea",
      wide: true,
      placeholder: "ボットAIへの指示プロンプト",
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
    {
      key: "mcpServerIds",
      label: "MCPサーバー",
      type: "multiselect",
      options: [],
      placeholder: "接続するMCPサーバーを選択",
    },
    {
      key: "sandboxId",
      label: "サンドボックス",
      type: "select",
      options: [],
      placeholder: "利用するサンドボックスを選択",
    },
    {
      key: "toolSetContexts",
      label: "ToolSet context",
      type: "toolset-contexts",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `チャットボット | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const publicOrigin = new URL(process.env["PUBLIC_APP_URL"] || request.url)
    .origin;
  return listBots(user, publicOrigin);
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
    return Number.isInteger(id) && (await regenerateBotPublicIds(user, id, slot))
      ? { ok: true }
      : { ok: false, error: "ボットが見つかりません。" };
  }
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
        toolSetSchemas: loaderData.toolSetSchemas,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "agentId"
              ? loaderData.agentOptions
              : field.key === "adapterIds"
                ? loaderData.adapterOptions
                : field.key === "sandboxId"
                  ? loaderData.sandboxOptions
                  : field.key === "mcpServerIds"
                    ? loaderData.mcpServerOptions
                    : field.options,
        })),
      }}
    />
  );
}
