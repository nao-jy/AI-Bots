import { beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";

const { revoke, logError } = vi.hoisted(() => ({
  revoke: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("openid-client", () => ({
  Configuration: class {},
  ClientSecretPost: vi.fn(),
  None: vi.fn(),
  tokenRevocation: revoke,
}));
vi.mock("../utils", () => ({ decryptCredential: (value: string) => value }));
vi.mock("../logger/app-logger", () => ({ appLogger: { error: logError } }));
import { processOAuthRevocation } from "./oauth-revocation";

const row = {
  id: "1",
  authenticationId: "auth",
  clientId: "client",
  clientSecret: "secret",
  revocationEndpoint: "https://example.com/revoke",
  accessToken: "access",
  refreshToken: "refresh",
};

function makePool(job = row) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith("SELECT") ? [job] : [],
  }));
  const release = vi.fn();
  return {
    pool: { connect: async () => ({ query, release }) } as unknown as pg.Pool,
    query,
    release,
  };
}

describe("OAuth revocation worker", () => {
  beforeEach(() => {
    revoke.mockReset();
    logError.mockReset();
    revoke.mockResolvedValue(undefined);
  });

  it("removes a job only after both tokens have been revoked", async () => {
    const { pool, query, release } = makePool();
    expect(await processOAuthRevocation(pool)).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(
      true,
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("retains and schedules the job for retry when a revocation fails", async () => {
    revoke.mockRejectedValueOnce(new Error("provider unavailable"));
    const { pool, query } = makePool();
    await processOAuthRevocation(pool);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
      true,
    );
    expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(
      false,
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(logError).toHaveBeenCalled();
  });
});
