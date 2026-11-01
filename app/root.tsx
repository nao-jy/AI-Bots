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

import type { Route } from "./+types/root";
import "@mantine/core/styles.css";
import "./app.css";

import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { logger } from "./.server/logger";
import { randomUUID } from "node:crypto";
import {
  requestContext,
  requestStorage,
  type RequestContext,
} from "./.server/request-context";
import { getSessionUser } from "./.server/auth";
import { startCronScheduler } from "./.server/scheduler";

export const links: Route.LinksFunction = () => [
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
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ColorSchemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider>{children}</MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isPending = navigation.state !== "idle";
  const [showPending, setShowPending] = useState(false);

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
    ? getNavigationLabel(destination)
    : navigation.formAction === "/logout"
      ? "ログアウト"
      : "処理";
  const pendingMessage = destination
    ? `${destinationLabel}を読み込んでいます`
    : destinationLabel === "ログアウト"
      ? "ログアウトしています"
      : "送信しています";

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

function getNavigationLabel(pathname: string) {
  if (pathname === "/") return "ダッシュボード";

  const labels: Record<string, string> = {
    "/bots": "チャットボット",
    "/adapters": "アダプタ",
    "/providers": "プロバイダ",
    "/oauth-clients": "OAuthクライアント",
    "/oauth-authentications": "OAuth認証情報",
    "/agents": "エージェント",
    "/mcp-servers": "MCPサーバー",
    "/schedules": "スケジュール",
    "/users": "ユーザー",
    "/login": "ログイン画面",
    "/logout": "ログアウト",
  };

  return labels[pathname] ?? "ページ";
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
    };
    context.set(requestContext, ctx);

    return requestStorage.run(ctx, async () => {
      logger.info("request.received", {
        method: request.method,
        path: new URL(request.url).pathname,
      });

      const response = await next();

      logger.info("request.completed", {
        method: request.method,
        statusCode: response.status,
      });

      return response;
    });
  },
];

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
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
