import { db } from "./repository/db";
import type { AuthUser } from "./auth";

export type Role = "viewer" | "editor" | "manager";
export type ResourceOperation = "read" | "update" | "delete" | "manageGrant";
type ResourceActor = Pick<AuthUser, "id" | "organizationId"> &
  Partial<Pick<AuthUser, "isAdmin">>;

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
  isAdmin?: boolean,
): Promise<Role | null> {
  const administrator =
    isAdmin ??
    (await db.orm.aibot.User.first({ id: userId, organizationId }))?.isAdmin ??
    false;
  if (administrator) return "manager";

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
  user: ResourceActor,
  resourceId: string,
  operation: ResourceOperation,
) {
  const role = await getResourceRole(
    user.id,
    user.organizationId,
    resourceId,
    user.isAdmin,
  );
  return (
    role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL[REQUIRED_ROLE[operation]]
  );
}

export async function includeResourcePermissions<T extends { id: string }>(
  user: ResourceActor,
  records: T[],
): Promise<
  (T & {
    canUpdate: string;
    canDelete: string;
    canManageGrants: string;
  })[]
> {
  return Promise.all(
    records.map(async (record) => {
      const role = await getResourceRole(
        user.id,
        user.organizationId,
        record.id,
        user.isAdmin,
      );
      const canUpdate = role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL.editor;
      const canDelete = role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL.manager;
      return {
        ...record,
        canUpdate: String(canUpdate),
        canDelete: String(canDelete),
        canManageGrants: String(canDelete),
      };
    }),
  );
}

export async function requireResourceAccess(
  user: ResourceActor,
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
  actor: ResourceActor,
  resourceId: string,
  principalId: string,
  role: Role | null,
) {
  await requireResourceAccess(actor, resourceId, "manageGrant");
  const [resourceExists, user, group] = await Promise.all([
    Promise.all([
      db.orm.aibot.ChatBot.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.ChatAdapter.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.Provider.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.AgentDefinition.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.RateLimit.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.McpServer.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.OAuthClient.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.OAuthAuthentication.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.Sandbox.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
      db.orm.aibot.ChatBotSchedule.first({
        id: resourceId,
        organizationId: actor.organizationId,
      }),
    ]),
    db.orm.aibot.User.first({
      id: principalId,
      organizationId: actor.organizationId,
    }),
    db.orm.aibot.Group.first({
      id: principalId,
      organizationId: actor.organizationId,
    }),
  ]);
  if (!resourceExists.some(Boolean))
    throw new Response("Resource not found", { status: 404 });
  if (!user && !group)
    throw new Response("Principal not found", { status: 404 });

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
  actor: ResourceActor,
  resourceId: string,
) {
  await requireResourceAccess(actor, resourceId, "manageGrant");
  const grants = await db.orm.aibot.Grant.where({
    organizationId: actor.organizationId,
    resourceId,
  }).all();
  const [users, groups] = await Promise.all([
    db.orm.aibot.User.where({ organizationId: actor.organizationId }).all(),
    db.orm.aibot.Group.where({ organizationId: actor.organizationId }).all(),
  ]);
  const principals = [
    ...users.map(({ id, name, email }) => ({
      id,
      type: "user" as const,
      name,
      email,
    })),
    ...groups.map(({ id, name }) => ({
      id,
      type: "group" as const,
      name,
      email: "",
    })),
  ];
  const principalsById = new Map(
    principals.map((principal) => [principal.id, principal]),
  );
  return {
    resourceId,
    principals,
    grants: grants.flatMap((grant) => {
      const principal = principalsById.get(grant.principalId);
      return principal
        ? [
            {
              principalId: grant.principalId,
              type: principal.type,
              name: principal.name,
              email: principal.email,
              role: grant.role as Role,
            },
          ]
        : [];
    }),
  };
}

/** Filters a list through the shared effective-role calculation. */
export async function filterResourcesByRole<
  T extends { id: string; organizationId: string },
>(
  user: ResourceActor,
  resources: T[],
  operation: ResourceOperation = "read",
): Promise<T[]> {
  const allowed = await Promise.all(
    resources.map(async (resource) => ({
      resource,
      allowed:
        resource.organizationId === user.organizationId &&
        (await hasResourceAccess(user, resource.id, operation)),
    })),
  );
  return allowed
    .filter(({ allowed }) => allowed)
    .map(({ resource }) => resource);
}

/** Returns readable resource IDs for a non-admin, or null for an administrator. */
export async function getReadableResourceIds(
  user: ResourceActor,
): Promise<string[] | null> {
  if (user.isAdmin) return null;
  const memberships = await db.orm.aibot.Membership.where({
    userId: user.id,
    organizationId: user.organizationId,
  })
    .select("groupId")
    .all();
  const principalIds = [
    user.id,
    ...memberships.map((membership) => membership.groupId),
  ];
  const grants = await db.orm.aibot.Grant.where({
    organizationId: user.organizationId,
  })
    .where((grant) => grant.principalId.in(principalIds))
    .select("resourceId", "role")
    .all();
  return [
    ...new Set(
      grants
        .filter((grant) => grant.role in ROLE_LEVEL)
        .map((grant) => grant.resourceId),
    ),
  ];
}
