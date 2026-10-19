import type { Route } from "./+types/mcp-servers";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  updateMcpServer,
} from "../.server/mock-entities";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "MCPサーバー",
  description: "ユーザーが追加したMCPサーバーと、提供するツールを管理します。",
  icon: "mcp",
  columns: [
    { key: "name", label: "サーバー名" },
    { key: "transport", label: "トランスポート" },
    { key: "endpoint", label: "エンドポイント" },
    { key: "status", label: "ステータス" },
    { key: "updated", label: "最終更新" },
  ],
  fields: [
    { key: "name", label: "サーバー名", placeholder: "例：社内ナレッジ" },
    {
      key: "transport",
      label: "トランスポート",
      type: "select",
      options: ["Streamable HTTP", "SSE", "stdio"],
    },
    {
      key: "endpoint",
      label: "エンドポイント",
      wide: true,
      placeholder: "https://mcp.example.com",
    },
    {
      key: "tools",
      label: "提供ツール",
      placeholder: "search_documents, get_document",
    },
    {
      key: "status",
      label: "ステータス",
      type: "select",
      options: ["接続済み", "未接続", "停止中"],
    },
  ],
};

export function meta() {
  return [{ title: `MCPサーバー | ${APP_NAME}` }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { mcpServers: listMcpServers() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && deleteMcpServer(id)
      ? { ok: true }
      : { ok: false, error: "MCPサーバーが見つかりません。" };
  const values = {
    name: String(form.get("name") ?? "").trim(),
    transport: String(form.get("transport") ?? ""),
    endpoint: String(form.get("endpoint") ?? "").trim(),
    tools: String(form.get("tools") ?? "").trim(),
    status: String(form.get("status") ?? "未接続"),
  };
  if (!values.name || !values.transport)
    return {
      ok: false,
      error: "サーバー名とトランスポートを入力してください。",
    };
  if (intent === "create")
    return { ok: true, mcpServer: createMcpServer(values) };
  if (intent === "update")
    return Number.isInteger(id) && updateMcpServer(id, values)
      ? { ok: true }
      : { ok: false, error: "MCPサーバーが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function McpServers({ loaderData }: Route.ComponentProps) {
  return <EntityPageView page={{ ...page, records: loaderData.mcpServers }} />;
}
