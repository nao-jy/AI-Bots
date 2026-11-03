import { db } from "./db";

const DEFAULT_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;

export async function getAppSettings() {
  const settings = await db.orm.aibot.AppSettings.first({ id: "global" });
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
  mfaEnabled: boolean;
  sessionDurationSeconds: number;
  maxLoginAttempts: number;
}) {
  const current = await db.orm.aibot.AppSettings.first({ id: "global" });
  if (current) {
    await db.orm.aibot.AppSettings.where({ id: "global" }).update(values);
  } else {
    await db.orm.aibot.AppSettings.create({ id: "global", ...values });
  }
}
