import winston from "winston";
import * as Transport from "winston-transport";
import path from "path";
import "winston-daily-rotate-file";
import { LOG_LEVELS, logDir, getCommonLogFormat } from "./common";

function getTransports() {
  const transports: Transport[] = [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "conversation", "%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      format: winston.format.json(),
      utc: true,
    }),
  ];
  return transports;
}

export const conversationLogger = winston.createLogger({
  level: "info",
  levels: LOG_LEVELS,
  format: getCommonLogFormat(),
  transports: getTransports(),
});
