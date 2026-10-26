import type { Route } from "./+types/mcp-servers";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteMcpServer,
  listMcpServers,
  saveMcpServer,
  TRANSPORTS,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { testMcpServer } from "~/.server/test";

function getPage(transport: Record<string, string>) {
  const page: Omit<EntityPageDefinition, "records"> = {
    title: "MCPサーバー",
    description: "MCPサーバーの接続先と利用可能なツール情報を管理します。",
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
        key: "transportId",
        label: "トランスポート",
        type: "select",
        options: Object.entries(transport).map((v) => ({
          label: v[1],
          value: v[0],
        })),
      },
      {
        key: "endpoint",
        label: "エンドポイント",
        wide: true,
        placeholder: "https://mcp.example.com/mcp",
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
  return page;
}

export function meta() {
  return [{ title: `MCPサーバー | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return {
    servers: await listMcpServers(user),
    transport: TRANSPORTS,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "test") return testMcpServer(user, form);
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteMcpServer(user, id))
      ? { ok: true }
      : { ok: false, error: "MCPサーバーが見つかりません。" };
  if (intent === "create") return saveMcpServer(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveMcpServer(user, id, form)
      : { ok: false, error: "MCPサーバーが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function McpServers({ loaderData }: Route.ComponentProps) {
  const page = getPage(loaderData.transport);
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.servers.records,
      }}
    />
  );
}
