import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const MEMORY_CONFIGS = ["nouse", "thread", "bot"] as const;
export type MemoryConfig = (typeof MEMORY_CONFIGS)[number];

export function isMemoryConfig(value: string): value is MemoryConfig {
  return MEMORY_CONFIGS.some((config) => config === value);
}

export function getMemoryDirectory(
  root: string,
  organizationId: string,
  chatbotId: string,
  config: MemoryConfig,
  adapterId: string,
  threadId: string,
): string | null {
  if (config === "nouse") return null;

  const botRoot = resolve(root, organizationId, chatbotId);
  if (config === "bot") return resolve(botRoot, "bot");

  const threadScope = createHash("sha256")
    .update(adapterId)
    .update("\0")
    .update(threadId)
    .digest("hex");
  return resolve(botRoot, threadScope);
}
