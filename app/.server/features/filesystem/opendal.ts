import { Operator } from "opendal";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BinaryFileSystem, FileEntry } from "./index";

export class OpenDalFileSystem implements BinaryFileSystem {
  private readonly operator: Operator;
  private readonly localRoot: string | null;

  constructor(service: string, config: Record<string, string> = {}) {
    this.operator = new Operator(service, config);
    this.localRoot = service === "fs" ? resolve(config.root ?? ".") : null;
  }

  private async hasLocalSymlink(path: string): Promise<boolean> {
    if (!this.localRoot) return false;
    let current = this.localRoot;
    for (const segment of path.split("/").filter(Boolean)) {
      current = join(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink()) return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") break;
        throw error;
      }
    }
    return false;
  }

  private async safePath(path: string, allowEmpty = false): Promise<string> {
    const key = this.path(path, allowEmpty);
    if (await this.hasLocalSymlink(key)) {
      throw new Error(`symlinks are not allowed: ${path}`);
    }
    return key;
  }

  private path(path: string, allowEmpty = false): string {
    if (
      (!allowEmpty && path === "") ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new Error(`Invalid storage path: ${path}`);
    }
    return path;
  }

  async read(path: string): Promise<string | null> {
    const data = await this.readBytes(path);
    return data?.toString("utf8") ?? null;
  }

  async readBytes(path: string): Promise<Buffer | null> {
    const key = await this.safePath(path);
    if (!(await this.operator.exists(key))) return null;
    if (!(await this.operator.stat(key)).isFile()) return null;
    return this.operator.read(key);
  }

  async write(path: string, content: string): Promise<void> {
    await this.writeBytes(path, Buffer.from(content, "utf8"));
  }

  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    await this.operator.write(await this.safePath(path), Buffer.from(content));
  }

  async delete(path: string): Promise<boolean> {
    const key = await this.safePath(path);
    if (!(await this.operator.exists(key))) return false;
    await this.operator.delete(key);
    return true;
  }

  async rename(from: string, to: string): Promise<void> {
    await this.operator.rename(
      await this.safePath(from),
      await this.safePath(to),
    );
  }

  async list(prefix: string): Promise<FileEntry[]> {
    const key = await this.safePath(prefix, true);
    const slash = key.lastIndexOf("/");
    const directory = key.endsWith("/")
      ? key
      : slash < 0
        ? ""
        : key.slice(0, slash + 1);
    const entries = await this.operator.list(directory, { recursive: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const path = entry.path();
        const metadata = entry.metadata();
        if (
          !metadata.isFile() ||
          !path.startsWith(key) ||
          (await this.hasLocalSymlink(path))
        )
          return null;
        return {
          path,
          size: Number(metadata.contentLength ?? 0n),
          updatedAt: metadata.lastModified
            ? new Date(metadata.lastModified)
            : new Date(0),
        };
      }),
    );
    return files.filter((entry): entry is FileEntry => entry !== null);
  }
}
