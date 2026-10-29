import { AsyncLocalStorage } from "node:async_hooks";
import { createContext } from "react-router";
import winston from "winston";

export type RequestContext = {
  requestId: string;
  clientIp: string | null;
  userId: number | null;
};

export const requestContext = createContext<RequestContext>();

export const requestStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext() {
  return requestStorage.getStore();
}

export const requestContextFormat = winston.format((info) => {
  const context = getRequestContext();

  if (context) {
    info.requestId = context.requestId;
    info.clientIp = context.clientIp;
    info.userId = context.userId;
  }

  return info;
});
