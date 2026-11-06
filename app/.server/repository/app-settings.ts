import { db } from "./db";
import { logAuditEvent } from "../logger/audit-logger";

const DEFAULT_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;

export async function getAppSettings(organizationId?: string) {
  const settings = organizationId
    ? await db.orm.aibot.Organization.first({ id: organizationId })
    : await db.orm.aibot.Organization.first();
  const sessionDurationSeconds = settings?.sessionDurationSeconds;
  const maxLoginAttempts = settings?.maxLoginAttempts;
  return {
    mfaEnabled: settings?.mfaEnabled ?? false,
    sessionDurationSeconds:
      sessionDurationSeconds &&
      Number.isSafeInteger(sessionDurationSeconds) &&
      sessionDurationSeconds > 0
        ? sessionDurationSeconds
        : DEFAULT_SESSION_DURATION_SECONDS,
    maxLoginAttempts:
      maxLoginAttempts &&
      Number.isSafeInteger(maxLoginAttempts) &&
      maxLoginAttempts > 0
        ? maxLoginAttempts
        : DEFAULT_MAX_LOGIN_ATTEMPTS,
  };
}

export async function saveAppSettings(values: {
  organizationId: string;
  mfaEnabled: boolean;
  sessionDurationSeconds: number;
  maxLoginAttempts: number;
}) {
  const { organizationId, ...settings } = values;
  await db.orm.aibot.Organization.where({ id: organizationId }).update(settings);
  logAuditEvent("app_settings.updated", "organization", organizationId);
}
