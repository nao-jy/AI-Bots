import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { DATA_PERSISTENCE_SCOPES } from "~/const";

export type DataPersistenceScope = keyof typeof DATA_PERSISTENCE_SCOPES;

export function isDataPersistenceScope(
  value: string,
): value is DataPersistenceScope {
  return Object.hasOwn(DATA_PERSISTENCE_SCOPES, value);
}

export function getMemoryDirectory(
  root: string,
  organizationId: string,
  chatbotId: string,
  scope: DataPersistenceScope,
  adapterId: string,
  threadId: string,
): string | null {
  if (scope === "nopersistence") return null;

  const botRoot = resolve(root, organizationId, chatbotId);
  if (scope === "bot") return resolve(botRoot, "bot");

  const threadScope = createHash("sha256")
    .update(adapterId)
    .update("\0")
    .update(threadId)
    .digest("hex");
  return resolve(botRoot, threadScope);
}
