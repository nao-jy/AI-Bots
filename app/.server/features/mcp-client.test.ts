import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), token: vi.fn() }));
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: mocks.create }));
vi.mock("../repository/oauth", () => ({ getAccessToken: mocks.token }));
import { getMcpClient } from "./mcp";

describe("MCP OAuth routing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({});
    mocks.token.mockResolvedValue({ accessToken: "upstream-secret" });
  });

  it("puts upstream tokens in call metadata without using the MCP Authorization header", async () => {
    await getMcpClient(
      "http",
      "https://example.test/mcp",
      {},
      "credential",
      {},
      true,
    );
    const transport = mocks.create.mock.calls[0][0].transport;
    expect(transport.headers.Authorization).toBeUndefined();
    expect(transport.fetch).toBeTypeOf("function");
  });

  it("keeps MCP server OAuth in the Authorization header", async () => {
    await getMcpClient(
      "http",
      "https://example.test/mcp",
      {},
      "credential",
      {},
      false,
    );
    const transport = mocks.create.mock.calls[0][0].transport;
    expect(transport.headers.Authorization).toBe("Bearer upstream-secret");
    expect(transport.fetch).toBeUndefined();
  });
});
