import { afterEach, describe, expect, it, vi } from "vitest";

const { sandboxFirst, filesystemFirst } = vi.hoisted(() => ({
  sandboxFirst: vi.fn(),
  filesystemFirst: vi.fn(),
}));
vi.mock("./db", () => ({
  db: {
    orm: {
      aibot: {
        SandboxAPI: { first: sandboxFirst },
        FileSystemAPI: { first: filesystemFirst },
      },
    },
  },
}));
vi.mock("../logger/audit-logger", () => ({ logAuditEvent: vi.fn() }));
import {
  deleteServiceApi,
  listServiceApis,
  isBuiltinApiRouteMigration,
  saveServiceApi,
  testServiceApi,
} from "./service-apis";
import type { AuthUser } from "../auth";

const nonAdmin = {
  id: "user",
  organizationId: "org",
  isAdmin: false,
} as AuthUser;

describe("API configuration authorization", () => {
  it("rejects non-administrators before reading or writing configuration", async () => {
    for (const operation of [
      () => listServiceApis(nonAdmin),
      () => saveServiceApi(nonAdmin, new FormData()),
      () => deleteServiceApi(nonAdmin, new FormData()),
      () => testServiceApi(nonAdmin, new FormData()),
    ]) {
      await expect(operation()).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe("built-in API route migration", () => {
  it("allows the same bundled API to move behind nginx", () => {
    expect(
      isBuiltinApiRouteMigration(
        "sandbox",
        "http://sandbox-api:8090/",
        "http://bot-tools/sandbox",
      ),
    ).toBe(true);
    expect(
      isBuiltinApiRouteMigration(
        "filesystem",
        "http://filesystem-api:8091",
        "http://bot-tools/filesystem/",
      ),
    ).toBe(true);
    expect(
      isBuiltinApiRouteMigration(
        "sandbox",
        "http://sandbox-api:8090",
        "http://other/sandbox",
      ),
    ).toBe(false);
    expect(
      isBuiltinApiRouteMigration(
        "filesystem",
        "http://filesystem-api:8091/other",
        "http://bot-tools/filesystem",
      ),
    ).toBe(false);
    expect(
      isBuiltinApiRouteMigration(
        "sandbox",
        "http://sandbox-api:8090",
        "http://bot-tools/filesystem",
      ),
    ).toBe(false);
  });
});

describe("service API connection tests", () => {
  const admin = {
    id: "user",
    organizationId: "org",
    isAdmin: true,
  } as AuthUser;
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  function form(kind: string) {
    const values = new FormData();
    values.set("kind", kind);
    values.set("endpoint", "https://example.test/" + kind);
    values.set("headers", JSON.stringify({ Authorization: "Bearer token" }));
    return values;
  }
  it("checks the authenticated sandbox route without creating an instance", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await testServiceApi(admin, form("sandbox"))).toEqual({
      apiTest: true,
      apiTestOk: true,
    });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.href).toBe("https://example.test/sandbox/v1/instances");
    expect(options.method).toBeUndefined();
    expect(new Headers(options.headers).get("authorization")).toBe(
      "Bearer token",
    );
    expect(options.redirect).toBe("error");
  });
  it("checks filesystem storage with the provided context", async () => {
    const fetchMock = vi.fn(async () => Response.json({ entries: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const values = form("filesystem");
    values.set(
      "context",
      JSON.stringify({ service: "fs", config: { root: "data" } }),
    );
    expect(await testServiceApi(admin, values)).toEqual({
      apiTest: true,
      apiTestOk: true,
    });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.href).toBe("https://example.test/filesystem/v1/list");
    expect(JSON.parse(options.body as string)).toEqual({
      context: { service: "fs", config: { root: "data" } },
      prefix: "",
      mode: "directory",
    });
  });
  it("rejects unauthorized responses and malformed filesystem responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    expect((await testServiceApi(admin, form("sandbox"))).apiTestOk).toBe(
      false,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const values = form("filesystem");
    values.set("context", "{}");
    expect((await testServiceApi(admin, values)).apiTestOk).toBe(false);
  });
  it("never sends saved credentials or context to a changed endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    filesystemFirst.mockResolvedValue({
      endpoint: "https://original.test",
      headers: {},
      context: {},
    });
    const values = form("filesystem");
    values.set("id", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    values.set("headers", "");
    expect((await testServiceApi(admin, values)).apiTestOk).toBe(false);
    expect(filesystemFirst).toHaveBeenCalledWith({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      organizationId: "org",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
