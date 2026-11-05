import { db } from "./db";
import type { AuthUser } from "../auth";
import { decryptMcpHeaders, encryptStringMap, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

export const TRANSPORTS = {
  http: "Streamable HTTP",
} as const;

type McpTransport = keyof typeof TRANSPORTS;

function isMcpTransport(value: string): value is McpTransport {
  return Object.hasOwn(TRANSPORTS, value);
}

export async function listMcpServers(user: AuthUser) {
  const servers = await db.orm.aibot.McpServer.where({ ownerId: user.id })
    .orderBy((server) => server.updatedAt.desc())
    .all();
  return {
    records: servers.map((server) => {
      return record(server.id, server.updatedAt, {
        name: server.name,
        description: server.description ?? "",
        transport: TRANSPORTS[server.transport] ?? server.transport,
        transportId: server.transport,
        endpoint: server.endpoint ?? "",
        headers: JSON.stringify(decryptMcpHeaders(server.headers), null, 2),
        status: server.endpoint ? "server.endpointConfigured" : "server.endpointMissing",
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
    return { error: "server.serverNameAndTransportRequired" };
  if (!isMcpTransport(transport))
    return { error: "server.unsupportedTransport" };
  let headers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "server.httpHeadersMustBeObject" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "server.httpHeaderValuesMustBeStrings" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "server.invalidHttpHeadersJson" };
  }
  if (
    id !== null &&
    !(await db.orm.aibot.McpServer.first({ id, ownerId: user.id }))
  )
    return { error: "server.mcpServerNotFound" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "server.httpHeadersEncryptionFailed",
    };
  }
  const saved = {
    name,
    description: description || null,
    transport,
    endpoint: endpoint || null,
    headers: jsonb(encryptedHeaders),
  };
  if (id === null) {
    const server = await db.orm.aibot.McpServer.create({
      ...saved,
      ownerId: user.id,
    });
    logAuditEvent("mcp_server.created", "mcp_server", server.id, user.id);
  } else {
    await db.orm.aibot.McpServer.where({ id, ownerId: user.id }).update(saved);
    logAuditEvent("mcp_server.updated", "mcp_server", id, user.id);
  }
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.McpServer.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.McpServer.where({ id, ownerId: user.id }).delete();
  logAuditEvent("mcp_server.deleted", "mcp_server", id, user.id);
  return true;
}
