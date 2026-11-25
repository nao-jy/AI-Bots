import { kysely } from "./kysely";
import type { AuthUser } from "../auth";
import {
  decryptMcpHeaders,
  decryptMcpContext,
  encryptMcpContext,
  encryptStringMap,
  generateResourceId,
  jsonb,
} from "../utils";
import { getMcpContextSchema } from "../features/mcp-schema";
import { logAuditEvent } from "../logger/audit-logger";

export function isBuiltinApiRouteMigration(
  kind: "sandbox" | "filesystem",
  previous: string,
  next: string,
) {
  try {
    const from = new URL(previous);
    const to = new URL(next);
    const direct =
      kind === "sandbox"
        ? "http://sandbox-api:8090/"
        : "http://filesystem-api:8091/";
    const routed =
      kind === "sandbox"
        ? "http://bot-tools/sandbox"
        : "http://bot-tools/filesystem";
    return (
      from.href === direct && (to.href === routed || to.href === `${routed}/`)
    );
  } catch {
    return false;
  }
}

export async function listServiceApis(user: AuthUser) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  const [sandboxes, filesystems] = await Promise.all([
    kysely.selectFrom("aibot.SandboxAPI").select(["id", "name", "endpoint"])
      .where("organizationId", "=", user.organizationId).execute(),
    kysely.selectFrom("aibot.FileSystemAPI").select(["id", "name", "endpoint"])
      .where("organizationId", "=", user.organizationId).execute(),
  ]);
  return {
    sandboxes: sandboxes.map(({ id, name, endpoint }) => ({
      id,
      name,
      endpoint,
    })),
    filesystems: filesystems.map(({ id, name, endpoint }) => ({
      id,
      name,
      endpoint,
    })),
  };
}

export async function loadFileSystemContextSchema(
  user: AuthUser,
  form: FormData,
) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  try {
    const endpoint = String(form.get("endpoint") ?? "").trim();
    const url = new URL(endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid endpoint");
    const id = String(form.get("id") ?? "");
    const rawHeaders = String(form.get("headers") ?? "").trim();
    let headers: Record<string, string>;
    if (rawHeaders) {
      const parsed: unknown = JSON.parse(rawHeaders);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((v) => typeof v !== "string")
      )
        throw new Error("Invalid headers");
      headers = parsed as Record<string, string>;
    } else if (id) {
      const api = await kysely.selectFrom("aibot.FileSystemAPI").select(["endpoint", "headers"])
        .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst();
      if (!api || api.endpoint !== endpoint) throw new Error("Invalid API");
      headers = decryptMcpHeaders(api.headers);
    } else {
      headers = {};
    }
    new Headers(headers);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    const schema = await getMcpContextSchema(
      new URL("context-schema", url).href,
      headers,
      endpoint,
    );
    return { schema };
  } catch {
    return { schemaError: true };
  }
}

