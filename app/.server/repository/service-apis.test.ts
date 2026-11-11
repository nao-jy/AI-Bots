import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("../logger/audit-logger", () => ({ logAuditEvent: vi.fn() }));
import {
  deleteServiceApi,
  listServiceApis,
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
