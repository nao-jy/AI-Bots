import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("../logger/audit-logger", () => ({ logAuditEvent: vi.fn() }));
import {
  deleteServiceApi,
  listServiceApis,
  isBuiltinApiRouteMigration,
  saveServiceApi,
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
