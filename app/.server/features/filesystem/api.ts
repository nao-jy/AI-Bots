import type { BinaryFileSystem, FileEntry } from "./index";

export interface FileSystemConfig {
  service: string;
  config: Record<string, string>;
}

export class ApiFileSystem implements BinaryFileSystem {
  constructor(
    private readonly storage: FileSystemConfig,
    private readonly prefix = "",
    private readonly connection?: {
      endpoint: string;
      headers: Record<string, string>;
    },
  ) {}

  private path(path: string): string {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error("Invalid storage path");
    return this.prefix ? `${this.prefix}/${path}` : path;
  }

  private async request(
    operation: string,
    data: Record<string, string> = {},
    content?: Uint8Array,
  ): Promise<Response> {
    const raw = this.connection?.endpoint ?? process.env.FILESYSTEM_API_URL;
    const token = process.env.FILESYSTEM_API_TOKEN;
    if (!raw || (!this.connection && !token))
      throw new Error("Filesystem API is not configured");
    const base = new URL(raw);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new Error("Invalid filesystem API URL");
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const headers = new Headers(
      this.connection?.headers ?? { Authorization: `Bearer ${token}` },
    );
    let body: BodyInit;
    if (content !== undefined) {
      const form = new FormData();
      form.set("context", JSON.stringify(this.storage));
      form.set("path", data.path);
      form.set(
        "file",
        new Blob([Buffer.from(content)], { type: "application/octet-stream" }),
        "file",
      );
      body = form;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify({ context: this.storage, ...data });
    }
    const response = await fetch(new URL(`v1/${operation}`, base), {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok && !(operation === "read" && response.status === 404))
      throw new Error(
        `Filesystem API request failed (HTTP ${response.status})`,
      );
    return response;
  }

  async read(path: string): Promise<string | null> {
    return (await this.readBytes(path))?.toString("utf8") ?? null;
  }
  async readBytes(path: string): Promise<Buffer | null> {
    const response = await this.request("read", { path: this.path(path) });
    return response.status === 404
      ? null
      : Buffer.from(await response.arrayBuffer());
  }
  async write(path: string, content: string): Promise<void> {
    await this.writeBytes(path, Buffer.from(content));
  }
  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    await this.request("write", { path: this.path(path) }, content);
  }
  async delete(path: string): Promise<boolean> {
    const response = await this.request("delete", { path: this.path(path) });
    return (await response.json()).deleted;
  }
  async rename(from: string, to: string): Promise<void> {
    await this.request("rename", { from: this.path(from), to: this.path(to) });
  }
  async list(prefix: string): Promise<FileEntry[]> {
    const response = await this.request("list", { prefix: this.path(prefix) });
    const { entries } = (await response.json()) as {
      entries: { path: string; size: number; updatedAt: string }[];
    };
    const root = this.prefix ? `${this.prefix}/` : "";
    return entries.map((entry) => {
      if (!entry.path.startsWith(root))
        throw new Error("Invalid filesystem API response");
      return {
        ...entry,
        path: entry.path.slice(root.length),
        updatedAt: new Date(entry.updatedAt),
      };
    });
  }
}
