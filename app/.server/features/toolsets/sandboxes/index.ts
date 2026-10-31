import { type Sandbox as BashSandbox } from "bash-tool";
import { E2B } from "./e2b";
import { OPEN_SANDBOX } from "./open-sandbox";

export interface BashSandboxExtended extends BashSandbox {
  readFileBinaryStream(
    path: string,
  ): AsyncIterable<Uint8Array<ArrayBufferLike>>;
}

interface BashSandboxInfo {
  createdInstanceId: string | null;
  sandbox: BashSandboxExtended;
}

export interface Sandbox {
  sandboxType: string;
  isAvailable: () => Promise<boolean>;
  getBashSandbox: (
    instanceId: string | null,
    envs: Record<string, string>,
    allowedDomains: string[],
  ) => Promise<BashSandboxInfo>;
  destroySandbox: (instanceId: string) => Promise<void>;
}

const SANDBOXES: Sandbox[] = [E2B, OPEN_SANDBOX];

export async function listSandboxNames() {
  const results = await Promise.all(
    SANDBOXES.map(async (sandbox) => ({
      sandbox,
      available: await sandbox.isAvailable(),
    })),
  );

  return results
    .filter(({ available }) => available)
    .map(({ sandbox }) => sandbox.sandboxType);
}

export function getSandbox(sandboxType: string) {
  return SANDBOXES.find((V) => V.sandboxType === sandboxType) ?? null;
}
