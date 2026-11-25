import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth";
const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("../../repository/runtime-lookups", () => ({
  getBrowserFilesystemApi: mocks.lookup,
}));
import { getBrowserFileSystem } from "./browser";

const admin = {
  id: "user",
  isAdmin: true,
  organizationId: "org-a",
} as AuthUser;
const apiId = "01941f00-0000-7000-8000-000000000001";
beforeEach(() => vi.clearAllMocks());
describe("filesystem browser access", () => {
  it("rejects non-admins without querying the API", async () => {
    await expect(
      getBrowserFileSystem({ ...admin, isAdmin: false }, apiId),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("looks up the API in the administrator's organization", async () => {
    mocks.lookup.mockResolvedValueOnce(null);
    await expect(getBrowserFileSystem(admin, apiId)).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.lookup).toHaveBeenCalledWith(apiId, "org-a");
  });
});
