import { createMCPClient } from "@ai-sdk/mcp";
import { resolveMcpCredentials } from "./mcp-credentials";

import { contextFetch } from "./mcp-context";

export async function getMcpClient(
  transportType: "http",
  url: string,
  headers: Record<string, string>,
  authId: string | null,
  context: Record<string, unknown> = {},
  upstreamOAuth = false,
) {
  const credentials = await resolveMcpCredentials(
    authId,
    headers,
    upstreamOAuth,
  );
  const client = await createMCPClient({
    transport: {
      type: transportType,
      url: url,
      headers: credentials.headers,
      ...(Object.keys(context).length || credentials.upstreamAccessToken
        ? {
            fetch: contextFetch(
              context,
              new URL(url).href,
              fetch,
              credentials.upstreamAccessToken,
            ),
          }
        : {}),
    },
  });
  return client;
}
