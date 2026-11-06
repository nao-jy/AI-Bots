import type { FileEntry, FileSystem } from "./index";

export class InMemoryFileSystem implements FileSystem {
  private files = new Map<string, { content: string; updatedAt: Date }>();
  private encoder = new TextEncoder();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, { content, updatedAt: new Date() });
    }
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path)?.content ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, { content, updatedAt: new Date() });
  }

  async delete(path: string): Promise<boolean> {
    return this.files.delete(path);
  }

  async list(prefix: string): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    for (const [path, f] of this.files) {
      if (path.startsWith(prefix)) {
        out.push({
          path,
          size: this.encoder.encode(f.content).length,
          updatedAt: f.updatedAt,
        });
      }
    }
    return out;
  }

  async rename(from: string, to: string): Promise<void> {
    const f = this.files.get(from);
    if (!f) throw new Error(`not found: ${from}`);
    this.files.set(to, { ...f, updatedAt: new Date() });
    this.files.delete(from);
  }
}
