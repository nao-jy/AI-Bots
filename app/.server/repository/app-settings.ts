import { db } from "./db";

const DEFAULT_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export async function getAppSettings() {
  const settings = await db.orm.aibot.AppSettings.first({ id: "global" });
  const sessionDurationSeconds = settings?.sessionDurationSeconds;
  return {
    mfaEnabled: settings?.mfaEnabled ?? false,
    sessionDurationSeconds:
      sessionDurationSeconds &&
      Number.isSafeInteger(sessionDurationSeconds) &&
      sessionDurationSeconds > 0
        ? sessionDurationSeconds
        : DEFAULT_SESSION_DURATION_SECONDS,
  };
}

export async function saveAppSettings(values: {
  mfaEnabled: boolean;
  sessionDurationSeconds: number;
}) {
  const current = await db.orm.aibot.AppSettings.first({ id: "global" });
  if (current) {
    await db.orm.aibot.AppSettings.where({ id: "global" }).update(values);
  } else {
    await db.orm.aibot.AppSettings.create({ id: "global", ...values });
  }
}
