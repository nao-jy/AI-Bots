import type { Route } from "./+types/agents";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { deleteAgent, listAgents, saveAgent } from "../.server/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "エージェント",
  description: "モデル定義、推論パラメータ、利用するMCPサーバーを設定します。",
  icon: "agents",
  columns: [
    { key: "name", label: "エージェント" },
    { key: "model", label: "モデル" },
    { key: "servers", label: "MCPサーバー" },
    { key: "status", label: "利用状況" },
  ],
  fields: [
    {
      key: "name",
      label: "エージェント名",
      placeholder: "例：カスタマーサポート",
    },
    {
      key: "modelDefinitionId",
      label: "モデル定義",
      type: "select",
      options: [],
      placeholder: "モデル定義を選択",
    },
    {
      key: "mcpServerIds",
      label: "MCPサーバー",
      type: "multiselect",
      options: [],
      placeholder: "利用するMCPサーバーを選択",
    },
    {
      key: "parameters",
      label: "パラメータJSON",
      type: "textarea",
      wide: true,
      placeholder: '{"temperature":0.7,"maxSteps":5}',
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
          options:
            field.key === "mcpServerIds"
              ? loaderData.serverOptions
              : field.key === "modelDefinitionId"
                ? loaderData.modelOptions
                : field.options,
        })),
      }}
    />
  );
}
