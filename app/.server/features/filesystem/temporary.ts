import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { BinaryFileSystem } from "./index";
import { OpenDalFileSystem } from "./opendal";

export const TEMP_FILE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_TEMP_FILE_BYTES = 10 * 1024 * 1024;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function getTemporaryFileStore() {
  const service = process.env.TEMP_FILE_STORAGE_SERVICE || "fs";
  const rawConfig = process.env.TEMP_FILE_STORAGE_CONFIG;
  let config: Record<string, string> = {};
  if (rawConfig) {
    const parsed: unknown = JSON.parse(rawConfig);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    ) {
      throw new Error(
        "TEMP_FILE_STORAGE_CONFIG must be a JSON object of strings",
      );
    }
    config = parsed as Record<string, string>;
  }
  if (service === "fs") {
    config = {
      root: resolve(process.env.TEMP_FILE_DIR || "data/temporary-files"),
      ...config,
    };
  }
  return new TemporaryFileStore(new OpenDalFileSystem(service, config));
}

interface TemporaryFileMetadata {
  filename: string;
  expiresAt: string;
}

export interface TemporaryFile extends TemporaryFileMetadata {
  data: Buffer;
}

function isMetadata(value: unknown): value is TemporaryFileMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.filename === "string" &&
    typeof metadata.expiresAt === "string" &&
    Number.isFinite(Date.parse(metadata.expiresAt))
  );
}

export class TemporaryFileStore {
  constructor(
    private readonly fs: BinaryFileSystem,
    private readonly now: () => number = Date.now,
  ) {}

  private metadataPath(token: string) {
    return `metadata/${token}.json`;
  }

  private dataPath(token: string) {
    return `files/${token}`;
  }

  private async remove(token: string) {
    await Promise.all([
      this.fs.delete(this.metadataPath(token)),
      this.fs.delete(this.dataPath(token)),
    ]);
  }

  async save(data: Uint8Array, filename: string) {
    if (data.byteLength > MAX_TEMP_FILE_BYTES) {
      throw new Error("Temporary file exceeds 10 MiB");
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(this.now() + TEMP_FILE_TTL_MS).toISOString();
    const safeFilename =
      filename
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[\r\n]/g, "_") || "download";
    try {
      await this.fs.writeBytes(this.dataPath(token), data);
      await this.fs.writeBytes(
        this.metadataPath(token),
        Buffer.from(JSON.stringify({ filename: safeFilename, expiresAt })),
      );
    } catch (error) {
      await this.remove(token);
      throw error;
    }
    await this.cleanupExpired();
    return { token, expiresAt, filename: safeFilename };
  }

  async get(token: string): Promise<TemporaryFile | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const raw = await this.fs.readBytes(this.metadataPath(token));
    if (!raw) return null;
    let metadata: unknown;
    try {
      metadata = JSON.parse(raw.toString("utf8"));
    } catch {
      await this.remove(token);
      return null;
    }
    if (!isMetadata(metadata) || Date.parse(metadata.expiresAt) <= this.now()) {
      await this.remove(token);
      return null;
    }
    const data = await this.fs.readBytes(this.dataPath(token));
    if (!data) {
      await this.remove(token);
      return null;
    }
    return { ...metadata, data };
  }

  async cleanupExpired() {
    const entries = await this.fs.list("metadata/");
    for (const entry of entries) {
      const token = entry.path.match(/^metadata\/([a-f0-9]{64})\.json$/)?.[1];
      if (!token) continue;
      const raw = await this.fs.readBytes(entry.path);
      if (!raw) continue;
      let metadata: unknown;
      try {
        metadata = JSON.parse(raw.toString("utf8"));
      } catch {
        await this.remove(token);
        continue;
      }
      if (
        !isMetadata(metadata) ||
        Date.parse(metadata.expiresAt) <= this.now()
      ) {
        await this.remove(token);
      }
    }
  }
}
