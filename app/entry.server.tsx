import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import type { EntryContext } from "react-router";
import { appLogger } from "./.server/logger/app-logger";
import { startCronScheduler } from "./.server/features/scheduler";
import { I18nextProvider } from "react-i18next";
import { createRequestI18n, getLocaleFromCookie } from "./i18n";
import { localeStorage } from "./.server/request-context";
import "./.server/i18n";

export const streamTimeout = 5_000;

void startCronScheduler().catch((error: unknown) => {
  appLogger.error("Failed to load scheduled jobs during server startup", error);
});

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const locale = getLocaleFromCookie(request.headers.get("cookie"));
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }
  const requestI18n = await createRequestI18n(locale);

  const renderRequest = () =>
    new Promise<Response>((resolve, reject) => {
      let shellRendered = false;
      const userAgent = request.headers.get("user-agent");
      const readyEvent =
        (userAgent && isbot(userAgent)) || routerContext.isSpaMode
          ? "onAllReady"
          : "onShellReady";
      let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(
        () => abort(),
        streamTimeout + 1_000,
      );

      const { pipe, abort } = renderToPipeableStream(
        <I18nextProvider i18n={requestI18n}>
          <ServerRouter context={routerContext} url={request.url} />
        </I18nextProvider>,
        {
          [readyEvent]() {
            shellRendered = true;
            const body = new PassThrough({
              final(callback) {
                if (timeout) clearTimeout(timeout);
                timeout = undefined;
                callback();
              },
            });
            responseHeaders.set("Content-Type", "text/html");
            pipe(body);
            resolve(
              new Response(createReadableStreamFromReadable(body), {
                headers: responseHeaders,
                status: responseStatusCode,
              }),
            );
          },
          onShellError(error: unknown) {
            if (timeout) clearTimeout(timeout);
            reject(error);
          },
          onError(error: unknown) {
            responseStatusCode = 500;
            if (shellRendered)
              appLogger.error("Server rendering failed", error);
          },
        },
      );
    });
  return localeStorage.run(locale, renderRequest);
}
