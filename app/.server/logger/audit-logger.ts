import winston from "winston";
import * as Transport from "winston-transport";
import path from "path";
import "winston-daily-rotate-file";
import { LOG_LEVELS, logEnv, logDir, getCommonLogFormat } from "./common";
import { getRequestContext } from "../request-context";

function getTransports() {
  const transports: Transport[] = [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "audit", "%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      format: winston.format.json(),
      utc: true,
    }),
  ];
  if (logEnv === "dev") {
    transports.push(new winston.transports.Console());
  }
  return transports;
}

export const auditLogger = winston.createLogger({
  level: "info",
  levels: LOG_LEVELS,
  format: getCommonLogFormat(),
  transports: getTransports(),
});

export function logAuditEvent(
  action: string,
  targetType: string,
  targetId: number | string | null,
  actorId?: number,
) {
  const context = getRequestContext();
  const effectiveActorId = actorId ?? context?.userId ?? null;
  auditLogger.info(action, {
    action,
    actorId: effectiveActorId,
    actorType:
      effectiveActorId !== null ? "user" : context ? "anonymous" : "system",
    targetType,
    targetId,
  });
}
