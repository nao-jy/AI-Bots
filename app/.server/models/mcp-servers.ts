import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptMcpHeaders,
  encryptStringMap,
  jsonb,
  parseStringMap,
  record,
  requestTest,
  testFailure,
  testSuccess,
} from "../utils";

const transports: Record<string, string> = {
  "streamable-http": "Streamable HTTP",
};

export async function listMcpServers(user: AuthUser) {
  const servers = await db.orm.public.McpServer.where({ ownerId: user.id })
    .orderBy((server) => server.updatedAt.desc())
    .all();
  return {
    records: servers.map((server) => {
      return record(server.id, server.updatedAt, {
        name: server.name,
        description: server.description ?? "",
        transport: transports[server.transport] ?? server.transport,
        transportId: server.transport,
        endpoint: server.endpoint ?? "",
        headers: JSON.stringify(decryptMcpHeaders(server.headers), null, 2),
        status: server.endpoint ? "接続先登録済み" : "接続先未設定",
      });
    }),
  };
}

export async function saveMcpServer(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const transport = String(values.get("transportId") ?? "").trim();
  const endpoint = String(values.get("endpoint") ?? "").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  if (!name || !transport)
    return { error: "サーバー名とトランスポートを入力してください。" };
  let headers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "ヘッダーJSONにはオブジェクトを入力してください。" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "ヘッダーの値は文字列で入力してください。" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "ヘッダーJSONの形式を確認してください。" };
  }
  if (
    id !== null &&
    !(await db.orm.public.McpServer.first({ id, ownerId: user.id }))
  )
    return { error: "MCPサーバーが見つかりません。" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "HTTPヘッダーを暗号化できませんでした。",
    };
  }
  const saved = {
    name,
    description: description || null,
    transport,
    endpoint: endpoint || null,
    headers: jsonb(encryptedHeaders),
  };
  if (id === null)
    await db.orm.public.McpServer.create({ ...saved, ownerId: user.id });
  else
    await db.orm.public.McpServer.where({ id, ownerId: user.id }).update(saved);
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: number) {
  if (!(await db.orm.public.McpServer.first({ id, ownerId: user.id })))
    return false;
  await db.orm.public.McpServer.where({ id, ownerId: user.id }).delete();
  return true;
}
