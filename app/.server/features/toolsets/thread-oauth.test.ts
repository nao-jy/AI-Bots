import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => "secret-launch-value"),
  get: vi.fn(async () => null),
  remove: vi.fn(async () => true),
}));
vi.mock("../oauth", () => ({
  getCallbackUrl: () => new URL("https://app.example/oauth/callback"),
}));
vi.mock("../thread-oauth-flow", () => ({
  createThreadOAuthLaunch: mocks.create,
}));
vi.mock("../../repository/thread-oauth", () => ({
  getThreadOAuthAuthentication: mocks.get,
  deleteThreadOAuthAuthentication: mocks.remove,
}));
vi.mock("../../repository/oauth", () => ({ getAccessToken: vi.fn() }));
vi.mock("../../i18n", () => ({
  t: (_key: string, values: Record<string, string>) =>
    `${values[0]} ${values[1]}`,
}));

import { getThreadOAuthTools } from "./thread-oauth";

describe("thread OAuth chat tools", () => {
  it("posts the launch URL to the thread without returning it to the model", async () => {
    const post = vi.fn();
    const tools = getThreadOAuthTools(
      { post } as never,
      {
        organizationId: "org",
        chatbotId: "bot",
        adapterId: "adapter",
        threadId: "thread",
      },
      new Map([["client", "Service"]]),
    );
    const result = await tools.startThreadOAuth.execute!(
      { oauthClientId: "client" },
      {} as never,
    );
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining("secret-launch-value"),
    );
    expect(JSON.stringify(result)).not.toContain("secret-launch-value");
  });
  it("rejects services not configured for the bot", async () => {
    const post = vi.fn();
    const tools = getThreadOAuthTools(
      { post } as never,
      {
        organizationId: "org",
        chatbotId: "bot",
        adapterId: "adapter",
        threadId: "thread",
      },
      new Map(),
    );
    const result = await tools.startThreadOAuth.execute!(
      { oauthClientId: "unknown" },
      {} as never,
    );
    expect(result).toHaveProperty("error");
    expect(post).not.toHaveBeenCalled();
  });
});
