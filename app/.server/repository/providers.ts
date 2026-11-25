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

export async function listProviders(user: AuthUser, ids: string[]) {
  const providers = await filterResourcesByRole(
    user,
    await kysely
      .selectFrom("aibot.Provider")
      .selectAll()
      .where("organizationId", "=", user.organizationId)
      .where("id", "in", ids)
      .orderBy("updatedAt", "desc")
      .execute(),
  );
  return {
    records: await includeResourcePermissions(
      user,
      providers.map((provider) => {
        const headers = decryptMcpHeaders(provider.headers);
        return record(provider.id, provider.updatedAt, {
          name: provider.name,
          providerName: provider.providerName,
          args: JSON.stringify(provider.args ?? {}, null, 2),
          headers: JSON.stringify(headers, null, 2),
          headersConfigured: Object.keys(headers).length
            ? "server.configured"
            : "server.notConfigured",
        });
      }),
    ),
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
    (!(await kysely.selectFrom("aibot.Provider").select("id")
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.providerNotFound" };
  const duplicate = await kysely.selectFrom("aibot.Provider").select("id")
    .where("organizationId", "=", user.organizationId)
    .where("name", "=", name).executeTakeFirst();
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
    const provider = await kysely.transaction().execute(async (tx) => {
      const id = generateResourceId();
      await tx.insertInto("aibot.ResourceBase")
        .values({ id, organizationId: user.organizationId }).execute();
      const created = await tx.insertInto("aibot.Provider")
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
    logAuditEvent("provider.created", "provider", provider.id, user.id);
  } else {
    await kysely.updateTable("aibot.Provider")
      .set({ ...saved, updatedAt: new Date() })
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId)
      .execute();
    logAuditEvent("provider.updated", "provider", id, user.id);
  }
  return { ok: true };
}

export async function deleteProvider(user: AuthUser, id: string) {
  if (
    !(await kysely.selectFrom("aibot.Provider").select("id")
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId).executeTakeFirst()) ||
    !(await hasResourceAccess(user, id, "delete"))
  )
    return false;
  const deleted = await kysely.transaction().execute(async (tx) => {
    const provider = await tx.selectFrom("aibot.Provider").select("id")
      .where("id", "=", id)
      .where("organizationId", "=", user.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (
      !provider ||
      (await tx.selectFrom("aibot.AgentDefinition").select("id")
        .where("providerId", "=", id).executeTakeFirst())
    )
      return false;
    await tx.deleteFrom("aibot.ResourceBase").where("id", "=", id).execute();
    return true;
  });
  if (!deleted) return false;
  logAuditEvent("provider.deleted", "provider", id, user.id);
  return true;
}

export async function getProvider(providerId: string, user: AuthUser) {
  const provider = await kysely.selectFrom("aibot.Provider").selectAll()
    .where("id", "=", providerId)
    .where("organizationId", "=", user.organizationId).executeTakeFirst();
  if (!provider || !(await hasResourceAccess(user, providerId, "read")))
    return null;
  return provider;
}
