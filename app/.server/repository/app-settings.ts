import { db } from "./db";
import { logAuditEvent } from "../logger/audit-logger";

const DEFAULT_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_MINIMUM_PASSWORD_STRENGTH = 2;

export async function getAppSettings(organizationId?: string) {
  const settings = organizationId
    ? await db.orm.aibot.Organization.first({ id: organizationId })
    : await db.orm.aibot.Organization.first();
  const sessionDurationSeconds = settings?.sessionDurationSeconds;
  const maxLoginAttempts = settings?.maxLoginAttempts;
  const minimumPasswordStrength =
    settings?.minimumPasswordStrength ?? DEFAULT_MINIMUM_PASSWORD_STRENGTH;
  return {
    organizationName: settings?.name ?? "",
    temporaryFileSystemApiId: settings?.temporaryFileSystemApiId ?? "",
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
    minimumPasswordStrength:
      Number.isSafeInteger(minimumPasswordStrength) &&
      minimumPasswordStrength >= 0 &&
      minimumPasswordStrength <= 4
        ? minimumPasswordStrength
        : DEFAULT_MINIMUM_PASSWORD_STRENGTH,
  };
}

export async function saveAppSettings(values: {
  organizationId: string;
  organizationName: string;
  mfaEnabled: boolean;
  sessionDurationSeconds: number;
  maxLoginAttempts: number;
  minimumPasswordStrength: number;
}) {
  const { organizationId, organizationName, ...settings } = values;
  await db.orm.aibot.Organization.where({ id: organizationId }).update({
    ...settings,
    name: organizationName.trim(),
  });
  logAuditEvent("app_settings.updated", "organization", organizationId);
}
