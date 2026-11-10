import {
  mkdir,
  readFile,
  writeFile,
  rm,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BinaryFileSystem, FileEntry } from "../index";

// Local test double for memory and temporary file behavior.
export class LocalTestFileSystem implements BinaryFileSystem {
  private root: string;
  constructor(_service: string, config: Record<string, string>) {
    this.root = config.root;
  }
  async read(path: string) {
    return (await this.readBytes(path))?.toString("utf8") ?? null;
  }
  async readBytes(path: string) {
    try {
      return await readFile(join(this.root, path));
    } catch (e) {
      if (
        ["ENOENT", "EISDIR"].includes((e as NodeJS.ErrnoException).code ?? "")
      )
        return null;
      throw e;
    }
  }
  async write(path: string, content: string) {
    await this.writeBytes(path, Buffer.from(content));
  }
  async writeBytes(path: string, content: Uint8Array) {
    const target = join(this.root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  async delete(path: string) {
    try {
      await rm(join(this.root, path));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
  async rename(from: string, to: string) {
    await mkdir(dirname(join(this.root, to)), { recursive: true });
    await rename(join(this.root, from), join(this.root, to));
  }
  async list(prefix: string): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(join(this.root, dir), { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && path.startsWith(prefix)) {
          const info = await stat(join(this.root, path));
          results.push({ path, size: info.size, updatedAt: info.mtime });
        }
      }
    };
    await walk("");
    return results;
  }
}
