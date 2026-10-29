import winston from "winston";
import * as Transport from "winston-transport";
import path from "path";
import { requestContextFormat } from "./request-context";

const env = process.env.NODE_ENV || "dev";
const logDir = process.env.LOG_DIR || "logs";

export enum LogLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Http = 3,
  Debug = 4,
}

const levels = {
  error: LogLevel.Error,
  warn: LogLevel.Warn,
  info: LogLevel.Info,
  http: LogLevel.Http,
  debug: LogLevel.Debug,
};

const level = () => {
  return env === "dev" ? "debug" : "info";
};

const transports: Transport[] = [
  new winston.transports.File({
    filename: path.join(logDir, "app-error.log"),
    level: "error",
    format: winston.format.json(),
  }),
  new winston.transports.File({
    filename: path.join(logDir, "app-all.log"),
    format: winston.format.json(),
  }),
];
if (env === "dev") {
  transports.push(new winston.transports.Console());
}

export const logger = winston.createLogger({
  level: level(),
  levels,
  format: winston.format.combine(
    requestContextFormat(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
  ),
  transports,
});
