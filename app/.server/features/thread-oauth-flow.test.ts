import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  existing: vi.fn(),
  save: vi.fn(),
  client: vi.fn(),
  grant: vi.fn(),
}));
vi.mock("../repository/thread-oauth", () => ({
  isThreadOAuthAllowed: mocks.allowed,
  getThreadOAuthAuthentication: mocks.existing,
  saveThreadOAuthAuthentication: mocks.save,
}));
vi.mock("../repository/oauth", () => ({ getOwnedOAuthClient: mocks.client }));
vi.mock("./oauth", () => ({
  configuration: () => ({}),
  getCallbackUrl: () => new URL("https://app.example/oauth/callback"),
}));
vi.mock("openid-client", () => ({
  randomState: () => "test-state",
  randomPKCECodeVerifier: () => "test-verifier",
  calculatePKCECodeChallenge: async () => "challenge",
  buildAuthorizationUrl: (_: unknown, params: Record<string, string>) => {
    const url = new URL("https://provider.example/authorize");
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url;
  },
  authorizationCodeGrant: mocks.grant,
}));

import {
  createThreadOAuthLaunch,
  isValidThreadOAuthLaunch,
  launchThreadOAuth,
  completeThreadOAuth,
} from "./thread-oauth-flow";

const scope = {
  organizationId: "org",
  oauthClientId: "client",
  chatbotId: "bot",
  adapterId: "adapter",
  threadId: "thread",
};

describe("thread OAuth browser flow", () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    mocks.allowed.mockReset().mockResolvedValue(true);
    mocks.existing.mockReset().mockResolvedValue(null);
    mocks.save.mockReset().mockResolvedValue("auth");
    mocks.client
      .mockReset()
      .mockResolvedValue({
        authorizationEndpoint: "https://provider.example/authorize",
        scopes: ["read"],
      });
    mocks.grant
      .mockReset()
      .mockResolvedValue({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
      });
  });
  it("starts from the app and binds the callback to an encrypted cookie", async () => {
    const launch = await createThreadOAuthLaunch(scope);
    expect(isValidThreadOAuthLaunch(launch)).toBe(true);
    expect(isValidThreadOAuthLaunch(`${launch}invalid`)).toBe(false);
    const response = await launchThreadOAuth(launch);
    expect(response.headers.get("location")).toContain("state=test-state");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("test-verifier");
    const wrong = new Request(
      "https://app.example/oauth/callback?state=wrong&code=abc",
      { headers: { Cookie: cookie } },
    );
    expect(await completeThreadOAuth(wrong)).toBeNull();
    const request = new Request(
      "https://app.example/oauth/callback?state=test-state&code=abc",
      { headers: { Cookie: cookie } },
    );
    const result = await completeThreadOAuth(request);
    expect(result?.headers.get("location")).toBe(
      "/oauth/complete?status=success",
    );
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0]).toEqual(scope);
    expect(mocks.save.mock.calls[0][1].accessToken).not.toBe("access");
    expect(mocks.save.mock.calls[0][2]).toBeNull();
  });
  it("refuses to start if the bot no longer allows the client", async () => {
    const launch = await createThreadOAuthLaunch(scope);
    mocks.allowed.mockResolvedValue(false);
    expect((await launchThreadOAuth(launch)).headers.get("location")).toBe(
      "/oauth/complete?status=error",
    );
  });
});
