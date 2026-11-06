import { db } from "./repository/db";
import type { AuthUser } from "./auth";

export type Role = "viewer" | "editor" | "manager";
export type ResourceOperation = "read" | "update" | "delete" | "manageGrant";

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  manager: 3,
};

const REQUIRED_ROLE: Record<ResourceOperation, Role> = {
  read: "viewer",
  update: "editor",
  delete: "manager",
  manageGrant: "manager",
};

/** Returns the highest role from the user's direct grant or any group grant. */
export async function getResourceRole(
  userId: string,
  organizationId: string,
  resourceId: string,
): Promise<Role | null> {
  const [memberships, grants] = await Promise.all([
    db.orm.aibot.Membership.where({ userId, organizationId }).all(),
    db.orm.aibot.Grant.where({ resourceId, organizationId }).all(),
  ]);
  const principalIds = new Set([
    userId,
    ...memberships.map((membership) => membership.groupId),
  ]);
  let best: Role | null = null;
  for (const grant of grants) {
    if (!principalIds.has(grant.principalId)) continue;
    const role = grant.role as Role;
    if (!(role in ROLE_LEVEL)) continue;
    if (!best || ROLE_LEVEL[role] > ROLE_LEVEL[best]) best = role;
  }
  return best;
}

export async function hasResourceAccess(
  user: Pick<AuthUser, "id" | "organizationId">,
  resourceId: string,
  operation: ResourceOperation,
) {
  const role = await getResourceRole(user.id, user.organizationId, resourceId);
  return role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL[REQUIRED_ROLE[operation]];
}

export async function requireResourceAccess(
  user: Pick<AuthUser, "id" | "organizationId">,
  resourceId: string,
  operation: ResourceOperation,
) {
  if (!(await hasResourceAccess(user, resourceId, operation)))
    throw new Response("Forbidden", { status: 403 });
}

export async function grantResourceRole(
  actor: Pick<AuthUser, "id" | "organizationId">,
  resourceId: string,
  role: Role,
) {
  await db.orm.aibot.Grant.create({
    organizationId: actor.organizationId,
    principalId: actor.id,
    resourceId,
    role,
    grantedById: actor.id,
  });
}

export async function setResourceGrant(
  actor: Pick<AuthUser, "id" | "organizationId">,
  resourceId: string,
  principalId: string,
  role: Role | null,
) {
  await requireResourceAccess(actor, resourceId, "manageGrant");
  const [resourceExists, user, group] = await Promise.all([
    Promise.all([
      db.orm.aibot.ChatBot.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.ChatAdapter.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.Provider.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.AgentDefinition.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.RateLimit.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.McpServer.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.OAuthClient.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.OAuthAuthentication.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.Sandbox.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.ChatBotToolSetContext.first({ id: resourceId, organizationId: actor.organizationId }),
      db.orm.aibot.ChatBotSchedule.first({ id: resourceId, organizationId: actor.organizationId }),
    ]),
    db.orm.aibot.User.first({ id: principalId, organizationId: actor.organizationId }),
    db.orm.aibot.Group.first({ id: principalId, organizationId: actor.organizationId }),
  ]);
  if (!resourceExists.some(Boolean)) throw new Response("Resource not found", { status: 404 });
  if (!user && !group) throw new Response("Principal not found", { status: 404 });

  const existing = await db.orm.aibot.Grant.where({
    organizationId: actor.organizationId,
    resourceId,
    principalId,
  }).all();
  if (role === null) {
    for (const grant of existing)
      await db.orm.aibot.Grant.where({ id: grant.id }).delete();
    return;
  }
  const [first, ...duplicates] = existing;
  if (first) {
    await db.orm.aibot.Grant.where({ id: first.id }).update({
      role,
      grantedById: actor.id,
    });
    for (const grant of duplicates)
      await db.orm.aibot.Grant.where({ id: grant.id }).delete();
  } else {
    await db.orm.aibot.Grant.create({
      organizationId: actor.organizationId,
      resourceId,
      principalId,
      role,
      grantedById: actor.id,
    });
  }
}

export async function listResourceGrants(
  actor: Pick<AuthUser, "id" | "organizationId">,
  resourceId: string,
) {
  await requireResourceAccess(actor, resourceId, "manageGrant");
  const grants = await db.orm.aibot.Grant.where({
    organizationId: actor.organizationId,
    resourceId,
  }).all();
  const principalIds = [...new Set(grants.map((grant) => grant.principalId))];
  const [users, groups] = await Promise.all([
    db.orm.aibot.User.where({ organizationId: actor.organizationId }).all(),
    db.orm.aibot.Group.where({ organizationId: actor.organizationId }).all(),
  ]);
  const principalNames = new Map<string, { type: "user" | "group"; name: string; email?: string }>();
  for (const user of users)
    if (principalIds.includes(user.id))
      principalNames.set(user.id, { type: "user", name: user.name, email: user.email });
  for (const group of groups)
    if (principalIds.includes(group.id))
      principalNames.set(group.id, { type: "group", name: group.name });
  return grants.flatMap((grant) => {
    const principal = principalNames.get(grant.principalId);
    return principal ? [{ id: grant.id, principalId: grant.principalId, ...principal, role: grant.role as Role }] : [];
  });
}

/** Filters a list through the shared effective-role calculation. */
export async function filterResourcesByRole<T extends { id: string; organizationId: string }>(
  user: Pick<AuthUser, "id" | "organizationId">,
  resources: T[],
  operation: ResourceOperation = "read",
): Promise<T[]> {
  const allowed = await Promise.all(
    resources.map(async (resource) => ({
      resource,
      allowed: resource.organizationId === user.organizationId &&
        await hasResourceAccess(user, resource.id, operation),
    })),
  );
  return allowed.filter(({ allowed }) => allowed).map(({ resource }) => resource);
}

