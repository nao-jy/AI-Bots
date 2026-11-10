import { afterEach, describe, expect, it, vi } from "vitest";
import { getMcpContextSchema, validateMcpContext } from "./mcp-schema";

afterEach(() => vi.unstubAllGlobals());

describe("MCP context schema", () => {
  const schema = {
    type: "object" as const,
    properties: { apiKey: { type: "string" as const, minLength: 1 } },
    required: ["apiKey"],
    additionalProperties: false,
  };

  it("loads and validates required fields", async () => {
    const fetchMock = vi.fn(async () => Response.json(schema));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getMcpContextSchema(
      "https://example.test/context-schema",
      { Authorization: "Bearer secret" },
      "https://example.test/mcp",
    );
    expect(validateMcpContext(result, { apiKey: "key" })).toBe(true);
    expect(validateMcpContext(result, {})).toBe(false);
    expect(validateMcpContext(result, { apiKey: "key", extra: true })).toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
        redirect: "error",
      }),
    );
  });

  it("does not forward MCP credentials to a different schema origin", async () => {
    const fetchMock = vi.fn(async () => Response.json(schema));
    vi.stubGlobal("fetch", fetchMock);
    await getMcpContextSchema(
      "https://other.test/context-schema",
      { Authorization: "Bearer secret" },
      "https://example.test/mcp",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: {} }),
    );
  });

  it("rejects invalid and unsuccessful schemas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ type: "string" })),
    );
    await expect(
      getMcpContextSchema(
        "https://example.test/context-schema",
        {},
        "https://example.test/mcp",
      ),
    ).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    await expect(
      getMcpContextSchema(
        "https://example.test/context-schema",
        {},
        "https://example.test/mcp",
      ),
    ).rejects.toThrow();
  });
});
