import { createMCPClient } from "@ai-sdk/mcp";
import { getAccessToken } from "../repository/oauth";

import { contextFetch } from "./mcp-context";

export async function getMcpClient(
  transportType: "http",
  url: string,
  headers: Record<string, string>,
  authId: string | null,
  context: Record<string, unknown> = {},
) {
  const auth = authId !== null ? await getAccessToken(authId) : null;
  if (auth !== null) {
    headers["Authorization"] = `Bearer ${auth.accessToken}`;
  }
  const client = await createMCPClient({
    transport: {
      type: transportType,
      url: url,
      headers: headers,
      ...(Object.keys(context).length
        ? { fetch: contextFetch(context, new URL(url).href) }
        : {}),
    },
  });
  return client;
}
