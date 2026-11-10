import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema } from "@rjsf/utils";

export async function getMcpContextSchema(
  endpoint: string,
  headers: Record<string, string>,
  mcpEndpoint: string,
): Promise<RJSFSchema> {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid context schema URL");
  // Credentials configured for the MCP endpoint must never be forwarded to another origin.
  const sameOrigin = new URL(mcpEndpoint).origin === url.origin;
  const response = await fetch(url, {
    headers: sameOrigin ? headers : {},
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Could not load MCP context schema");
  const schema: unknown = await response.json();
  if (
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema) ||
    (schema as { type?: unknown }).type !== "object"
  ) {
    throw new Error("Invalid MCP context schema");
  }
  return schema as RJSFSchema;
}

export function validateMcpContext(
  schema: RJSFSchema,
  context: Record<string, unknown>,
): boolean {
  return validator.isValid(schema, context, schema);
}
