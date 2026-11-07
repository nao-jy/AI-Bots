import type { AuthUser } from "../auth";
import { db } from "./db";
import { generateResourceId } from "../utils";
import { logAuditEvent } from "../logger/audit-logger";

function requireOrganizationAdmin(user: AuthUser) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
}

export async function listGroups(user: AuthUser, ids: string[]) {
  requireOrganizationAdmin(user);
  const [groups, memberships, users] = await Promise.all([
    db.orm.aibot.Group.where({ organizationId: user.organizationId })
      .where((group) => group.id.in(ids))
      .orderBy((group) => group.name.asc())
      .all(),
    db.orm.aibot.Membership.where({ organizationId: user.organizationId }).where((membership) => membership.groupId.in(ids)).all(),
    db.orm.aibot.User.where({ organizationId: user.organizationId }).all(),
  ]);
  const usersById = new Map(users.map((member) => [member.id, member]));
  return groups.map((group) => ({
    ...group,
    members: memberships
      .filter((membership) => membership.groupId === group.id)
      .map((membership) => usersById.get(membership.userId))
      .filter((member): member is (typeof users)[number] => member !== undefined)
      .map(({ id, name, email }) => ({ id, name, email })),
  }));
}

export async function listGroupCandidates(user: AuthUser) {
  requireOrganizationAdmin(user);
  return (await db.orm.aibot.User.where({ organizationId: user.organizationId })
    .orderBy((member) => member.name.asc())
    .all())
    .map(({ id, name, email }) => ({ id, name, email }));
}

export async function createGroup(user: AuthUser, nameValue: string) {
  requireOrganizationAdmin(user);
  const name = nameValue.trim();
  if (!name) return { error: "server.groupNameRequired" };
  if (await db.orm.aibot.Group.first({ organizationId: user.organizationId, name }))
    return { error: "server.duplicateGroupName" };
  const group = await db.transaction(async (tx) => {
    const id = generateResourceId();
    await tx.orm.aibot.PrincipalBase.create({ id, organizationId: user.organizationId });
    return tx.orm.aibot.Group.create({
      id,
      organizationId: user.organizationId,
      name,
    });
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
    db.orm.aibot.Group.first({ id: groupId, organizationId: user.organizationId }),
    db.orm.aibot.User.first({ id: memberId, organizationId: user.organizationId }),
  ]);
  if (!group || !member) return { error: "server.groupOrUserNotFound" };
  const memberships = await db.orm.aibot.Membership.where({
    organizationId: user.organizationId,
    groupId,
    userId: memberId,
  }).all();
  if (isMember && memberships.length === 0) {
    await db.orm.aibot.Membership.create({
      organizationId: user.organizationId,
      groupId,
      userId: memberId,
    });
  } else if (!isMember) {
    for (const membership of memberships)
      await db.orm.aibot.Membership.where({ id: membership.id }).delete();
  }
  logAuditEvent(isMember ? "group.member_added" : "group.member_removed", "group", groupId, user.id);
  return { ok: true };
}

export async function renameGroup(user: AuthUser, groupId: string, nameValue: string) {
  requireOrganizationAdmin(user);
  const name = nameValue.trim();
  if (!name) return { error: "server.groupNameRequired" };
  const group = await db.orm.aibot.Group.first({ id: groupId, organizationId: user.organizationId });
  if (!group) return { error: "server.groupNotFound" };
  const duplicate = await db.orm.aibot.Group.first({ organizationId: user.organizationId, name });
  if (duplicate && duplicate.id !== groupId) return { error: "server.duplicateGroupName" };
  await db.orm.aibot.Group.where({ id: groupId, organizationId: user.organizationId }).update({ name });
  logAuditEvent("group.renamed", "group", groupId, user.id);
  return { ok: true };
}

export async function deleteGroup(user: AuthUser, groupId: string) {
  requireOrganizationAdmin(user);
  const group = await db.orm.aibot.Group.first({ id: groupId, organizationId: user.organizationId });
  if (!group) return false;
  await db.orm.aibot.PrincipalBase.where({ id: groupId }).delete();
  logAuditEvent("group.deleted", "group", groupId, user.id);
  return true;
}
