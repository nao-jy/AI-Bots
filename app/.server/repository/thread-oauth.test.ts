import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bot: vi.fn(),
  adapter: vi.fn(),
  client: vi.fn(),
  mcp: vi.fn(),
}));
vi.mock("./db", () => ({
  db: {
    orm: {
      aibot: {
        ChatBot: { first: mocks.bot },
        ChatBotAdapter: { first: mocks.adapter },
        OAuthClient: { first: mocks.client },
        ChatBotMcpServer: { first: mocks.mcp },
      },
    },
  },
}));

import { isThreadOAuthAllowed } from "./thread-oauth";

const scope = {
  organizationId: "org",
  chatbotId: "bot",
  adapterId: "adapter",
  oauthClientId: "client",
  threadId: "thread",
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
});
