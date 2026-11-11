import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bot: vi.fn(),
  adapter: vi.fn(),
  client: vi.fn(),
  mcp: vi.fn(),
  connection: vi.fn(),
  authentication: vi.fn(),
}));
vi.mock("./db", () => ({
  db: {
    orm: {
      aibot: {
        ChatBot: { first: mocks.bot },
        ChatBotAdapter: { first: mocks.adapter },
        OAuthClient: { first: mocks.client },
        ChatBotMcpServer: { first: mocks.mcp },
        ThreadOAuthConnection: { first: mocks.connection },
        OAuthAuthentication: { first: mocks.authentication },
      },
    },
  },
}));

import { getThreadOAuthAuthentication, isThreadOAuthAllowed } from "./thread-oauth";

const scope = {
  organizationId: "org",
  chatbotId: "bot",
  adapterId: "adapter",
  oauthClientId: "client",
  authorId: "author",
};

describe("thread OAuth authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const mock of Object.values(mocks))
      mock.mockResolvedValue({ id: "ok" });
  });

  it("requires the OAuth client to be attached to the current bot and organization", async () => {
    expect(await isThreadOAuthAllowed(scope)).toBe(true);
    expect(mocks.mcp).toHaveBeenCalledWith({
      organizationId: "org",
      chatbotId: "bot",
      oauthClientId: "client",
    });
    expect(mocks.bot).toHaveBeenCalledWith({
      id: "bot",
      organizationId: "org",
      isEnabled: true,
    });
    mocks.mcp.mockResolvedValue(null);
    expect(await isThreadOAuthAllowed(scope)).toBe(false);
  });

  it("resolves credentials using the invoking author and never falls back to a thread connection", async () => {
    mocks.connection.mockResolvedValueOnce({ authenticationId: "auth-a" }).mockResolvedValueOnce(null);
    mocks.authentication.mockResolvedValue({ id: "auth-a" });
    expect(await getThreadOAuthAuthentication(scope)).toEqual({ id: "auth-a" });
    expect(await getThreadOAuthAuthentication({ ...scope, authorId: "other" })).toBeNull();
    expect(mocks.connection).toHaveBeenNthCalledWith(1, scope);
    expect(mocks.connection).toHaveBeenNthCalledWith(2, { ...scope, authorId: "other" });
    expect(mocks.authentication).toHaveBeenCalledOnce();
  });
});
