import { beforeEach, describe, expect, it, vi } from "vitest";

const { existingLimits, create, update } = vi.hoisted(() => ({
  existingLimits: [] as Array<Record<string, unknown>>,
  create: vi.fn(async (row) => row),
  update: vi.fn(async (_values?: unknown, _conditions?: unknown) => undefined),
}));

vi.mock("./kysely", async () => {
  const { createTestKysely } = await import("./test-kysely");
  return {
    kysely: createTestKysely(
      (table, conditions) => {
        if (table === "aibot.RateLimit")
          return existingLimits.filter((row) => conditions.every(({ column, operator, value }) =>
            operator !== "=" || row[column] === value,
          ));
        if (table === "aibot.ChatBot") return [{ id: "bot" }];
        return [];
      },
      (table, values, conditions, returning) => {
        if (table === "aibot.RateLimit" && returning) return create(values);
        if (table === "aibot.RateLimit") return update(values, conditions);
        return undefined;
      },
      false,
    ),
  };
});
vi.mock("../authorization", () => ({ hasResourceAccess: async () => true }));
vi.mock("../logger/audit-logger", () => ({ logAuditEvent: vi.fn() }));

import { saveRateLimit } from "./rate-limits";
import type { AuthUser } from "../auth";

const user = { id: "user", organizationId: "org" } as AuthUser;
const targetId = "11111111-1111-4111-8111-111111111111";

function form(resetOnCron: string) {
  const values = new FormData();
  for (const [key, value] of Object.entries({
    name: "New limit",
    criteria: "bot",
    criteriaId: targetId,
    perThread: "false",
    limit: "100",
    resetOnCron,
    timezone: "UTC",
    limitExceededMessage: "Limited",
    coefficients: JSON.stringify({ inputTokens: 1 }),
  }))
    values.set(key, value);
  return values;
}

beforeEach(() => {
  existingLimits.length = 0;
  existingLimits.push({
    id: "existing",
    organizationId: "org",
    name: "Existing",
    criteria: "bot",
    criteriaId: targetId,
    resetOnCron: "0 0 * * *",
  });
  vi.clearAllMocks();
});

describe("saving rate limits", () => {
  it("allows the same target with a different reset schedule", async () => {
    expect(await saveRateLimit(user, null, form("0 0 * * 1"))).toEqual({
      ok: true,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects the same target and reset schedule", async () => {
    expect(await saveRateLimit(user, null, form("0 0 * * *"))).toEqual({
      error: "server.duplicateRateLimitTarget",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("permits updating an existing limit without changing its schedule", async () => {
    expect(await saveRateLimit(user, "existing", form("0 0 * * *"))).toEqual({
      ok: true,
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects updates that conflict with another limit's schedule", async () => {
    existingLimits.push({
      id: "other",
      organizationId: "org",
      name: "Other",
      criteria: "bot",
      criteriaId: targetId,
      resetOnCron: "0 0 * * 1",
    });
    expect(await saveRateLimit(user, "existing", form("0 0 * * 1"))).toEqual({
      error: "server.duplicateRateLimitTarget",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
