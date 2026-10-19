import type { Route } from "./+types/agents";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
} from "../.server/mock-entities";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "エージェント",
  description: "AIプロバイダー、モデル、システムプロンプトを設定します。",
  icon: "agents",
  columns: [
    { key: "name", label: "エージェント" },
    { key: "provider", label: "プロバイダー" },
    { key: "model", label: "モデル" },
    { key: "tools", label: "MCPツール" },
    { key: "status", label: "利用状況" },
  ],
  fields: [
    {
      key: "name",
      label: "エージェント名",
      placeholder: "例：カスタマーサポート",
    },
    {
      key: "provider",
      label: "プロバイダー",
      type: "select",
      options: ["OpenAI", "Anthropic", "Google", "その他"],
    },
    { key: "model", label: "モデル", placeholder: "例：gpt-4.1" },
    {
      key: "tools",
      label: "MCPツール",
      placeholder: "ナレッジ検索, チケット検索",
    },
    {
      key: "prompt",
      label: "システムプロンプト",
      type: "textarea",
      wide: true,
      placeholder: "エージェントの役割や応答方針",
    },
  ],
};

export function meta() {
  return [{ title: "エージェント | Orbit" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { agents: listAgents() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && deleteAgent(id)
      ? { ok: true }
      : { ok: false, error: "エージェントが見つかりません。" };
  const values = {
    name: String(form.get("name") ?? "").trim(),
    provider: String(form.get("provider") ?? ""),
    model: String(form.get("model") ?? "").trim(),
    tools: String(form.get("tools") ?? "").trim(),
    prompt: String(form.get("prompt") ?? "").trim(),
  };
  if (!values.name || !values.provider || !values.model)
    return {
      ok: false,
      error: "エージェント名、プロバイダー、モデルを入力してください。",
    };
  if (intent === "create")
    return { ok: true, agent: createAgent({ ...values, status: "未使用" }) };
  if (intent === "update")
    return Number.isInteger(id) && updateAgent(id, values)
      ? { ok: true }
      : { ok: false, error: "エージェントが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function Agents({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.agents }} />;
}
