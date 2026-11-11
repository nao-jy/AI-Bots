import WebSocket, { type RawData } from "ws";
import type {
  BashSandboxExtended,
  Sandbox,
  SandboxTerminalSession,
  TerminalSize,
} from ".";

function endpoint(raw: string | undefined): URL {
  if (!raw) throw new Error("Sandbox API URL is not configured");
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid sandbox API URL");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function url(path: string, baseUrl?: string): URL {
  return new URL(path.replace(/^\/+/, ""), endpoint(baseUrl));
}

async function request(
  path: string,
  init: RequestInit = {},
  config: SandboxApiConfig,
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(config.headers))
    headers.set(name, value);
  const response = await fetch(url(path, config.baseUrl), {
    ...init,
    headers,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok)
    throw new Error(`Sandbox API request failed (HTTP ${response.status})`);
  return response;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function terminalSocket(
  config: SandboxApiConfig,
  instanceId: string,
  envs: Record<string, string>,
  allowedDomains: string[],
  size: TerminalSize,
  onData: (data: Uint8Array) => void,
  onExit: (exitCode?: number) => void,
): Promise<SandboxTerminalSession> {
  const target = url("v1/terminals", config.baseUrl);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, {
      headers: config.headers,
      handshakeTimeout: 15000,
      maxPayload: 1024 * 1024,
    });
    let ready = false;
    let exited = false;
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Sandbox terminal timed out"));
    }, 15000);
    const reportExit = (code?: number) => {
      if (!exited) {
        exited = true;
        onExit(code);
      }
    };
    ws.once("open", () =>
      ws.send(
        JSON.stringify({
          type: "open",
          instanceId,
          envs,
          allowedDomains,
          size,
        }),
      ),
    );
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        onData(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ready" && !ready) {
          ready = true;
          clearTimeout(timeout);
          resolve({
            sendInput: async (input) => {
              if (ws.readyState !== WebSocket.OPEN)
                throw new Error("Sandbox terminal closed");
              ws.send(JSON.stringify({ type: "input", data: input }));
            },
            resize: async (next) => {
              if (ws.readyState !== WebSocket.OPEN)
                throw new Error("Sandbox terminal closed");
              ws.send(JSON.stringify({ type: "resize", ...next }));
            },
            close: async () => {
              if (ws.readyState === WebSocket.CLOSED) return;
              await new Promise<void>((done, fail) => {
                let confirmed = false;
                const onMessage = (data: RawData, isBinary: boolean) => {
                  if (isBinary) return;
                  try {
                    const message = JSON.parse(data.toString());
                    if (message.type === "closed") confirmed = true;
                  } catch {
                    /* Other messages are handled by the main listener. */
                  }
                };
                const timer = setTimeout(() => {
                  ws.terminate();
                  fail(new Error("Sandbox terminal cleanup timed out"));
                }, 30000);
                timer.unref();
                ws.on("message", onMessage);
                ws.once("close", () => {
                  clearTimeout(timer);
                  ws.off("message", onMessage);
                  if (confirmed) done();
                  else
                    fail(
                      new Error(
                        "Sandbox terminal closed before cleanup completed",
                      ),
                    );
                });
                if (ws.readyState === WebSocket.OPEN)
                  ws.send(JSON.stringify({ type: "close" }));
              });
            },
          });
        } else if (message.type === "exit")
          reportExit(
            typeof message.exitCode === "number" ? message.exitCode : undefined,
          );
        else if (message.type === "error" && !ready) {
          clearTimeout(timeout);
          reject(new Error("Sandbox terminal failed"));
        }
      } catch {
        if (!ready) {
          clearTimeout(timeout);
          ws.terminate();
          reject(new Error("Invalid sandbox terminal response"));
        }
      }
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      if (!ready) reject(new Error("Sandbox terminal connection failed"));
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      if (ready) reportExit();
      else reject(new Error("Sandbox terminal closed before ready"));
    });
  });
}

export interface SandboxApiConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

export function createSandboxApiProvider(
  provider: string,
  connection: SandboxApiConfig,
): Sandbox {
  const send = (path: string, init: RequestInit = {}) =>
    request(path, init, connection);
  const instancePath = (instanceId: string) =>
    `v1/instances/${encodeURIComponent(instanceId)}`;
  return {
    sandboxType: provider,
    isAvailable: async () => true,
    executeCommandWithOpenNetwork: async (
      instanceId,
      envs,
      allowedDomains,
      command,
    ) =>
      (
        await send(
          `${instancePath(instanceId)}/commands/open-network`,
          json("POST", { envs, allowedDomains, command }),
        )
      ).json(),
    createTerminalSession: (
      instanceId,
      envs,
      allowedDomains,
      size,
      onData,
      onExit,
    ) =>
      terminalSocket(
        connection,
        instanceId,
        envs,
        allowedDomains,
        size,
        onData,
        onExit,
      ),
    getBashSandbox: async (instanceId, envs, allowedDomains, initCommands) => {
      let actualInstanceId = instanceId;
      let createdInstanceId: string | null = null;
      if (actualInstanceId) {
        await send(
          `${instancePath(actualInstanceId)}/configure`,
          json("POST", { envs, allowedDomains }),
        );
      } else {
        const response = await send(
          "v1/instances",
          json("POST", { envs, allowedDomains, initCommands }),
        );
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("instanceId" in result) ||
          typeof result.instanceId !== "string" ||
          !result.instanceId
        )
          throw new Error("Invalid sandbox API instance response");
        actualInstanceId = result.instanceId;
        createdInstanceId = result.instanceId;
      }
      const path = instancePath(actualInstanceId);
      const file = (filePath: string) =>
        `${path}/file?${new URLSearchParams({ path: filePath })}`;
      const sandbox: BashSandboxExtended = {
        executeCommand: async (command) =>
          (
            await send(
              `${path}/commands`,
              json("POST", { envs, allowedDomains, command }),
            )
          ).json(),
        readFile: async (filePath) => (await send(file(filePath))).text(),
        readFileBinaryStream: async function* (filePath) {
          const response = await send(file(filePath));
          if (!response.body) return;
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
        },
        writeFiles: async (files) => {
          for (const item of files) {
            const bytes =
              typeof item.content === "string"
                ? Buffer.from(item.content)
                : Buffer.from(item.content);
            await send(file(item.path), {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: bytes,
            });
          }
        },
      };
      return { createdInstanceId, sandbox };
    },
    destroySandbox: async (instanceId) => {
      await send(instancePath(instanceId), { method: "DELETE" });
    },
  };
}
