import { createMCPClient } from "@ai-sdk/mcp";
import { getAccessToken } from "../repository/oauth";

export async function getMcpClient(
  transportType: "http",
  url: string,
  headers: Record<string, string>,
  authId: number | null,
) {
  const auth = authId !== null ? await getAccessToken(authId) : null;
  if (auth !== null) {
    headers["Authorization"] = `Bearer ${auth}`;
  }
  const client = await createMCPClient({
    transport: {
      type: transportType,
      url: url,
      headers: headers,
    },
  });
  return client;
}
