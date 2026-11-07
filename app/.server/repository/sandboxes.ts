import { db } from "./db";
import type { AuthUser } from "../auth";
import { generateResourceId, jsonb, jsonbToStringRecord, parseStringList, record } from "../utils";
import {
  executeSandboxCommand,
  getSandbox,
  listSandboxNames,
} from "../features/toolsets/sandboxes";
import {
  closeSandboxTerminalsForInstance,
  openSandboxTerminal,
} from "../features/toolsets/sandboxes/terminal-sessions";
import { appLogger } from "~/.server/logger/app-logger";
import { logAuditEvent } from "../logger/audit-logger";
import { SANDBOX_SCOPES } from "~/const";
import { t } from "~/.server/i18n";
import {
  filterResourcesByRole,
  hasResourceAccess,
  includeResourcePermissions,
} from "../authorization";
export type SandboxScope = keyof typeof SANDBOX_SCOPES;

function isSandboxScope(value: string): value is SandboxScope {
  return Object.hasOwn(SANDBOX_SCOPES, value);
}

export async function listSandboxes(user: AuthUser, ids: string[]) {
  const sandboxes = await filterResourcesByRole(user, await db.orm.aibot.Sandbox.where({
    organizationId: user.organizationId,
  }).where((sandbox) => sandbox.id.in(ids)).all());
  const sandboxNames = await listSandboxNames();
  return {
    sandboxTypeOptions: sandboxNames.map((name) => ({
      label: name,
      value: name,
    })),
    records: await includeResourcePermissions(user, await Promise.all(
      sandboxes.map(async (sandbox) => {
        const instances = await db.orm.aibot.PersistentSandboxInstance.where({
          sandboxId: sandbox.id,
        }).all();
        return record(sandbox.id, "—", {
          sandboxType: sandbox.sandboxType,
          type: sandbox.sandboxType,
          sandboxScope: sandbox.sandboxScope,
          scope: SANDBOX_SCOPES[sandbox.sandboxScope],
          name: sandbox.name,
          envs: JSON.stringify(sandbox.envs ?? {}),
          allowedDomainList: JSON.stringify(sandbox.allowedDomainList),
          initCommands: sandbox.initCommands.join("\n"),
          instances: JSON.stringify(
            instances.map((instance) => ({
              instanceId: instance.instanceId,
              scopeLabel: instance.threadId
                ? "server.thread"
                : instance.adapterId !== null
                  ? t("server.adapterNumber", { 0: instance.adapterId })
                  : instance.chatbotId !== null
                    ? t("server.botNumber", { 0: instance.chatbotId })
                    : "server.shared",
            })),
          ),
        });
      }),
    )),
  };
}

const SHELL_OUTPUT_LIMIT = 30_000;

function limitShellOutput(value: string) {
  return value.length > SHELL_OUTPUT_LIMIT
    ? t("server.truncatedOutput", { 0: value.slice(0, SHELL_OUTPUT_LIMIT) })
    : value;
}

export async function runPersistentSandboxCommand(
  user: AuthUser,
  sandboxId: string,
  instanceId: string,
  command: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(sandboxId))
    return { ok: false, error: "server.sandboxNotFound" };
  if (!instanceId.trim())
    return { ok: false, error: "server.sandboxInstanceRequired" };
  if (!command.trim())
    return { ok: false, error: "server.commandRequired" };
  if (command.length > 4_000)
    return { ok: false, error: "server.commandTooLong" };

  const sandbox = await db.orm.aibot.Sandbox.first({
    id: sandboxId,
    organizationId: user.organizationId,
  });
  if (!sandbox) return { ok: false, error: "server.sandboxNotFound" };
  if (!(await hasResourceAccess(user, sandboxId, "update"))) return { ok: false, error: "server.sandboxNotFound" };

  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  }).first();
  if (!instance || instance.sandboxId !== sandbox.id)
    return { ok: false, error: "server.selectedInstanceNotFound" };

  try {
    const result = await executeSandboxCommand(
      sandbox.sandboxType,
      instanceId,
      jsonbToStringRecord(sandbox.envs),
      [...sandbox.allowedDomainList],
      command,
    );
    logAuditEvent(
      "sandbox.command.executed",
      "sandbox_instance",
      instanceId,
      user.id,
    );
    return {
      ok: true,
      command,
      stdout: limitShellOutput(result.stdout),
      stderr: limitShellOutput(result.stderr),
      exitCode: result.exitCode,
    };
  } catch (error) {
    appLogger.error("Persistent sandbox command failed", {
      error,
      sandboxId,
      instanceId,
    });
    return {
      ok: false,
      command,
      error:
        error instanceof Error
          ? error.message
          : "server.sandboxCommandFailed",
    };
  }
}

