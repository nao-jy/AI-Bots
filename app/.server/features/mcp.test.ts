import { describe, expect, it, vi } from "vitest";
import { contextFetch } from "./mcp-context";

describe("MCP context transport", () => {
  it("adds context to tool-call metadata without changing arguments or other requests", async () => {
    const send = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{}"),
    );
    const fetchWithContext = contextFetch(
      { apiKey: "secret" },
      "https://example.test/mcp",
      send as typeof fetch,
    );
    const original = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "search",
        arguments: { q: "term" },
        _meta: { progressToken: 7 },
      },
    };
    await fetchWithContext("https://example.test/mcp", {
      method: "POST",
      body: JSON.stringify(original),
    });
    const sent = JSON.parse(String(send.mock.calls[0]?.[1]?.body));
    expect(sent.params.arguments).toEqual({ q: "term" });
    expect(sent.params._meta).toEqual({
      progressToken: 7,
      "bot_manager/context": { apiKey: "secret" },
    });
    await fetchWithContext("https://example.test/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" }),
    });
    expect(JSON.parse(String(send.mock.calls[1]?.[1]?.body))).toEqual({
      method: "tools/list",
    });
    await fetchWithContext("https://other.test/mcp", {
      method: "POST",
      body: JSON.stringify(original),
    });
    expect(JSON.parse(String(send.mock.calls[2]?.[1]?.body))).toEqual(original);
  });
  it("sends upstream OAuth only in the tool-call metadata", async () => {
    const send = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{}"),
    );
    const request = contextFetch(
      {},
      "https://example.test/mcp",
      send as typeof fetch,
      "oauth-secret",
    );
    await request("https://example.test/mcp", {
      method: "POST",
      body: JSON.stringify({
        method: "tools/call",
        params: { name: "test", arguments: {} },
      }),
    });
    const body = JSON.parse(String(send.mock.calls[0]?.[1]?.body));
    expect(body.params._meta["bot_manager/oauth"]).toEqual({
      accessToken: "oauth-secret",
    });
    expect(body.params.arguments).toEqual({});
  });
});
