import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  decryptMcpHeaders,
  decryptMcpContext,
  encryptCredential,
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
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema } from "@rjsf/utils";

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
    await db.orm.aibot.McpServer.where({ organizationId: user.organizationId })
      .where((server) => server.id.in(ids))
      .orderBy((server) => server.updatedAt.desc())
      .all(),
  );
  return {
    records: await includeResourcePermissions(
      user,
      servers.map((server) => {
        return record(server.id, server.updatedAt, {
          name: server.name,
          description: server.description ?? "",
          transport: TRANSPORTS[server.transport] ?? server.transport,
          transportId: server.transport,
          endpoint: server.endpoint ?? "",
          headers: JSON.stringify(decryptMcpHeaders(server.headers), null, 2),
          context: JSON.stringify(decryptMcpContext(server.headers), null, 2),
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
  const contextValue = String(values.get("context") ?? "{}").trim();
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
  let context: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(contextValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    context = parsed as Record<string, unknown>;
  } catch {
    return { error: "MCP context must be a JSON object." };
  }
  if (
    id !== null &&
    (!(await db.orm.aibot.McpServer.first({
      id,
      organizationId: user.organizationId,
    })) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.mcpServerNotFound" };
  if (Object.keys(context).length) {
    try {
      const schemaUrl = new URL(endpoint);
      schemaUrl.pathname = schemaUrl.pathname.replace(
        /\/?[^/]+\/?$/,
        "/context-schema",
      );
      schemaUrl.search = "";
      schemaUrl.hash = "";
      const response = await fetch(schemaUrl, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
      const schema: unknown = await response.json();
      if (
        !schema ||
        typeof schema !== "object" ||
        Array.isArray(schema) ||
        (schema as { type?: unknown }).type !== "object"
      )
        throw new Error();
      if (
        !validator.isValid(schema as RJSFSchema, context, schema as RJSFSchema)
      )
        return {
          error: "MCP context does not match the server context schema.",
        };
    } catch {
      return { error: "Could not load the MCP server context schema." };
    }
  }
  let encryptedHeaders: ReturnType<typeof encryptStringMap> & {
    contextCiphertext?: string;
  };
  try {
    encryptedHeaders = encryptStringMap(headers);
    if (Object.keys(context).length)
      encryptedHeaders.contextCiphertext = encryptCredential(
        JSON.stringify(context),
      );
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
    const server = await db.transaction(async (tx) => {
      const id = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({
        id,
        organizationId: user.organizationId,
      });
      const created = await tx.orm.aibot.McpServer.create({
        id,
        ...saved,
        organizationId: user.organizationId,
      });
      await tx.orm.aibot.Grant.create({
        organizationId: user.organizationId,
        principalId: user.id,
        resourceId: id,
        role: "manager",
        grantedById: user.id,
      });
      return created;
    });
    logAuditEvent("mcp_server.created", "mcp_server", server.id, user.id);
  } else {
    await db.orm.aibot.McpServer.where({
      id,
      organizationId: user.organizationId,
    }).update(saved);
    logAuditEvent("mcp_server.updated", "mcp_server", id, user.id);
  }
  return { ok: true };
}

export async function deleteMcpServer(user: AuthUser, id: string) {
  if (
    !(await db.orm.aibot.McpServer.first({
      id,
      organizationId: user.organizationId,
    })) ||
    !(await hasResourceAccess(user, id, "delete"))
  )
    return false;
  await db.orm.aibot.ResourceBase.where({ id }).delete();
  logAuditEvent("mcp_server.deleted", "mcp_server", id, user.id);
  return true;
}
