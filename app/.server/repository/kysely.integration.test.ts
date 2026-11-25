import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getResourceRole } from "./authorization";
import { getExceededRateLimit } from "./rate-limits";
import { kysely } from "./kysely";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const createdOrganizationIds: string[] = [];

afterAll(async () => {
  for (const id of createdOrganizationIds)
    await kysely.deleteFrom("aibot.Organization").where("id", "=", id).execute();
  if (enabled) await kysely.destroy();
});

describe.skipIf(!enabled)("Kysely PostgreSQL integration", () => {
  it("enforces organization scoped grants and rolls back failed transactions", async () => {
    const organizationId = randomUUID();
    const foreignOrganizationId = randomUUID();
    createdOrganizationIds.push(organizationId, foreignOrganizationId);
    const userId = randomUUID();
    const groupId = randomUUID();
    const resourceId = randomUUID();
    const foreignUserId = randomUUID();
    const foreignResourceId = randomUUID();

    for (const [id, name] of [[organizationId, "Kysely test"], [foreignOrganizationId, "Kysely foreign test"]])
      await kysely.insertInto("aibot.Organization").values({ id, name, updatedAt: new Date() }).execute();
    for (const [id, orgId] of [[userId, organizationId], [groupId, organizationId], [foreignUserId, foreignOrganizationId]])
      await kysely.insertInto("aibot.PrincipalBase").values({ id, organizationId: orgId }).execute();
    for (const [id, orgId] of [[resourceId, organizationId], [foreignResourceId, foreignOrganizationId]])
      await kysely.insertInto("aibot.ResourceBase").values({ id, organizationId: orgId }).execute();
    await kysely.insertInto("aibot.User").values({
      id: userId,
      organizationId,
      email: `${userId}@example.test`,
      name: "Kysely test",
      passwordHash: "test-only",
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.User").values({
      id: foreignUserId,
      organizationId: foreignOrganizationId,
      email: `${foreignUserId}@example.test`,
      name: "Kysely foreign test",
      passwordHash: "test-only",
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.Group").values({
      id: groupId,
      organizationId,
      name: "Kysely test group",
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.Membership").values({
      userId,
      groupId,
      organizationId,
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.Grant").values([
      { organizationId, principalId: userId, resourceId, role: "viewer", grantedById: userId, updatedAt: new Date() },
      { organizationId, principalId: groupId, resourceId, role: "editor", grantedById: userId, updatedAt: new Date() },
      { organizationId: foreignOrganizationId, principalId: foreignUserId, resourceId: foreignResourceId, role: "manager", grantedById: foreignUserId, updatedAt: new Date() },
    ]).execute();

    await expect(getResourceRole(userId, organizationId, resourceId, false)).resolves.toBe("editor");
    await expect(getResourceRole(userId, organizationId, foreignResourceId, false)).resolves.toBeNull();

    const botId = randomUUID();
    const rateLimitId = randomUUID();
    await kysely.insertInto("aibot.ResourceBase").values([
      { id: botId, organizationId },
      { id: rateLimitId, organizationId },
    ]).execute();
    await kysely.insertInto("aibot.ChatBot").values({
      id: botId,
      organizationId,
      name: "Kysely rate test",
      instruction: "test",
      lookbackMessages: 1,
      onFailedMessage: "test",
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.RateLimit").values({
      id: rateLimitId,
      organizationId,
      name: "Kysely rate test",
      criteria: "bot",
      criteriaId: botId,
      perThread: true,
      coefficient: { inputTokens: 1 },
      limit: "5",
      limitExceededMessage: "limited",
      resetOnCron: "* * * * *",
      timezone: "UTC",
      updatedAt: new Date(),
    }).execute();
    await kysely.insertInto("aibot.AgentUsage").values({
      chatbotId: botId,
      organizationId,
      inputDetails: {},
      inputTokens: 6,
      outputDetails: {},
      outputTokens: 0,
      platform: "test",
      threadId: "thread",
      toolHistory: [],
      updatedAt: new Date(),
    }).execute();
    await expect(getExceededRateLimit(organizationId, botId, randomUUID(), randomUUID(), "thread"))
      .resolves.toBe("limited");

    const rolledBackId = randomUUID();
    await expect(kysely.transaction().execute(async (tx) => {
      await tx.insertInto("aibot.Organization").values({
        id: rolledBackId,
        name: "Must roll back",
        updatedAt: new Date(),
      }).execute();
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");
    await expect(kysely.selectFrom("aibot.Organization").select("id")
      .where("id", "=", rolledBackId).executeTakeFirst()).resolves.toBeUndefined();
  });
});
