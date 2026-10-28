import { type Sandbox as BashSandbox } from "bash-tool";
import { E2B } from "./e2b";

export interface BashSandboxExtended extends BashSandbox {
  readFileBinaryStream(path: string): Promise<ReadableStream<Uint8Array>>;
}

interface BashSandboxInfo {
  createdInstanceId: string | null;
  sandbox: BashSandboxExtended;
}

export interface Sandbox {
  sandboxType: string;
  getBashSandbox: (
    instanceId: string | null,
    envs: Record<string, string>,
    allowedDomains: string[],
  ) => Promise<BashSandboxInfo>;
  destroySandbox: (instanceId: string) => Promise<void>;
}

const SANDBOXES: Sandbox[] = [E2B];

export function listSandboxNames() {
  return SANDBOXES.map((sandbox) => sandbox.sandboxType);
}

export function getSandbox(sandboxType: string) {
  return SANDBOXES.find((V) => V.sandboxType === sandboxType) ?? null;
}
