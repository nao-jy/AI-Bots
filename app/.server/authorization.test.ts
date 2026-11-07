import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFirst: vi.fn(),
  memberships: vi.fn(),
  grants: vi.fn(),
}));
vi.mock("./repository/db", () => ({
  db: {
    orm: {
      aibot: {
        User: { first: mocks.userFirst },
        Membership: {
          where: (query: unknown) => ({ all: () => mocks.memberships(query) }),
        },
        Grant: {
          where: (query: unknown) => ({ all: () => mocks.grants(query) }),
        },
      },
    },
  },
}));

import {
  filterResourcesByRole,
  getResourceRole,
  hasResourceAccess,
  includeResourcePermissions,
  requireResourceAccess,
} from "./authorization";

const user = { id: "user-1", organizationId: "org-1", isAdmin: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userFirst.mockResolvedValue(null);
  mocks.memberships.mockResolvedValue([]);
  mocks.grants.mockResolvedValue([]);
});

describe("resource authorization", () => {
  it("selects the highest direct or group role and ignores unrelated and unknown grants", async () => {
    mocks.memberships.mockResolvedValue([{ groupId: "group-1" }]);
    mocks.grants.mockResolvedValue([
      { principalId: "user-1", role: "viewer" },
      { principalId: "group-1", role: "editor" },
      { principalId: "other", role: "manager" },
      { principalId: "user-1", role: "invalid" },
    ]);
    expect(
      await getResourceRole(user.id, user.organizationId, "resource", false),
    ).toBe("editor");
    expect(mocks.memberships).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
    });
    expect(mocks.grants).toHaveBeenCalledWith({
      resourceId: "resource",
      organizationId: "org-1",
    });
  });

  it("gives administrators manager access, including when admin status is loaded", async () => {
    mocks.userFirst.mockResolvedValue({ isAdmin: true });
    expect(
      await getResourceRole(user.id, user.organizationId, "resource"),
    ).toBe("manager");
    expect(mocks.userFirst).toHaveBeenCalledWith({
      id: "user-1",
      organizationId: "org-1",
    });
    expect(
      await getResourceRole(user.id, user.organizationId, "resource", true),
    ).toBe("manager");
    expect(mocks.grants).not.toHaveBeenCalled();
  });

  it.each([
    [null, [false, false, false, false]],
    ["viewer", [true, false, false, false]],
    ["editor", [true, true, false, false]],
    ["manager", [true, true, true, true]],
  ] as const)(
    "applies the operation thresholds for %s",
    async (role, expected) => {
      mocks.grants.mockResolvedValue(
        role ? [{ principalId: user.id, role }] : [],
      );
      const actual = await Promise.all(
        (["read", "update", "delete", "manageGrant"] as const).map(
          (operation) => hasResourceAccess(user, "resource", operation),
        ),
      );
      expect(actual).toEqual(expected);
    },
  );

  it("returns 403 when access is denied", async () => {
    await expect(
      requireResourceAccess(user, "resource", "read"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("filters resources by organization even for administrators", async () => {
    const resources = [
      { id: "a", organizationId: "org-1" },
      { id: "b", organizationId: "org-2" },
    ];
    expect(
      await filterResourcesByRole({ ...user, isAdmin: true }, resources),
    ).toEqual([resources[0]]);
  });

  it("exposes permissions for each resource based on its effective role", async () => {
    mocks.grants.mockImplementation(({ resourceId }) =>
      Promise.resolve(
        resourceId === "a"
          ? [{ principalId: user.id, role: "editor" }]
          : [{ principalId: user.id, role: "manager" }],
      ),
    );
    expect(
      await includeResourcePermissions(user, [{ id: "a" }, { id: "b" }]),
    ).toEqual([
      {
        id: "a",
        canUpdate: "true",
        canDelete: "false",
        canManageGrants: "false",
      },
      {
        id: "b",
        canUpdate: "true",
        canDelete: "true",
        canManageGrants: "true",
      },
    ]);
  });
});
