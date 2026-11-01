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

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface SandboxTerminalSession {
  sendInput: (data: string) => Promise<void>;
  resize: (size: TerminalSize) => Promise<void>;
  close: () => Promise<void>;
}

export interface Sandbox {
  sandboxType: string;
  isAvailable: () => Promise<boolean>;
  executeCommandWithOpenNetwork: (
    instanceId: string,
    envs: Record<string, string>,
    allowedDomains: string[],
    command: string,
  ) => Promise<Awaited<ReturnType<BashSandbox["executeCommand"]>>>;
  createTerminalSession: (
    instanceId: string,
    envs: Record<string, string>,
    allowedDomains: string[],
    size: TerminalSize,
    onData: (data: Uint8Array) => void,
    onExit: (exitCode?: number) => void,
  ) => Promise<SandboxTerminalSession>;
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

export async function executeSandboxCommand(
  sandboxType: string,
  instanceId: string,
  envs: Record<string, string>,
  allowedDomains: string[],
  command: string,
) {
  const sandboxProvider = getSandbox(sandboxType);
  if (!sandboxProvider)
    throw new Error(`Unsupported sandbox type: ${sandboxType}`);

  return sandboxProvider.executeCommandWithOpenNetwork(
    instanceId,
    envs,
    allowedDomains,
    command,
  );
}

export async function createSandboxTerminalSession(
  sandboxType: string,
  instanceId: string,
  envs: Record<string, string>,
  allowedDomains: string[],
  size: TerminalSize,
  onData: (data: Uint8Array) => void,
  onExit: (exitCode?: number) => void,
) {
  const sandboxProvider = getSandbox(sandboxType);
  if (!sandboxProvider)
    throw new Error(`Unsupported sandbox type: ${sandboxType}`);

  return sandboxProvider.createTerminalSession(
    instanceId,
    envs,
    allowedDomains,
    size,
    onData,
    onExit,
  );
}
