import { db } from "./db";
import type { AuthUser } from "../auth";
import type { PublicIdSlot } from "../../types/entities";
import {
  decryptAdapterEnvs,
  encryptStringMap,
  generatePublicId,
  jsonb,
  record,
} from "../utils";
import { toDisplayNameAdapter } from "../features/chat-adapter";
import { logAuditEvent } from "../logger/audit-logger";

export async function listAdapters(user: AuthUser) {
  const [adapters, authentications] = await Promise.all([
    db.orm.aibot.ChatAdapter.where({ ownerId: user.id })
      .include("publicIds")
      .all(),
    db.orm.aibot.OAuthAuthentication.where({ ownerId: user.id }).all(),
  ]);
  const authNames = new Map(
    authentications.map((auth) => [auth.id, auth.name]),
  );
  return {
    records: adapters.map((adapter) => {
      const config = decryptAdapterEnvs(adapter.config);
      return record(adapter.id, adapter.updatedAt, {
        name: adapter.name,
        platform: toDisplayNameAdapter(adapter.platform) ?? adapter.platform,
        platformId: adapter.platform,
        authId: adapter.authId === null ? "" : String(adapter.authId),
        authentication:
          adapter.authId === null
            ? "server.notConfigured"
            : (authNames.get(adapter.authId) ?? "server.unknown"),
        config: JSON.stringify(config),
        configured: Object.keys(config).length ? "server.configured" : "server.notConfigured",
        publicIds: JSON.stringify(
          adapter.publicIds.map(({ slot, id }) => ({ slot, id })),
        ),
      });
    }),
    authOptions: authentications.map((auth) => ({
      label: auth.name,
      value: String(auth.id),
    })),
  };
}

export async function saveAdapter(
  user: AuthUser,
  id: number | null,
  values: FormData,
) {
  const name = String(values.get("name") ?? "").trim();
  const platform = String(
    values.get("platformId") ?? values.get("platform") ?? "",
  ).trim();
  const configValue = String(values.get("config") ?? "{}").trim();
  const authValue = String(values.get("authId") ?? "").trim();
  const authId = authValue ? Number(authValue) : null;
  if (!name || !platform)
    return { error: "server.adapterNameAndPlatformRequired" };
  let config: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(configValue || "{}");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    )
      return { error: "server.environmentVariablesMustBeStringPairs" };
    config = parsed as Record<string, string>;
  } catch {
    return { error: "server.invalidEnvironmentVariables" };
  }
  if (id !== null) {
    if (!(await db.orm.aibot.ChatAdapter.first({ id, ownerId: user.id })))
      return { error: "server.adapterNotFound" };
  }
  if (authId !== null) {
    if (
      !Number.isInteger(authId) ||
      !(await db.orm.aibot.OAuthAuthentication.first({
        id: authId,
        ownerId: user.id,
      }))
    )
      return { error: "server.selectedOauthAuthenticationNotFound" };
  }
  let encryptedConfig: ReturnType<typeof encryptStringMap>;
  try {
    encryptedConfig = encryptStringMap(config);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "server.environmentVariablesEncryptionFailed",
    };
  }
  const storedEnvs = jsonb(encryptedConfig);
  if (id === null) {
    const adapterId = await db.transaction(async (tx) => {
      const adapter = await tx.orm.aibot.ChatAdapter.create({
        name,
        platform,
        ownerId: user.id,
        config: storedEnvs,
        authId,
      });
      for (const slot of ["first", "second"] as const) {
        await tx.orm.aibot.ChatAdapterPublicId.create({
          id: generatePublicId(),
          slot,
          adapterId: adapter.id,
        });
      }
      return adapter.id;
    });
    logAuditEvent("adapter.created", "adapter", adapterId, user.id);
  } else {
    await db.orm.aibot.ChatAdapter.where({ id, ownerId: user.id }).update({
      name,
      platform,
      config: storedEnvs,
      authId,
    });
    logAuditEvent("adapter.updated", "adapter", id, user.id);
  }
  return { ok: true };
}

export async function deleteAdapter(user: AuthUser, id: number) {
  if (!(await db.orm.aibot.ChatAdapter.first({ id, ownerId: user.id })))
    return false;
  await db.orm.aibot.ChatAdapter.where({ id, ownerId: user.id }).delete();
  logAuditEvent("adapter.deleted", "adapter", id, user.id);
  return true;
}

export async function regenerateAdapterPublicIds(
  user: AuthUser,
  id: number,
  slot: PublicIdSlot,
) {
  const updated = await db.transaction(async (tx) => {
    const adapter = await tx.orm.aibot.ChatAdapter.first({
      id,
      ownerId: user.id,
    });
    if (!adapter) return false;

    const publicIds = await tx.orm.aibot.ChatAdapterPublicId.where({
      adapterId: id,
    }).all();
    const publicId = publicIds.find((item) => item.slot === slot);
    if (publicId) {
      await tx.orm.aibot.ChatAdapterPublicId.where({
        id: publicId.id,
      }).update({
        id: generatePublicId(),
      });
    } else {
      await tx.orm.aibot.ChatAdapterPublicId.create({
        id: generatePublicId(),
        slot,
        adapterId: id,
      });
    }
    return true;
  });
  if (updated)
    logAuditEvent("adapter.public_id.regenerated", "adapter", id, user.id);
  return updated;
}
