import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenDalFileSystem } from "./opendal";
import { TEMP_FILE_TTL_MS, TemporaryFileStore } from "./temporary";
import { createTemporaryFileLink } from "../toolsets/temporary-file-link";
import { loader } from "../../../routes/api.files.$token";

describe("temporary file store", () => {
  it("persists binary data and expires a link without a database", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-temp-file-"));
    let now = Date.UTC(2026, 0, 1);
    try {
      const fs = new OpenDalFileSystem("fs", { root: dir });
      const store = new TemporaryFileStore(fs, () => now);
      const source = Buffer.from([0, 255, 17, 0]);
      const saved = await store.save(source, "sample.bin");
      expect(saved.token).toMatch(/^[a-f0-9]{64}$/);
      expect((await store.get(saved.token))?.data).toEqual(source);
      expect(
        (
          await new TemporaryFileStore(
            new OpenDalFileSystem("fs", { root: dir }),
            () => now,
          ).get(saved.token)
        )?.data,
      ).toEqual(source);

      now += TEMP_FILE_TTL_MS;
      expect(await store.get(saved.token)).toBeNull();
      expect(await fs.readBytes(`files/${saved.token}`)).toBeNull();
      expect(await fs.readBytes(`metadata/${saved.token}.json`)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed tokens and removes expired files during cleanup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-temp-file-"));
    let now = Date.UTC(2026, 0, 1);
    try {
      const fs = new OpenDalFileSystem("fs", { root: dir });
      const store = new TemporaryFileStore(fs, () => now);
      expect(await store.get("../../etc/passwd")).toBeNull();
      const saved = await store.save(Buffer.from("hello"), "hello.txt");
      now += TEMP_FILE_TTL_MS + 1;
      await store.cleanupExpired();
      expect(await store.get(saved.token)).toBeNull();
      expect(await fs.readBytes(`files/${saved.token}`)).toBeNull();
      expect(await fs.readBytes(`metadata/${saved.token}.json`)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates a public link that serves the stored binary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-temp-file-"));
    vi.stubEnv("TEMP_FILE_DIR", dir);
    vi.stubEnv("PUBLIC_APP_URL", "https://example.test");
    try {
      const content = Buffer.from([0, 1, 255]);
      const result = await createTemporaryFileLink(content, "sample.bin");
      const token = new URL(result.url).pathname.split("/").at(-1);
      const response = await loader({
        params: { token },
      } as unknown as Parameters<typeof loader>[0]);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
      expect(response.headers.get("Content-Disposition")).toContain(
        "sample.bin",
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
