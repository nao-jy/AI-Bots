import winston from "winston";
import { requestContextFormat } from "../request-context";

export const logEnv = process.env.NODE_ENV || "dev";
export const logDir = process.env.LOG_DIR || "logs";

export enum LogLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Http = 3,
  Debug = 4,
}
export const LOG_LEVELS = {
  error: LogLevel.Error,
  warn: LogLevel.Warn,
  info: LogLevel.Info,
  http: LogLevel.Http,
  debug: LogLevel.Debug,
};

export function getCommonLogFormat() {
  return winston.format.combine(
    requestContextFormat(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
  );
}
