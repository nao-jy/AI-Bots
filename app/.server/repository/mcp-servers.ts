import { kysely } from "./kysely";
import type { AuthUser } from "../auth";
import {
  decryptMcpHeaders,
  encryptStringMap,
  generateResourceId,
  jsonb,
  record,
} from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";

export const TRANSPORTS = {
  http: "Streamable HTTP",
} as const;

type McpTransport = keyof typeof TRANSPORTS;

function isMcpTransport(value: string): value is McpTransport {
  return Object.hasOwn(TRANSPORTS, value);
}

export async function listMcpServers(user: AuthUser, ids: string[]) {
  const servers = await filterResourcesByRole(
    user,
    await kysely
      .selectFrom("aibot.McpServer")
      .selectAll()
      .where("organizationId", "=", user.organizationId)
      .where("id", "in", ids)
      .orderBy("updatedAt", "desc")
      .execute(),
  );
  return {
    records: await includeResourcePermissions(
      user,
      servers.map((server) => {
        return record(server.id, server.updatedAt, {
          name: server.name,
          description: server.description ?? "",
          transport:
            TRANSPORTS[server.transport as McpTransport] ?? server.transport,
          transportId: server.transport,
          endpoint: server.endpoint ?? "",
          headers: JSON.stringify(decryptMcpHeaders(server.headers), null, 2),
          contextEndpoint: server.contextEndpoint ?? "",
          status: server.endpoint
            ? "server.endpointConfigured"
            : "server.endpointMissing",
        });
      }),
    ),
  };
}

export async function saveMcpServer(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const description = String(values.get("description") ?? "").trim();
  const transport = String(values.get("transportId") ?? "").trim();
  const endpoint = String(values.get("endpoint") ?? "").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  const contextEndpoint = String(values.get("contextEndpoint") ?? "").trim();
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
    (!(await kysely.selectFrom("aibot.McpServer").select("id")
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.mcpServerNotFound" };
  let encryptedHeaders: ReturnType<typeof encryptStringMap>;
  try {
    encryptedHeaders = encryptStringMap(headers);
    if (contextEndpoint) {
      const url = new URL(contextEndpoint);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Invalid context schema URL");
    }
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
    contextEndpoint: contextEndpoint || null,
    headers: jsonb(encryptedHeaders),
  };
  if (id === null) {
    const server = await kysely.transaction().execute(async (tx) => {
      const id = generateResourceId();
      await tx.insertInto("aibot.ResourceBase")
        .values({ id, organizationId: user.organizationId }).execute();
      const created = await tx.insertInto("aibot.McpServer")
        .values({
          id,
          ...saved,
          organizationId: user.organizationId,
          updatedAt: new Date(),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx.insertInto("aibot.Grant")
        .values({
          organizationId: user.organizationId,
          principalId: user.id,
          resourceId: id,
          role: "manager",
          grantedById: user.id,
          updatedAt: new Date(),
        }).execute();
      return created;
    });
    logAuditEvent("mcp_server.created", "mcp_server", server.id, user.id);
  } else {
    await kysely.updateTable("aibot.McpServer")
      .set({ ...saved, updatedAt: new Date() })
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId)
      .execute();
    logAuditEvent("mcp_server.updated", "mcp_server", id, user.id);
  }
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: string) {
  if (
    !(await kysely.selectFrom("aibot.McpServer").select("id")
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
    !(await hasResourceAccess(user, id, "delete"))
  )
    return false;
  await kysely.deleteFrom("aibot.ResourceBase").where("id", "=", id).execute();
  logAuditEvent("mcp_server.deleted", "mcp_server", id, user.id);
  return true;
}
