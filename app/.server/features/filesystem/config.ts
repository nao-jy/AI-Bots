import type { FileSystemConfig } from "./api";

export function storageConfig(
  name: "MEMORY" | "TEMP_FILE",
  defaultRoot: string,
): FileSystemConfig {
  const service = process.env[`${name}_STORAGE_SERVICE`] || "fs";
  const raw = process.env[`${name}_STORAGE_CONFIG`];
  const config: unknown = raw ? JSON.parse(raw) : {};
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.values(config).some((value) => typeof value !== "string")
  ) {
    throw new Error(`${name}_STORAGE_CONFIG must be a JSON object of strings`);
  }
  return {
    service,
    config:
      service === "fs"
        ? { root: defaultRoot, ...config }
        : (config as Record<string, string>),
  };
}