export async function testServiceApi(user: AuthUser, form: FormData) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  try {
    const kind = String(form.get("kind") ?? "");
    if (kind !== "sandbox" && kind !== "filesystem") throw new Error();
    const endpoint = String(form.get("endpoint") ?? "").trim();
    const url = new URL(endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    const id = String(form.get("id") ?? "");
    const rawHeaders = String(form.get("headers") ?? "").trim();
    const rawContext = String(form.get("context") ?? "").trim();
    let existing: { endpoint: string; headers: unknown; context?: unknown } | null = null;
    if (id && (!rawHeaders || (kind === "filesystem" && !rawContext))) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
      existing =
        kind === "sandbox"
          ? await kysely.selectFrom("aibot.SandboxAPI").select(["endpoint", "headers"])
              .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst() ?? null
          : (await kysely.selectFrom("aibot.FileSystemAPI").select(["endpoint", "headers", "context"])
              .where("id", "=", id).where("organizationId", "=", user.organizationId).executeTakeFirst()) ?? null;
      if (!existing || existing.endpoint !== endpoint) throw new Error();
    }
    const parsedHeaders: unknown = rawHeaders
      ? JSON.parse(rawHeaders)
      : existing
        ? decryptMcpHeaders(existing.headers)
        : {};
    if (
      !parsedHeaders ||
      typeof parsedHeaders !== "object" ||
      Array.isArray(parsedHeaders) ||
      Object.values(parsedHeaders).some((value) => typeof value !== "string")
    )
      throw new Error();
    const headers = new Headers(parsedHeaders as Record<string, string>);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    if (kind === "sandbox") {
      const response = await fetch(new URL("v1/instances", url), {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (
        response.status !== 405 ||
        !response.headers
          .get("allow")
          ?.split(",")
          .some((method) => method.trim().toUpperCase() === "POST")
      )
        throw new Error();
    } else {
      const context: unknown = rawContext
        ? JSON.parse(rawContext)
        : existing && "context" in existing
          ? decryptMcpContext(existing.context)
          : null;
      if (!context || typeof context !== "object" || Array.isArray(context))
        throw new Error();
      headers.set("Content-Type", "application/json");
      const response = await fetch(new URL("v1/list", url), {
        method: "POST",
        headers,
        body: JSON.stringify({ context, prefix: "", mode: "directory" }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("entries" in result) ||
        !Array.isArray(result.entries)
      )
        throw new Error();
    }
    return { apiTest: true, apiTestOk: true };
  } catch {
    return { apiTest: true, apiTestOk: false };
  }
}

export async function saveServiceApi(user: AuthUser, form: FormData) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  const kind = String(form.get("kind") ?? "");
  if (kind !== "sandbox" && kind !== "filesystem")
    return { error: "Invalid API type" };
  const idValue = String(form.get("id") ?? "");
  if (idValue && !/^[0-9a-f-]{36}$/i.test(idValue))
    return { error: "Invalid API" };
  const existing = idValue
    ? kind === "sandbox"
      ? await kysely.selectFrom("aibot.SandboxAPI").selectAll()
          .where("id", "=", idValue).where("organizationId", "=", user.organizationId).executeTakeFirst()
      : await kysely.selectFrom("aibot.FileSystemAPI").selectAll()
          .where("id", "=", idValue).where("organizationId", "=", user.organizationId).executeTakeFirst()
    : null;
  if (idValue && !existing) return { error: "API not found" };
  const name = String(form.get("name") ?? "").trim();
  const endpoint = String(form.get("endpoint") ?? "").trim();
  let headers: Record<string, string> | null = null;
  let context: Record<string, unknown> = {};
  try {
    const url = new URL(endpoint);
    if (
      !name ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    const rawHeaders = String(form.get("headers") || "").trim();
    const parsed: unknown = JSON.parse(rawHeaders || "{}");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((v) => typeof v !== "string")
    )
      throw new Error();
    headers =
      rawHeaders || !existing ? (parsed as Record<string, string>) : null;
    new Headers(headers ?? {});
    if (
      kind === "filesystem" &&
      (String(form.get("context") || "").trim() || !existing)
    ) {
      const value: unknown = JSON.parse(String(form.get("context") || "{}"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      context = value as Record<string, unknown>;
      if (
        typeof context.service !== "string" ||
        !context.config ||
        typeof context.config !== "object" ||
        Array.isArray(context.config) ||
        Object.values(context.config).some((v) => typeof v !== "string")
      )
        throw new Error();
    }
  } catch {
    return { error: "Invalid endpoint, headers, or filesystem context" };
  }
  const id = idValue || generateResourceId();
  const encryptedHeaders = headers
    ? jsonb(encryptStringMap(headers))
    : (existing?.headers ?? null);
  const encryptedContext =
    kind === "filesystem" &&
    (String(form.get("context") || "").trim() || !existing)
      ? jsonb(encryptMcpContext(context))
      : null;
  if (existing) {
    if (kind === "sandbox") {
      if (
        existing.endpoint !== endpoint &&
        !isBuiltinApiRouteMigration(kind, existing.endpoint, endpoint) &&
        (await kysely.selectFrom("aibot.Sandbox").select("id").where("apiId", "=", id).executeTakeFirst())
      )
        return { error: "Cannot change an API endpoint while it is in use" };
      await kysely.updateTable("aibot.SandboxAPI").set({ name, endpoint, headers: encryptedHeaders, updatedAt: new Date() })
        .where("id", "=", id).where("organizationId", "=", user.organizationId).execute();
    } else {
      if (
        ((existing.endpoint !== endpoint &&
          !isBuiltinApiRouteMigration(kind, existing.endpoint, endpoint)) ||
          encryptedContext) &&
        ((await kysely.selectFrom("aibot.ChatBotFileSystem").select("id").where("sandboxId", "=", id).executeTakeFirst()) ||
          (await kysely.selectFrom("aibot.Organization").select("id").where("temporaryFileSystemApiId", "=", id).executeTakeFirst()))
      )
        return {
          error: "Cannot change an API endpoint or context while it is in use",
        };
      await kysely.updateTable("aibot.FileSystemAPI").set({
        name,
        endpoint,
        headers: encryptedHeaders,
        ...(encryptedContext ? { context: encryptedContext } : {}),
        updatedAt: new Date(),
      }).where("id", "=", id).where("organizationId", "=", user.organizationId).execute();
    }
    logAuditEvent(`${kind}_api.updated`, `${kind}_api`, id, user.id);
    return { ok: true };
  }
  await kysely.transaction().execute(async (tx) => {
    await tx.insertInto("aibot.ResourceBase").values({ id, organizationId: user.organizationId }).execute();
    if (kind === "sandbox")
      await tx.insertInto("aibot.SandboxAPI").values({
        id,
        organizationId: user.organizationId,
        name,
        endpoint,
        headers: encryptedHeaders,
        updatedAt: new Date(),
      }).execute();
    else
      await tx.insertInto("aibot.FileSystemAPI").values({
        id,
        organizationId: user.organizationId,
        name,
        endpoint,
        headers: encryptedHeaders,
        context: encryptedContext!,
        updatedAt: new Date(),
      }).execute();
  });
  logAuditEvent(`${kind}_api.created`, `${kind}_api`, id, user.id);
  return { ok: true };
}

export async function deleteServiceApi(user: AuthUser, form: FormData) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  const kind = String(form.get("kind") ?? "");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid API" };
  if (kind !== "sandbox" && kind !== "filesystem")
    return { error: "Invalid API type" };
  const deleted = await kysely.transaction().execute(async (tx) => {
    if (kind === "sandbox") {
      const api = await tx.selectFrom("aibot.SandboxAPI").select("id")
        .where("id", "=", id).where("organizationId", "=", user.organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (!api || (await tx.selectFrom("aibot.Sandbox").select("id").where("apiId", "=", id).executeTakeFirst()))
        return false;
    } else {
      const api = await tx.selectFrom("aibot.FileSystemAPI").select("id")
        .where("id", "=", id).where("organizationId", "=", user.organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (
        !api ||
        (await tx.selectFrom("aibot.ChatBotFileSystem").select("id").where("sandboxId", "=", id).executeTakeFirst()) ||
        (await tx.selectFrom("aibot.Organization").select("id").where("temporaryFileSystemApiId", "=", id).executeTakeFirst())
      )
        return false;
    }
    await tx.deleteFrom("aibot.ResourceBase").where("id", "=", id)
      .where("organizationId", "=", user.organizationId).execute();
    return true;
  });
  if (!deleted) return { error: "API is in use or not found" };
  logAuditEvent(`${kind}_api.deleted`, `${kind}_api`, id, user.id);
  return { ok: true };
}

export async function saveTemporaryFileApi(user: AuthUser, form: FormData) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  const apiId = String(form.get("temporaryFileSystemApiId") ?? "").trim();
  if (
    apiId &&
    (!/^[0-9a-f-]{36}$/i.test(apiId) ||
      !(await kysely.selectFrom("aibot.FileSystemAPI").select("id")
        .where("id", "=", apiId).where("organizationId", "=", user.organizationId).executeTakeFirst()))
  )
    return { error: "Filesystem API not found" };
  await kysely.updateTable("aibot.Organization")
    .set({ temporaryFileSystemApiId: apiId || null, updatedAt: new Date() })
    .where("id", "=", user.organizationId).execute();
  logAuditEvent(
    "temporary_file_api.updated",
    "organization",
    user.organizationId,
    user.id,
  );
  return { ok: true };
}
