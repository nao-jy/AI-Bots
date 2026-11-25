import { afterEach, describe, expect, it, vi } from "vitest";

const { limits, usages } = vi.hoisted(() => ({
  limits: [] as any[],
  usages: [] as any[],
}));

vi.mock("./kysely", async () => {
  const { createTestKysely } = await import("./test-kysely");
  return {
    kysely: createTestKysely((table) =>
      table === "aibot.RateLimit" ? limits : table === "aibot.AgentUsage" ? usages : [],
    ),
  };
});
vi.mock("../logger/audit-logger", () => ({ logAuditEvent: vi.fn() }));

import { getExceededRateLimit } from "./rate-limits";

afterEach(() => {
  limits.length = 0;
  usages.length = 0;
  vi.useRealTimers();
});

describe("rate limit usage", () => {
  it.each([
    ["bot", "chatbotId", "bot-id"],
    ["agent", "agentId", "agent-id"],
    ["provider", "providerId", "provider-id"],
  ])(
    "counts only current-period usage for %s, including the reset boundary",
    async (criteria, field, id) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
      limits.push({
        id: "limit",
        organizationId: "org",
        criteria,
        criteriaId: id,
        perThread: true,
        resetOnCron: "0 0 * * *",
        timezone: "UTC",
        coefficient: { inputTokens: 1, "outputDetails.reasoningTokens": 2 },
        limit: "10",
        limitExceededMessage: "limited",
      });
      const row = {
        [field]: id,
        threadId: "thread",
        inputTokens: 2,
        outputTokens: 0,
        inputDetails: {},
        outputDetails: { reasoningTokens: 1 },
      };
      usages.push(
        { ...row, createdAt: "2026-11-10T23:59:59.999Z", inputTokens: 100 },
        { ...row, createdAt: "2026-11-11T00:00:00.000Z" },
        {
          ...row,
          createdAt: "2026-11-11T01:00:00.000Z",
          threadId: "other",
          inputTokens: 100,
        },
      );
      const check = () =>
        getExceededRateLimit(
          "org",
          "bot-id",
          "agent-id",
          "provider-id",
          "thread",
        );
      expect(await check()).toBeNull();
      usages.push({
        ...row,
        createdAt: "2026-11-11T02:00:00.000Z",
        inputTokens: 4,
      });
      expect(await check()).toBe("limited");
    },
  );
});
