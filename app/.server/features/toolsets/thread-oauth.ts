import { tool } from "ai";
import { z } from "zod";
import type { Thread } from "chat";
import { getCallbackUrl } from "../oauth";
import { createThreadOAuthLaunch } from "../thread-oauth-flow";
import { getAccessToken } from "../../repository/oauth";
import { t } from "../../i18n";
import {
  deleteThreadOAuthAuthentication,
  getThreadOAuthAuthentication,
  type ThreadOAuthScope,
} from "../../repository/thread-oauth";

export function getThreadOAuthTools(
  thread: Thread<Record<string, unknown>, unknown>,
  baseScope: Omit<ThreadOAuthScope, "oauthClientId">,
  clients: Map<string, string>,
) {
  const scope = (oauthClientId: string) => ({ ...baseScope, oauthClientId });
  return {
    listThreadOAuthConnections: tool({
      description:
        "List OAuth services configured for this bot and the invoking user's connection status.",
      inputSchema: z.object({}),
      execute: async () =>
        Promise.all(
          [...clients].map(async ([id, name]) => {
            const auth = await getThreadOAuthAuthentication(scope(id));
            if (!auth) return { id, name, status: "not_connected" };
            try {
              await getAccessToken(auth.id);
              return { id, name, status: "connected" };
            } catch {
              return { id, name, status: "reconnect_required" };
            }
          }),
        ),
    }),
    startThreadOAuth: tool({
      description:
        "Post a link for the invoking user to connect or reconnect a configured OAuth service. Only that user should complete it, then retry their request.",
      inputSchema: z.object({
        oauthClientId: z
          .string()
          .describe("ID returned by listThreadOAuthConnections"),
      }),
      execute: async ({ oauthClientId }) => {
        const name = clients.get(oauthClientId);
        if (!name)
          return {
            error: "This OAuth service is not configured for this bot.",
          };
        const url = new URL("/oauth/start", getCallbackUrl().origin);
        url.searchParams.set(
          "thread",
          await createThreadOAuthLaunch(scope(oauthClientId)),
        );
        await thread.post(
          t("server.threadOAuthLink", { 0: name, 1: url.href }),
        );
        return {
          success: true,
          messagePosted: true,
          service: name,
          next: "Ask the user to complete authorization and retry their request.",
        };
      },
    }),
    disconnectThreadOAuth: tool({
      description:
        "Disconnect the invoking user's OAuth service. Only use when the user has clearly requested disconnection; ask if ambiguous.",
      inputSchema: z.object({
        oauthClientId: z
          .string()
          .describe("ID returned by listThreadOAuthConnections"),
      }),
      execute: async ({ oauthClientId }) => {
        const name = clients.get(oauthClientId);
        if (!name)
          return {
            error: "This OAuth service is not configured for this bot.",
          };
        return {
          service: name,
          disconnected: await deleteThreadOAuthAuthentication(
            scope(oauthClientId),
          ),
        };
      },
    }),
  };
}