export async function startPersistentSandboxTerminal(
  user: AuthUser,
  sandboxId: string,
  instanceId: string,
  cols: number,
  rows: number,
) {
  if (!/^[0-9a-f-]{36}$/i.test(sandboxId))
    return { ok: false, error: "server.sandboxNotFound" };
  if (!instanceId.trim())
    return { ok: false, error: "server.sandboxInstanceRequired" };
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 2 ||
    cols > 500 ||
    rows < 1 ||
    rows > 300
  ) {
    return { ok: false, error: "server.invalidTerminalSize" };
  }

  const sandbox = await db.orm.aibot.Sandbox.first({
    id: sandboxId,
    organizationId: user.organizationId,
  });
  if (!sandbox) return { ok: false, error: "server.sandboxNotFound" };
  if (!(await hasResourceAccess(user, sandboxId, "update"))) return { ok: false, error: "server.sandboxNotFound" };

  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  }).first();
  if (!instance || instance.sandboxId !== sandbox.id)
    return { ok: false, error: "server.selectedInstanceNotFound" };

  try {
    const terminalId = await openSandboxTerminal(
      user.id,
      sandbox.sandboxType,
      instanceId,
      jsonbToStringRecord(sandbox.envs),
      [...sandbox.allowedDomainList],
      { cols, rows },
    );
    logAuditEvent(
      "sandbox.terminal.opened",
      "sandbox_instance",
      instanceId,
      user.id,
    );
    return { ok: true, terminalId };
  } catch (error) {
    appLogger.error("Persistent sandbox terminal failed to start", {
      error,
      sandboxId,
      instanceId,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "server.sandboxShellStartFailed",
    };
  }
}

