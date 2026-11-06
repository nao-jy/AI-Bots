import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { randomBytes } from "node:crypto";
import type { FileEntry, FileSystem } from "./index";

export class LocalFileSystem implements FileSystem {
  private readonly root: string;

  constructor(root: string) {
    this.root = nodePath.resolve(root);
  }

  private async resolve(rel: string): Promise<string> {
    const segments = rel.split("/").filter(Boolean);
    const abs = nodePath.resolve(this.root, ...segments);
    if (abs !== this.root && !abs.startsWith(this.root + nodePath.sep)) {
      throw new Error(`path escapes memory root: ${rel}`);
    }
    let cur = this.root;
    for (const seg of segments) {
      cur = nodePath.join(cur, seg);
      try {
        if ((await fsp.lstat(cur)).isSymbolicLink())
          throw new Error(`symlinks are not allowed: ${rel}`);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") break;
        throw e;
      }
    }
    return abs;
  }

  async read(path: string): Promise<string | null> {
    const abs = await this.resolve(path);
    try {
      return await fsp.readFile(abs, "utf8");
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR")
        return null;
      throw e;
    }
  }

  async write(path: string, content: string): Promise<void> {
    const abs = await this.resolve(path);
    await fsp.mkdir(nodePath.dirname(abs), { recursive: true });
    const tmp = nodePath.join(
      nodePath.dirname(abs),
      `.tmp-${randomBytes(6).toString("hex")}`,
    );
    await fsp.writeFile(tmp, content, "utf8");
    await fsp.rename(tmp, abs);
  }

  async delete(path: string): Promise<boolean> {
    const abs = await this.resolve(path);
    try {
      await fsp.unlink(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
    await this.pruneEmptyDirs(nodePath.dirname(abs));
    return true;
  }

  async rename(from: string, to: string): Promise<void> {
    const src = await this.resolve(from);
    const dst = await this.resolve(to);
    await fsp.mkdir(nodePath.dirname(dst), { recursive: true });
    await fsp.rename(src, dst);
    await this.pruneEmptyDirs(nodePath.dirname(src));
  }

  async list(prefix: string): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const walk = async (dirAbs: string, dirRel: string): Promise<void> => {
      let names: string[];
      try {
        names = await fsp.readdir(dirAbs);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      for (const name of names) {
        if (name.startsWith(".")) continue; // ignore tmp, hidden file
        const abs = nodePath.join(dirAbs, name);
        const rel = dirRel ? `${dirRel}/${name}` : name;
        const st = await fsp.lstat(abs);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          if (prefix.startsWith(rel + "/") || (rel + "/").startsWith(prefix))
            await walk(abs, rel);
        } else if (st.isFile() && rel.startsWith(prefix)) {
          out.push({ path: rel, size: st.size, updatedAt: st.mtime });
        }
      }
    };
    await walk(this.root, "");
    return out;
  }

  private async pruneEmptyDirs(dirAbs: string): Promise<void> {
    let cur = dirAbs;
    while (cur !== this.root && cur.startsWith(this.root + nodePath.sep)) {
      try {
        await fsp.rmdir(cur);
      } catch {
        return;
      }
      cur = nodePath.dirname(cur);
    }
  }
}
