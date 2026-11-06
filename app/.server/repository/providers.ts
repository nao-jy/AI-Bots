import { db } from "./db";
import type { AuthUser } from "../auth";
import { decryptMcpHeaders, encryptStringMap, generateResourceId, jsonb, record } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";
import { filterResourcesByRole, hasResourceAccess, includeResourcePermissions } from "../authorization";

export async function listProviders(user: AuthUser) {
  const providers = await filterResourcesByRole(user, await db.orm.aibot.Provider.where({ organizationId: user.organizationId })
    .orderBy((provider) => provider.updatedAt.desc())
    .all());
  return {
    records: await includeResourcePermissions(user, providers.map((provider) => {
      const headers = decryptMcpHeaders(provider.headers);
      return record(provider.id, provider.updatedAt, {
        name: provider.name,
        providerName: provider.providerName,
        args: JSON.stringify(provider.args ?? {}, null, 2),
        headers: JSON.stringify(headers, null, 2),
        headersConfigured: Object.keys(headers).length ? "server.configured" : "server.notConfigured",
      });
    })),
  };
}

export async function saveProvider(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const providerName = String(values.get("providerName") ?? "").trim();
  const argsValue = String(values.get("args") ?? "{}").trim();
  const headersValue = String(values.get("headers") ?? "{}").trim();
  if (!name || !providerName)
    return { error: "server.providerConnectionNameAndProviderRequired" };
  let args: unknown;
  let headers: Record<string, string>;
  try {
    args = JSON.parse(argsValue || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args))
      return { error: "server.providerArgumentsMustBeObject" };
  } catch {
    return { error: "server.invalidProviderArgumentsJson" };
  }
  try {
    const parsed: unknown = JSON.parse(headersValue || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "server.providerHttpHeadersMustBeObject" };
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      return { error: "server.providerHttpHeaderValuesMustBeStrings" };
    headers = parsed as Record<string, string>;
  } catch {
    return { error: "server.invalidProviderHttpHeadersJson" };
  }
  if (
    id !== null &&
    (!(await db.orm.aibot.Provider.first({ id, organizationId: user.organizationId })) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.providerNotFound" };
  const duplicate = await db.orm.aibot.Provider.first({
    organizationId: user.organizationId,
    name,
  });
  if (duplicate && duplicate.id !== id)
    return { error: "server.duplicateProviderName" };
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
    providerName,
    args: jsonb(args),
    headers: jsonb(encryptedHeaders),
  };
  if (id === null) {
    const provider = await db.transaction(async (tx) => {
      const id = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id });
      const created = await tx.orm.aibot.Provider.create({
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
    logAuditEvent("provider.created", "provider", provider.id, user.id);
  } else {
    await db.orm.aibot.Provider.where({ id, organizationId: user.organizationId }).update(saved);
    logAuditEvent("provider.updated", "provider", id, user.id);
  }
  return { ok: true };
}

export async function deleteProvider(user: AuthUser, id: string) {
  if (!(await db.orm.aibot.Provider.first({ id, organizationId: user.organizationId })) ||
      !(await hasResourceAccess(user, id, "delete")))
    return false;
  if (await db.orm.aibot.AgentDefinition.first({ providerId: id }))
    return false;
  await db.orm.aibot.Provider.where({ id, organizationId: user.organizationId }).delete();
  logAuditEvent("provider.deleted", "provider", id, user.id);
  return true;
}

export async function getProvider(providerId: string, user: AuthUser) {
  const provider = await db.orm.aibot.Provider.first({
    id: providerId,
    organizationId: user.organizationId,
  });
  if (!provider || !(await hasResourceAccess(user, providerId, "read"))) return null;
  return provider;
}
