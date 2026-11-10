import type { BinaryFileSystem, FileEntry } from "./index";

export interface FileSystemConfig {
  service: string;
  config: Record<string, string>;
}

const sessions = new Map<string, Promise<string>>();

export class ApiFileSystem implements BinaryFileSystem {
  constructor(
    private readonly storage: FileSystemConfig,
    private readonly prefix = "",
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
    params: Record<string, string> = {},
    init: RequestInit = {},
  ): Promise<Response> {
    const raw = process.env.FILESYSTEM_API_URL;
    const token = process.env.FILESYSTEM_API_TOKEN;
    if (!raw || !token) throw new Error("Filesystem API is not configured");
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
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const cacheKey = JSON.stringify([base.href, token, this.storage]);
    const open = (): Promise<string> => {
      let pending = sessions.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          const response = await fetch(new URL("v1/filesystems", base), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.storage),
            redirect: "error",
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok)
            throw new Error(
              `Filesystem API request failed (HTTP ${response.status})`,
            );
          const data: unknown = await response.json();
          if (
            !data ||
            typeof data !== "object" ||
            !("sessionId" in data) ||
            typeof data.sessionId !== "string" ||
            !/^[A-Za-z0-9_-]+$/.test(data.sessionId)
          )
            throw new Error("Invalid filesystem session");
          return data.sessionId;
        })();
        sessions.set(cacheKey, pending);
        void pending.catch(() => {
          if (sessions.get(cacheKey) === pending) sessions.delete(cacheKey);
        });
      }
      return pending;
    };
    const send = async (id: string): Promise<Response> => {
      const target = new URL(`v1/filesystems/${id}/${operation}`, base);
      for (const [key, value] of Object.entries(params))
        target.searchParams.set(key, value);
      return fetch(target, {
        ...init,
        headers,
        redirect: "error",
        signal: init.signal ?? AbortSignal.timeout(60000),
      });
    };
    const pending = open();
    let response = await send(await pending);
    if (
      response.status === 404 &&
      response.headers.get("X-Filesystem-Session") === "missing"
    ) {
      if (sessions.get(cacheKey) === pending) sessions.delete(cacheKey);
      response = await send(await open());
    }
    if (
      !response.ok &&
      !(
        operation === "file" &&
        (!init.method || init.method === "GET") &&
        response.status === 404
      )
    )
      throw new Error(
        `Filesystem API request failed (HTTP ${response.status})`,
      );
    return response;
  }

  async read(path: string): Promise<string | null> {
    return (await this.readBytes(path))?.toString("utf8") ?? null;
  }
  async readBytes(path: string): Promise<Buffer | null> {
    const response = await this.request("file", { path: this.path(path) });
    return response.status === 404
      ? null
      : Buffer.from(await response.arrayBuffer());
  }
  async write(path: string, content: string): Promise<void> {
    await this.writeBytes(path, Buffer.from(content));
  }
  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    await this.request(
      "file",
      { path: this.path(path) },
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.from(content),
      },
    );
  }
  async delete(path: string): Promise<boolean> {
    const response = await this.request(
      "file",
      { path: this.path(path) },
      { method: "DELETE" },
    );
    return (await response.json()).deleted;
  }
  async rename(from: string, to: string): Promise<void> {
    await this.request(
      "rename",
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.path(from), to: this.path(to) }),
      },
    );
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
