import { AsyncLocalStorage } from "node:async_hooks";
import { createContext } from "react-router";
import winston from "winston";
import type { Locale } from "../i18n";

export type RequestContext = {
  requestId: string;
  clientIp: string | null;
  userId: number | null;
  locale: Locale;
};

export const requestContext = createContext<RequestContext>();

export const requestStorage = new AsyncLocalStorage<RequestContext>();
export const localeStorage = new AsyncLocalStorage<Locale>();

export function getRequestLocale() {
  return localeStorage.getStore();
}

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
