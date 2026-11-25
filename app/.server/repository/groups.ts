import type { AuthUser } from "../auth";
import { kysely } from "./kysely";
import { generateResourceId } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

function requireOrganizationAdmin(user: AuthUser) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
}

export async function listGroups(user: AuthUser, ids: string[]) {
  requireOrganizationAdmin(user);
  const [groups, memberships, users] = await Promise.all([
    kysely
      .selectFrom("aibot.Group")
      .selectAll()
      .where("organizationId", "=", user.organizationId)
      .where("id", "in", ids)
      .orderBy("name", "asc")
      .execute(),
    kysely
      .selectFrom("aibot.Membership")
      .select(["groupId", "userId"])
      .where("organizationId", "=", user.organizationId)
      .where("groupId", "in", ids)
      .execute(),
    kysely
      .selectFrom("aibot.User")
      .select(["id", "name", "email"])
      .where("organizationId", "=", user.organizationId)
      .execute(),
  ]);
  const usersById = new Map(users.map((member) => [member.id, member]));
  return groups.map((group) => ({
    ...group,
    members: memberships
      .filter((membership) => membership.groupId === group.id)
      .map((membership) => usersById.get(membership.userId))
      .filter(
        (member): member is (typeof users)[number] => member !== undefined,
      )
      .map(({ id, name, email }) => ({ id, name, email })),
  }));
}

export async function listGroupCandidates(user: AuthUser) {
  requireOrganizationAdmin(user);
  return (
    await kysely
      .selectFrom("aibot.User")
      .select(["id", "name", "email"])
      .where("organizationId", "=", user.organizationId)
      .orderBy("name", "asc")
      .execute()
  ).map(({ id, name, email }) => ({ id, name, email }));
}

export async function createGroup(user: AuthUser, nameValue: string) {
  requireOrganizationAdmin(user);
  const name = nameValue.trim();
  if (!name) return { error: "server.groupNameRequired" };
  if (
    await kysely
      .selectFrom("aibot.Group")
      .select("id")
      .where("organizationId", "=", user.organizationId)
      .where("name", "=", name)
      .executeTakeFirst()
  )
    return { error: "server.duplicateGroupName" };
  const group = await kysely.transaction().execute(async (tx) => {
    const id = generateResourceId();
    await tx
      .insertInto("aibot.PrincipalBase")
      .values({ id, organizationId: user.organizationId })
      .execute();
    return tx
      .insertInto("aibot.Group")
      .values({
        id,
        organizationId: user.organizationId,
        name,
        updatedAt: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  });
  logAuditEvent("group.created", "group", group.id, user.id);
  return { ok: true, id: group.id };
}

export async function setGroupMembership(
  user: AuthUser,
  groupId: string,
  memberId: string,
  isMember: boolean,
) {
  requireOrganizationAdmin(user);
  const [group, member] = await Promise.all([
    kysely
      .selectFrom("aibot.Group")
      .select("id")
      .where("id", "=", groupId)
      .where("organizationId", "=", user.organizationId)
      .executeTakeFirst(),
    kysely
      .selectFrom("aibot.User")
      .select("id")
      .where("id", "=", memberId)
      .where("organizationId", "=", user.organizationId)
      .executeTakeFirst(),
  ]);
  if (!group || !member) return { error: "server.groupOrUserNotFound" };
  await kysely.transaction().execute(async (tx) => {
    const memberships = await tx
      .selectFrom("aibot.Membership")
      .select("id")
      .where("organizationId", "=", user.organizationId)
      .where("groupId", "=", groupId)
      .where("userId", "=", memberId)
      .execute();
    if (isMember && memberships.length === 0) {
      await tx
        .insertInto("aibot.Membership")
        .values({
          organizationId: user.organizationId,
          groupId,
          userId: memberId,
          updatedAt: new Date(),
        })
        .execute();
    } else if (!isMember) {
      await tx
        .deleteFrom("aibot.Membership")
        .where("organizationId", "=", user.organizationId)
        .where("groupId", "=", groupId)
        .where("userId", "=", memberId)
        .execute();
    }
  });
  logAuditEvent(
    isMember ? "group.member_added" : "group.member_removed",
    "group",
    groupId,
    user.id,
  );
  return { ok: true };
}

export async function renameGroup(
  user: AuthUser,
  groupId: string,
  nameValue: string,
) {
  requireOrganizationAdmin(user);
  const name = nameValue.trim();
  if (!name) return { error: "server.groupNameRequired" };
  const group = await kysely
    .selectFrom("aibot.Group")
    .select("id")
    .where("id", "=", groupId)
    .where("organizationId", "=", user.organizationId)
    .executeTakeFirst();
  if (!group) return { error: "server.groupNotFound" };
  const duplicate = await kysely
    .selectFrom("aibot.Group")
    .select("id")
    .where("organizationId", "=", user.organizationId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (duplicate && duplicate.id !== groupId)
    return { error: "server.duplicateGroupName" };
  await kysely
    .updateTable("aibot.Group")
    .set({ name, updatedAt: new Date() })
    .where("id", "=", groupId)
    .where("organizationId", "=", user.organizationId)
    .execute();
  logAuditEvent("group.renamed", "group", groupId, user.id);
  return { ok: true };
}

export async function deleteGroup(user: AuthUser, groupId: string) {
  requireOrganizationAdmin(user);
  const group = await kysely
    .selectFrom("aibot.Group")
    .select("id")
    .where("id", "=", groupId)
    .where("organizationId", "=", user.organizationId)
    .executeTakeFirst();
  if (!group) return false;
  await kysely
    .deleteFrom("aibot.PrincipalBase")
    .where("id", "=", groupId)
    .execute();
  logAuditEvent("group.deleted", "group", groupId, user.id);
  return true;
}
