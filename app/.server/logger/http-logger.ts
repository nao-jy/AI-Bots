import winston from "winston";
import * as Transport from "winston-transport";
import path from "path";
import "winston-daily-rotate-file";
import { LOG_LEVELS, logDir, getCommonLogFormat } from "./common";
import { LEVEL } from "triple-beam";

const onlyHttp = winston.format((info) => {
  return info[LEVEL] === "http" ? info : false;
});

function getTransports() {
  const transports: Transport[] = [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, "http", "%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      format: winston.format.json(),
      utc: true,
    }),
  ];
  return transports;
}

export const httpLogger = winston.createLogger({
  level: "http",
  levels: LOG_LEVELS,
  format: winston.format.combine(getCommonLogFormat(), onlyHttp()),
  transports: getTransports(),
});
