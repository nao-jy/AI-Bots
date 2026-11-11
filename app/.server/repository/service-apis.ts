import { db } from "./db";
import type { AuthUser } from "../auth";
import {
  encryptMcpContext,
  encryptStringMap,
  generateResourceId,
  jsonb,
} from "../utils";
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
    db.orm.aibot.SandboxAPI.where({
      organizationId: user.organizationId,
    }).all(),
    db.orm.aibot.FileSystemAPI.where({
      organizationId: user.organizationId,
    }).all(),
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
      ? await db.orm.aibot.SandboxAPI.first({
          id: idValue,
          organizationId: user.organizationId,
        })
      : await db.orm.aibot.FileSystemAPI.first({
          id: idValue,
          organizationId: user.organizationId,
        })
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
        (await db.orm.aibot.Sandbox.first({ apiId: id }))
      )
        return { error: "Cannot change an API endpoint while it is in use" };
      await db.orm.aibot.SandboxAPI.where({
        id,
        organizationId: user.organizationId,
      }).update({ name, endpoint, headers: encryptedHeaders });
    } else {
      if (
        ((existing.endpoint !== endpoint &&
          !isBuiltinApiRouteMigration(kind, existing.endpoint, endpoint)) ||
          encryptedContext) &&
        ((await db.orm.aibot.ChatBotFileSystem.first({ sandboxId: id })) ||
          (await db.orm.aibot.Organization.first({
            temporaryFileSystemApiId: id,
          })))
      )
        return {
          error: "Cannot change an API endpoint or context while it is in use",
        };
      await db.orm.aibot.FileSystemAPI.where({
        id,
        organizationId: user.organizationId,
      }).update({
        name,
        endpoint,
        headers: encryptedHeaders,
        ...(encryptedContext ? { context: encryptedContext } : {}),
      });
    }
    logAuditEvent(`${kind}_api.updated`, `${kind}_api`, id, user.id);
    return { ok: true };
  }
  await db.transaction(async (tx) => {
    await tx.orm.aibot.ResourceBase.create({
      id,
      organizationId: user.organizationId,
    });
    if (kind === "sandbox")
      await tx.orm.aibot.SandboxAPI.create({
        id,
        organizationId: user.organizationId,
        name,
        endpoint,
        headers: encryptedHeaders,
      });
    else
      await tx.orm.aibot.FileSystemAPI.create({
        id,
        organizationId: user.organizationId,
        name,
        endpoint,
        headers: encryptedHeaders,
        context: encryptedContext!,
      });
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
  const deleted = await db.transaction(async (tx) => {
    if (kind === "sandbox") {
      const api = await tx.orm.aibot.SandboxAPI.where({
        id,
        organizationId: user.organizationId,
      })
        .forUpdate()
        .first();
      if (!api || (await tx.orm.aibot.Sandbox.first({ apiId: id })))
        return false;
    } else {
      const api = await tx.orm.aibot.FileSystemAPI.where({
        id,
        organizationId: user.organizationId,
      })
        .forUpdate()
        .first();
      if (
        !api ||
        (await tx.orm.aibot.ChatBotFileSystem.first({ sandboxId: id })) ||
        (await tx.orm.aibot.Organization.first({
          temporaryFileSystemApiId: id,
        }))
      )
        return false;
    }
    await tx.orm.aibot.ResourceBase.where({
      id,
      organizationId: user.organizationId,
    }).delete();
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
      !(await db.orm.aibot.FileSystemAPI.first({
        id: apiId,
        organizationId: user.organizationId,
      })))
  )
    return { error: "Filesystem API not found" };
  await db.orm.aibot.Organization.where({ id: user.organizationId }).update({
    temporaryFileSystemApiId: apiId || null,
  });
  logAuditEvent(
    "temporary_file_api.updated",
    "organization",
    user.organizationId,
    user.id,
  );
  return { ok: true };
}
