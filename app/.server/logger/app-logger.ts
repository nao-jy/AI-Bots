import winston from "winston";
import * as Transport from "winston-transport";
import path from "path";
import "winston-daily-rotate-file";
import { LOG_LEVELS, logEnv, logDir, getCommonLogFormat } from "./common";

function getTransports() {
  const transports: Transport[] = [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "app", "%DATE%.log"),
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

function getErrorHandlerTransports(filename: string) {
  const transports: Transport[] = [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "app", filename),
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

export const appLogger = winston.createLogger({
  level: "info",
  levels: LOG_LEVELS,
  format: getCommonLogFormat(),
  transports: getTransports(),
  exceptionHandlers: getErrorHandlerTransports(
    "uncaught-exceptions-%DATE%.log",
  ),
  rejectionHandlers: getErrorHandlerTransports(
    "unhandled-rejections-%DATE%.log",
  ),
  exitOnError: false,
});
