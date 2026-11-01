import { randomUUID } from "node:crypto";
import { logger } from "~/.server/logger";
import {
  createSandboxTerminalSession,
  type SandboxTerminalSession,
  type TerminalSize,
} from ".";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const OUTPUT_BUFFER_LIMIT = 512 * 1_024;

type OutputChunk = { offset: number; data: Buffer; closed?: boolean };
type OutputSubscriber = (chunk: OutputChunk) => void;

type ManagedTerminal = {
  id: string;
  userId: number;
  instanceId: string;
  backend: SandboxTerminalSession | null;
  chunks: OutputChunk[];
  outputLength: number;
  outputOffset: number;
  subscribers: Set<OutputSubscriber>;
  inputQueue: Promise<void>;
  closed: boolean;
  idleTimer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, ManagedTerminal>();

function emitOutput(session: ManagedTerminal, data: Uint8Array) {
  if (session.closed || data.byteLength === 0) return;
  const chunk = { offset: session.outputOffset, data: Buffer.from(data) };
  session.outputOffset += chunk.data.byteLength;
  session.chunks.push(chunk);
  session.outputLength += chunk.data.byteLength;

  while (session.outputLength > OUTPUT_BUFFER_LIMIT) {
    const first = session.chunks[0];
    if (!first) break;
    session.chunks.shift();
    session.outputLength -= first.data.byteLength;
  }

  for (const subscriber of session.subscribers) subscriber(chunk);
  refreshIdleTimeout(session);
};

function refreshIdleTimeout(session: ManagedTerminal) {
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    void closeSandboxTerminal(session.userId, session.id).catch((error) => {
      logger.error("Failed to expire sandbox terminal", {
        error,
        terminalId: session.id,
        instanceId: session.instanceId,
      });
    });
  }, SESSION_IDLE_TIMEOUT_MS);
  session.idleTimer.unref();
}

export async function openSandboxTerminal(
  userId: number,
  sandboxType: string,
  instanceId: string,
  envs: Record<string, string>,
  allowedDomains: string[],
  size: TerminalSize,
) {
  const id = randomUUID();
  const session: ManagedTerminal = {
    id,
    userId,
    instanceId,
    backend: null,
    chunks: [],
    outputLength: 0,
    outputOffset: 0,
    subscribers: new Set(),
    inputQueue: Promise.resolve(),
    closed: false,
    idleTimer: setTimeout(() => undefined, SESSION_IDLE_TIMEOUT_MS),
  };
  sessions.set(id, session);

  try {
    let exitedDuringStartup = false;
    session.backend = await createSandboxTerminalSession(
      sandboxType,
      instanceId,
      envs,
      allowedDomains,
      size,
      (data) => emitOutput(session, data),
      () => {
        if (!session.backend) {
          exitedDuringStartup = true;
          return;
        }
        void closeSandboxTerminal(userId, id).catch((error) => {
          logger.error("Failed to close exited sandbox terminal", {
            error,
            terminalId: id,
            instanceId,
          });
        });
      },
    );
    if (exitedDuringStartup) {
      await closeSandboxTerminal(userId, id);
      throw new Error("シェルプロセスが起動直後に終了しました。");
    }
    refreshIdleTimeout(session);
    return id;
  } catch (error) {
    clearTimeout(session.idleTimer);
    sessions.delete(id);
    throw error;
  }
}

function getOwnedSession(userId: number, id: string) {
  const session = sessions.get(id);
  return session?.userId === userId ? session : null;
}

export async function sendSandboxTerminalInput(
  userId: number,
  id: string,
  data: string,
) {
  const session = getOwnedSession(userId, id);
  if (!session || session.closed || !session.backend)
    throw new Error("シェルセッションが見つからないか、終了しています。");
  const normalizedData = data.replace(/\r\n|\n/g, "\r");
  if (normalizedData.length > 16_000)
    throw new Error("一度に送信できる入力は16,000文字までです。");
  const operation = session.inputQueue.then(async () => {
    if (session.closed || !session.backend)
      throw new Error("シェルセッションが見つからないか、終了しています。");
    await session.backend.sendInput(normalizedData);
  });
  session.inputQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  await operation;
  if (!session.closed) refreshIdleTimeout(session);
}

export async function resizeSandboxTerminal(
  userId: number,
  id: string,
  size: TerminalSize,
) {
  const session = getOwnedSession(userId, id);
  if (!session || session.closed || !session.backend)
    throw new Error("シェルセッションが見つからないか、終了しています。");
  if (
    !Number.isInteger(size.cols) ||
    !Number.isInteger(size.rows) ||
    size.cols < 2 ||
    size.cols > 500 ||
    size.rows < 1 ||
    size.rows > 300
  ) {
    throw new Error("端末サイズが不正です。");
  }
  await session.backend.resize(size);
  refreshIdleTimeout(session);
}

export async function closeSandboxTerminal(userId: number, id: string) {
  const session = getOwnedSession(userId, id);
  if (!session || session.closed) return;
  session.closed = true;
  clearTimeout(session.idleTimer);
  try {
    await session.backend?.close();
  } finally {
    session.backend = null;
    for (const subscriber of session.subscribers) {
      subscriber({
        offset: session.outputOffset,
        data: Buffer.alloc(0),
        closed: true,
      });
    }
    session.subscribers.clear();
    sessions.delete(id);
  }
}

export function hasOwnedSandboxTerminal(userId: number, id: string) {
  const session = getOwnedSession(userId, id);
  return Boolean(session && !session.closed);
}

export function subscribeSandboxTerminal(
  userId: number,
  id: string,
  lastEventId: number,
  subscriber: OutputSubscriber,
) {
  const session = getOwnedSession(userId, id);
  if (!session || session.closed) return null;

  session.subscribers.add(subscriber);
  for (const chunk of session.chunks) {
    const end = chunk.offset + chunk.data.byteLength;
    if (end <= lastEventId) continue;
    const startWithinChunk = Math.max(0, lastEventId - chunk.offset);
    subscriber({
      offset: chunk.offset + startWithinChunk,
      data: chunk.data.subarray(startWithinChunk),
    });
  }
  return () => session.subscribers.delete(subscriber);
}
