import { useEffect, useState } from "react";
import {
  createContext,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/root";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app.css";

import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { httpLogger } from "./.server/logger/http-logger";
import { randomUUID } from "node:crypto";
import {
  requestContext,
  localeStorage,
  requestStorage,
  type RequestContext,
} from "./.server/request-context";
import { getSessionUser } from "./.server/auth";
import { startCronScheduler } from "./.server/features/scheduler";
import { type NavigationLabelKey, getLocaleFromCookie } from "./i18n";

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/favicon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <html lang={locale.startsWith("en") ? "en" : "ja"} {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ColorSchemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider>
          <Notifications />
          {children}
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const isPending = navigation.state !== "idle";
  const [showPending, setShowPending] = useState(false);

  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("en") ? "en" : "ja";
  }, [i18n.language]);

  useEffect(() => {
    if (!isPending) {
      setShowPending(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowPending(true), 120);
    return () => window.clearTimeout(timeout);
  }, [isPending]);

  const destination = navigation.location?.pathname;
  const destinationLabel = destination
    ? t(getNavigationLabel(destination))
    : navigation.formAction === "/logout"
      ? t("navigation.logout")
      : t("loading.processing");
  const pendingMessage = destination
    ? t("loading.destination", { label: destinationLabel })
    : navigation.formAction === "/logout"
      ? t("loading.logout")
      : t("loading.submitting");

  return (
    <>
      <Outlet />
      {showPending && (
        <div className="navigation-loading-backdrop" aria-busy="true">
          <div className="navigation-loading" role="status" aria-live="polite">
            <span className="navigation-loading-spinner" aria-hidden="true" />
            <span>{pendingMessage}</span>
          </div>
        </div>
      )}
    </>
  );
}

function getNavigationLabel(pathname: string): NavigationLabelKey {
  if (pathname === "/") return "navigation.dashboard";

  const labels: Record<string, NavigationLabelKey> = {
    "/bots": "navigation.chatbots",
    "/adapters": "navigation.adapters",
    "/providers": "navigation.providers",
    "/oauth-clients": "navigation.oauthClients",
    "/oauth-authentications": "navigation.oauthAuthentications",
    "/agents": "navigation.agents",
    "/mcp-servers": "navigation.mcpServers",
    "/schedules": "navigation.schedules",
    "/users": "navigation.users",
    "/login": "navigation.login",
    "/logout": "navigation.logout",
  };

  return labels[pathname] ?? "navigation.page";
}

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    await startCronScheduler();
    const requestId = randomUUID();
    const user = await getSessionUser(request);
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const ctx: RequestContext = {
      requestId,
      clientIp: clientIp,
      userId: user?.id ?? null,
      locale: getLocaleFromCookie(request.headers.get("cookie")),
    };
    context.set(requestContext, ctx);

    return localeStorage.run(ctx.locale, () =>
      requestStorage.run(ctx, async () => {
        httpLogger.http("request.received", {
          method: request.method,
          path: new URL(request.url).pathname,
        });

        const response = await next();

        httpLogger.http("request.completed", {
          method: request.method,
          statusCode: response.status,
        });

        return response;
      }),
    );
  },
];

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  let message = t("errors.fallbackTitle");
  let details = t("errors.unexpected");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404
        ? t("errors.notFoundCode")
        : t("errors.title");
    details =
      error.status === 404
        ? t("errors.pageNotFound")
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
