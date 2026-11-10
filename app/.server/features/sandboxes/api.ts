import WebSocket, { type RawData } from "ws";
import type {
  BashSandboxExtended,
  Sandbox,
  SandboxTerminalSession,
  TerminalSize,
} from ".";

function endpoint(): URL {
  const raw = process.env.SANDBOX_API_URL;
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

function authorization(): Record<string, string> {
  const token = process.env.SANDBOX_API_TOKEN;
  if (!token) throw new Error("Sandbox API token is not configured");
  return { Authorization: `Bearer ${token}` };
}

function url(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), endpoint());
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(authorization()))
    headers.set(name, value);
  const response = await fetch(url(path), {
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

export async function listSandboxApiProviders(): Promise<string[]> {
  if (!process.env.SANDBOX_API_URL || !process.env.SANDBOX_API_TOKEN) return [];
  try {
    const response = await request("v1/providers", {
      signal: AbortSignal.timeout(5000),
    });
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("providers" in data) ||
      !Array.isArray(data.providers) ||
      !data.providers.every((name: unknown) => typeof name === "string")
    )
      throw new Error("Invalid sandbox provider list");
    return data.providers;
  } catch {
    return [];
  }
}

function terminalSocket(
  provider: string,
  instanceId: string,
  envs: Record<string, string>,
  allowedDomains: string[],
  size: TerminalSize,
  onData: (data: Uint8Array) => void,
  onExit: (exitCode?: number) => void,
): Promise<SandboxTerminalSession> {
  const target = url("v1/terminals");
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, {
      headers: authorization(),
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
          provider,
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

export function createSandboxApiProvider(provider: string): Sandbox {
  const instancePath = (instanceId: string) =>
    `v1/instances/${encodeURIComponent(instanceId)}`;
  return {
    sandboxType: provider,
    isAvailable: async () =>
      (await listSandboxApiProviders()).includes(provider),
    executeCommandWithOpenNetwork: async (
      instanceId,
      envs,
      allowedDomains,
      command,
    ) =>
      (
        await request(
          `${instancePath(instanceId)}/commands/open-network`,
          json("POST", { provider, envs, allowedDomains, command }),
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
        provider,
        instanceId,
        envs,
        allowedDomains,
        size,
        onData,
        onExit,
      ),
    getBashSandbox: async (instanceId, envs, allowedDomains, initCommands) => {
      const response = await request(
        "v1/sessions",
        json("POST", {
          provider,
          instanceId,
          envs,
          allowedDomains,
          initCommands,
        }),
      );
      const opened: unknown = await response.json();
      if (
        !opened ||
        typeof opened !== "object" ||
        !("sessionId" in opened) ||
        typeof opened.sessionId !== "string" ||
        !("createdInstanceId" in opened) ||
        (opened.createdInstanceId !== null &&
          typeof opened.createdInstanceId !== "string")
      )
        throw new Error("Invalid sandbox API session response");
      const path = `v1/sessions/${encodeURIComponent(opened.sessionId)}`;
      const file = (filePath: string) =>
        `${path}/file?${new URLSearchParams({ path: filePath })}`;
      const sandbox: BashSandboxExtended = {
        executeCommand: async (command) =>
          (await request(`${path}/commands`, json("POST", { command }))).json(),
        readFile: async (filePath) => (await request(file(filePath))).text(),
        readFileBinaryStream: async function* (filePath) {
          const response = await request(file(filePath));
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
            await request(file(item.path), {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: bytes,
            });
          }
        },
        release: async () => {
          await request(path, {
            method: "DELETE",
            signal: AbortSignal.timeout(5000),
          });
        },
      };
      return { createdInstanceId: opened.createdInstanceId, sandbox };
    },
    destroySandbox: async (instanceId) => {
      await request(instancePath(instanceId), json("DELETE", { provider }));
    },
  };
}
