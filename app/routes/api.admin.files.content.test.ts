import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./+types/api.admin.files.content";
const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  getFs: vi.fn(),
  requireAdmin: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../.server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../.server/features/filesystem/browser", () => ({
  getBrowserFileSystem: mocks.getFs,
}));
vi.mock("../.server/logger/audit-logger", () => ({
  logAuditEvent: mocks.audit,
}));
import { loader } from "./api.admin.files.content";

function request(query: string) {
  return {
    request: new Request(
      `https://example.test/api/admin/files/content?api=api-id&path=test.txt${query}`,
    ),
  } as Route.LoaderArgs;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    id: "admin",
    organizationId: "org",
    isAdmin: true,
  });
  mocks.getFs.mockResolvedValue({ openRead: mocks.openRead });
});
describe("administrator file preview", () => {
  it("shows UTF-8 content as data and checks the selected API", async () => {
    mocks.openRead.mockResolvedValueOnce(
      new Response("<script>alert(1)</script>"),
    );
    const response = await loader(request(""));
    expect(await response.json()).toEqual({
      kind: "text",
      text: "<script>alert(1)</script>",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getFs).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org" }),
      "api-id",
    );
  });
  it("does not inline binary or large content", async () => {
    mocks.openRead
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 255])))
      .mockResolvedValueOnce(new Response(new Uint8Array(1024 * 1024 + 1)));
    expect(await (await loader(request(""))).json()).toEqual({
      kind: "binary",
    });
    expect(await (await loader(request(""))).json()).toEqual({ kind: "large" });
  });
  it("downloads as an attachment rather than serving active content", async () => {
    mocks.openRead.mockResolvedValueOnce(new Response("hello"));
    const response = await loader(request("&download=1"));
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(await response.text()).toBe("hello");
  });
  it("rejects requests before opening a file when the user is not an administrator", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(
      new Response("Forbidden", { status: 403 }),
    );
    await expect(loader(request(""))).rejects.toMatchObject({ status: 403 });
    expect(mocks.getFs).not.toHaveBeenCalled();
  });
});
