import { describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenDalFileSystem } from "./opendal";

describe("OpenDalFileSystem", () => {
  it("provides text and binary file operations through the fs service", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-opendal-fs-"));
    try {
      const fs = new OpenDalFileSystem("fs", { root: dir });
      await fs.write("notes/a.txt", "hello");
      await fs.writeBytes("files/b.bin", Buffer.from([0, 255, 1]));

      expect(await fs.read("notes/a.txt")).toBe("hello");
      expect(await fs.readBytes("files/b.bin")).toEqual(
        Buffer.from([0, 255, 1]),
      );
      expect((await fs.list("notes/")).map((entry) => entry.path)).toEqual([
        "notes/a.txt",
      ]);
      expect((await fs.list("files/b")).map((entry) => entry.path)).toEqual([
        "files/b.bin",
      ]);

      await fs.rename("notes/a.txt", "notes/c.txt");
      expect(await fs.read("notes/a.txt")).toBeNull();
      expect(await fs.read("notes/c.txt")).toBe("hello");
      expect(await fs.delete("notes/c.txt")).toBe(true);
      expect(await fs.delete("notes/c.txt")).toBe(false);
      await expect(fs.read("../escape.txt")).rejects.toThrow(
        "Invalid storage path",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not follow symlinks outside the fs root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bot-opendal-symlink-"));
    try {
      const root = join(dir, "root");
      const outside = join(dir, "outside.txt");
      const fs = new OpenDalFileSystem("fs", { root });
      await fs.write("safe.txt", "safe");
      await writeFile(outside, "secret");
      await symlink(outside, join(root, "link.txt"));
      await symlink(dir, join(root, "linkdir"));

      await expect(fs.read("link.txt")).rejects.toThrow(
        "symlinks are not allowed",
      );
      await expect(fs.read("linkdir/outside.txt")).rejects.toThrow(
        "symlinks are not allowed",
      );
      await expect(fs.write("link.txt", "changed")).rejects.toThrow(
        "symlinks are not allowed",
      );
      await expect(fs.delete("link.txt")).rejects.toThrow(
        "symlinks are not allowed",
      );
      await expect(
        fs.rename("safe.txt", "linkdir/renamed.txt"),
      ).rejects.toThrow("symlinks are not allowed");
      expect((await fs.list("")).map((entry) => entry.path)).toEqual([
        "safe.txt",
      ]);
      expect(await fs.read("safe.txt")).toBe("safe");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