export async function saveSandbox(
  user: AuthUser,
  id: string | null,
  values: FormData,
) {
  const sandboxType = String(values.get("sandboxType") ?? "").trim();
  const sandboxScope = String(values.get("sandboxScope") ?? "").trim();
  const sandboxName = String(values.get("name") ?? "").trim();
  if (!(await listSandboxNames()).includes(sandboxType))
    return { error: "server.unsupportedSandboxType" };
  if (!isSandboxScope(sandboxScope))
    return { error: "server.sandboxScopeRequired" };
  let envs: Record<string, string>;
  let allowedDomainList: string[];
  let initCommands: string[];
  try {
    const envValue: unknown = JSON.parse(
      String(values.get("envs") ?? "{}").trim() || "{}",
    );
    if (
      !envValue ||
      typeof envValue !== "object" ||
      Array.isArray(envValue) ||
      Object.values(envValue).some((v) => typeof v !== "string")
    )
      throw new Error("server.sandboxEnvironmentVariablesMustBeStringObject");
    envs = envValue as Record<string, string>;
    allowedDomainList = parseStringList(
      String(values.get("allowedDomainList") ?? "[]").trim(),
    );
    initCommands = String(values.get("initCommands") ?? "")
      .split(/\r?\n/)
      .map((command) => command.trim())
      .filter(Boolean);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "server.invalidInput",
    };
  }
  if (
    id !== null &&
    (!(await db.orm.aibot.Sandbox.first({ id, organizationId: user.organizationId })) ||
      !(await hasResourceAccess(user, id, "update")))
  )
    return { error: "server.sandboxNotFound" };
  const saved = {
    sandboxType,
    sandboxScope,
    envs: jsonb(envs),
    allowedDomainList,
    initCommands,
    name: sandboxName,
  };
  if (id === null) {
    const sandbox = await db.transaction(async (tx) => {
      const id = generateResourceId();
      await tx.orm.aibot.ResourceBase.create({ id });
      const created = await tx.orm.aibot.Sandbox.create({
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
    logAuditEvent("sandbox.created", "sandbox", sandbox.id, user.id);
  } else {
    await db.orm.aibot.Sandbox.where({ id, organizationId: user.organizationId }).update(saved);
    logAuditEvent("sandbox.updated", "sandbox", id, user.id);
  }
  return { ok: true };
}

export async function deleteSandbox(user: AuthUser, id: string) {
  const sandbox = await db.orm.aibot.Sandbox.first({
    id,
    organizationId: user.organizationId,
  });
  if (!sandbox || !(await hasResourceAccess(user, id, "delete"))) return false;

  const instances = await db.orm.aibot.PersistentSandboxInstance.where({
    sandboxId: id,
  }).all();
  for (const instance of instances)
    await destroySandboxInstance(sandbox.sandboxType, instance.instanceId);

  await db.orm.aibot.ResourceBase.where({ id }).delete();
  logAuditEvent("sandbox.deleted", "sandbox", id, user.id);
  return true;
}

export async function getSandboxInstance(instanceId: string) {
  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  })
    .include("sandbox")
    .first();
  return instance;
}

export async function getChatBotSandbox(chatbotId: string, organizationId: string) {
  const links = await db.orm.aibot.ChatBotToolSandbox.where({ chatbotId })
    .include("sandBox")
    .all();
  return (
    links.find((link) => link.sandBox.organizationId === organizationId)?.sandBox ?? null
  );
}

export async function getPersistentSandboxInstance(
  sandboxId: string,
  sandboxScope: SandboxScope,
  threadId: string | null,
  adapterId: string | null,
  chatbotId: string | null,
) {
  if (sandboxScope === "turn") return null;

  const instances = await db.orm.aibot.PersistentSandboxInstance.where({
    sandboxId,
  }).all();
  switch (sandboxScope) {
    case "thread": {
      const isValid =
        threadId !== null && adapterId !== null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "adapter": {
      const isValid =
        threadId === null && adapterId !== null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "bot": {
      const isValid =
        threadId === null && adapterId === null && chatbotId !== null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
    case "all": {
      const isValid =
        threadId === null && adapterId === null && chatbotId === null;
      if (!isValid) throw new Error("unexpected arg pattern");
      break;
    }
  }
  return instances.find(
    (instance) =>
      instance.threadId === threadId &&
      instance.adapterId === adapterId &&
      instance.chatbotId === chatbotId,
  );
}

export async function createPersistentSandboxInstance(values: {
  organizationId?: string;
  instanceId: string;
  sandboxId: string;
  chatbotId: string | null;
  adapterId: string | null;
  threadId: string | null;
}) {
  const sandbox = await db.orm.aibot.Sandbox.first({ id: values.sandboxId });
  if (!sandbox) throw new Error("server.sandboxNotFound");
  const instance = await db.orm.aibot.PersistentSandboxInstance.create({
    ...values,
    organizationId: sandbox.organizationId,
  });
  logAuditEvent(
    "sandbox_instance.created",
    "sandbox_instance",
    instance.instanceId,
  );
  return instance;
}

export async function deleteSandboxInstance(
  user: AuthUser,
  sandboxId: string,
  instanceId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(sandboxId) || !instanceId.trim())
    return false;
  const instance = await db.orm.aibot.PersistentSandboxInstance.whereUnique({
    instanceId,
  })
    .include("sandbox")
    .first();
  if (
    !instance ||
    instance.sandboxId !== sandboxId ||
    instance.sandbox.organizationId !== user.organizationId ||
    !(await hasResourceAccess(user, sandboxId, "update"))
  )
    return false;

  await closeSandboxTerminalsForInstance(user.id, instanceId);
  await destroySandboxInstance(instance.sandbox.sandboxType, instanceId);
  await db.orm.aibot.PersistentSandboxInstance.where({ instanceId }).delete();
  logAuditEvent(
    "sandbox_instance.deleted",
    "sandbox_instance",
    instanceId,
    user.id,
  );
  return true;
}

async function destroySandboxInstance(sandboxType: string, instanceId: string) {
  const sandboxProvider = getSandbox(sandboxType);
  if (!sandboxProvider)
    throw new Error(`Unsupported sandbox type: ${sandboxType}`);
  await sandboxProvider.destroySandbox(instanceId);
}
