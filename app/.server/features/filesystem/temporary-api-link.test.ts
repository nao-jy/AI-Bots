import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(async () => ({
    token: "a".repeat(64),
    filename: "x.txt",
    expiresAt: "2026-01-01",
  })),
  get: vi.fn(async () => ({
    filename: "x.txt",
    expiresAt: "2026-01-01",
    data: Buffer.from("hello"),
  })),
}));
vi.mock("./temporary-api", () => ({
  getOrganizationTemporaryStore: vi.fn(async () => ({
    apiId: "01941f00-0000-7000-8000-000000000001",
    store: { save: mocks.save },
  })),
  getTemporaryStoreForApi: vi.fn(async () => ({ get: mocks.get })),
}));
import { createTemporaryFileLink } from "../toolsets/temporary-file-link";
import { loader } from "../../../routes/api.files.$apiId.$token";
import {
  getOrganizationTemporaryStore,
  getTemporaryStoreForApi,
} from "./temporary-api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("temporary file API routing", () => {
  it("retains the original API id in download links", async () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://example.test");
    const result = await createTemporaryFileLink(
      Buffer.from("hello"),
      "x.txt",
      undefined,
      "organization",
    );
    expect(getOrganizationTemporaryStore).toHaveBeenCalledWith("organization");
    const [, , , apiId, token] = new URL(result.url).pathname.split("/");
    expect(apiId).toBe("01941f00-0000-7000-8000-000000000001");
    const response = await loader({ params: { apiId, token } } as Parameters<
      typeof loader
    >[0]);
    expect(getTemporaryStoreForApi).toHaveBeenCalledWith(apiId);
    expect(mocks.get).toHaveBeenCalledWith(token);
    expect(await response.text()).toBe("hello");
  });
});
