import { kysely } from "./kysely";
import type { AuthUser } from "../auth";

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
    (await kysely
      .selectFrom("aibot.User")
      .select("isAdmin")
      .where("id", "=", userId)
      .where("organizationId", "=", organizationId)
      .executeTakeFirst())?.isAdmin ??
    false;
  if (administrator) return "manager";

  const [memberships, grants] = await Promise.all([
    kysely
      .selectFrom("aibot.Membership")
      .select(["groupId"])
      .where("userId", "=", userId)
      .where("organizationId", "=", organizationId)
      .execute(),
    kysely
      .selectFrom("aibot.Grant")
      .select(["principalId", "role"])
      .where("resourceId", "=", resourceId)
      .where("organizationId", "=", organizationId)
      .execute(),
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
  const now = new Date();
  await kysely
    .insertInto("aibot.Grant")
    .values({
      organizationId: actor.organizationId,
      principalId: actor.id,
      resourceId,
      role,
      grantedById: actor.id,
      updatedAt: now,
    })
    .execute();
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
      ...(["ChatBot", "ChatAdapter", "Provider", "AgentDefinition", "RateLimit", "McpServer", "OAuthClient", "OAuthAuthentication", "Sandbox", "ChatBotSchedule"] as const).map((table) =>
        kysely
          .selectFrom(`aibot.${table}`)
          .select("id")
          .where("id", "=", resourceId)
          .where("organizationId", "=", actor.organizationId)
          .executeTakeFirst(),
      ),
    ]),
    kysely
      .selectFrom("aibot.User")
      .select("id")
      .where("id", "=", principalId)
      .where("organizationId", "=", actor.organizationId)
      .executeTakeFirst(),
    kysely
      .selectFrom("aibot.Group")
      .select("id")
      .where("id", "=", principalId)
      .where("organizationId", "=", actor.organizationId)
      .executeTakeFirst(),
  ]);
  if (!resourceExists.some(Boolean))
    throw new Response("Resource not found", { status: 404 });
  if (!user && !group)
    throw new Response("Principal not found", { status: 404 });

  const existing = await kysely
    .selectFrom("aibot.Grant")
    .select(["id"])
    .where("organizationId", "=", actor.organizationId)
    .where("resourceId", "=", resourceId)
    .where("principalId", "=", principalId)
    .execute();
  if (role === null) {
    await kysely
      .deleteFrom("aibot.Grant")
      .where("organizationId", "=", actor.organizationId)
      .where("resourceId", "=", resourceId)
      .where("principalId", "=", principalId)
      .execute();
    return;
  }
  const [first, ...duplicates] = existing;
  if (first) {
    const now = new Date();
    await kysely
      .updateTable("aibot.Grant")
      .set({ role, grantedById: actor.id, updatedAt: now })
      .where("id", "=", first.id)
      .execute();
    if (duplicates.length)
      await kysely
        .deleteFrom("aibot.Grant")
        .where("id", "in", duplicates.map((grant) => grant.id))
        .execute();
  } else {
    await kysely
      .insertInto("aibot.Grant")
      .values({
        organizationId: actor.organizationId,
        resourceId,
        principalId,
        role,
        grantedById: actor.id,
        updatedAt: new Date(),
      })
      .execute();
  }
}

export async function listResourceGrants(
  actor: ResourceActor,
  resourceId: string,
) {
  await requireResourceAccess(actor, resourceId, "manageGrant");
  const grants = await kysely
    .selectFrom("aibot.Grant")
    .select(["principalId", "role"])
    .where("organizationId", "=", actor.organizationId)
    .where("resourceId", "=", resourceId)
    .execute();
  const [users, groups] = await Promise.all([
    kysely
      .selectFrom("aibot.User")
      .select(["id", "name", "email"])
      .where("organizationId", "=", actor.organizationId)
      .execute(),
    kysely
      .selectFrom("aibot.Group")
      .select(["id", "name"])
      .where("organizationId", "=", actor.organizationId)
      .execute(),
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
  const memberships = await kysely
    .selectFrom("aibot.Membership")
    .select("groupId")
    .where("userId", "=", user.id)
    .where("organizationId", "=", user.organizationId)
    .execute();
  const principalIds = [
    user.id,
    ...memberships.map((membership) => membership.groupId),
  ];
  const grants = await kysely
    .selectFrom("aibot.Grant")
    .select(["resourceId", "role"])
    .where("organizationId", "=", user.organizationId)
    .where("principalId", "in", principalIds)
    .execute();
  return [
    ...new Set(
      grants
        .filter((grant) => grant.role in ROLE_LEVEL)
        .map((grant) => grant.resourceId),
    ),
  ];
}
