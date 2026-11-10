/** The schema advertises whether credentials target the upstream API. */
export function usesUpstreamOAuth(
  schema: Record<string, unknown> | null,
): boolean {
  return schema?.["x-bot-manager-oauth"] === "upstream";
}

export async function getMcpCredential(authId: string) {
  const { getAccessToken } = await import("../repository/oauth");
  return getAccessToken(authId);
}

/** Resolve credentials once per MCP connection and keep the two audiences separate. */
export async function resolveMcpCredentials(
  authId: string | null,
  headers: Record<string, string>,
  upstreamOAuth: boolean,
): Promise<{ headers: Record<string, string>; upstreamAccessToken?: string }> {
  const resolvedHeaders = { ...headers };
  if (authId === null) return { headers: resolvedHeaders };
  const auth = await getMcpCredential(authId);
  if (upstreamOAuth)
    return { headers: resolvedHeaders, upstreamAccessToken: auth.accessToken };
  resolvedHeaders.Authorization = `Bearer ${auth.accessToken}`;
  return { headers: resolvedHeaders };
}

/** The custom metadata format is kept here so delivery can be changed in one place. */
export function mcpCredentialMeta(
  context: Record<string, unknown>,
  accessToken?: string,
): Record<string, unknown> {
  return {
    "bot_manager/context": context,
    ...(accessToken ? { "bot_manager/oauth": { accessToken } } : {}),
  };
}
