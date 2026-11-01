import { logger } from "~/.server/logger";
import {
  type BashSandboxExtended,
  type Sandbox,
  type TerminalSize,
} from ".";
import {
  ConnectionConfig,
  Sandbox as OpenSandbox,
} from "@alibaba-group/opensandbox";
import WebSocket, { type RawData } from "ws";
import {
  createLifecycleClient,
  createRedirectSafeFetch,
} from "@alibaba-group/opensandbox/internal";

function getConfig() {
  const config = new ConnectionConfig({
    domain: process.env.OPEN_SANDBOX_DOMAIN,
    apiKey: process.env.OPEN_SANDBOX_API_KEY,
    useServerProxy: true,
  });
  return config;
}

function terminalCommand(envs: Record<string, string>) {
  const assignments = Object.entries(envs).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error(`無効な環境変数名です: ${key}`);
    return `${key}='${value.replace(/'/g, "'\\''")}'`;
  });
  return `exec env ${[...assignments, "bash", "-i"].join(" ")}`;
}

function appendEndpointPath(endpoint: string, pathname: string) {
  const url = new URL(`${getConfig().protocol}://${endpoint}`);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${pathname}`;
  return url;
}

function getWebSocketUrl(endpoint: string, pathname: string) {
  const url = appendEndpointPath(endpoint, pathname);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

export const OPEN_SANDBOX: Sandbox = {
  sandboxType: "OpenSandbox",
  isAvailable: async () => {
    return Boolean(process.env.OPEN_SANDBOX_DOMAIN);
  },
  executeCommandWithOpenNetwork: async (
    instanceId,
    envs,
    _allowedDomains,
    command,
  ) => {
    const sandbox = await OpenSandbox.connect({
      connectionConfig: getConfig(),
      sandboxId: instanceId,
    });
    const connection = sandbox.connectionConfig;
    const baseUrl = connection.getBaseUrl();
    const lifecycle = createLifecycleClient({
      baseUrl,
      apiKey: connection.apiKey,
      headers: connection.headers,
      fetch: createRedirectSafeFetch(
        baseUrl,
        connection.fetch,
        {
          overallTimeoutMs: connection.requestTimeoutSeconds * 1_000,
        },
      ),
    });
    const path = { sandboxId: instanceId };
    const current = await lifecycle.GET(
      "/sandboxes/{sandboxId}/networkpolicy",
      { params: { path } },
    );
    if (current.error || !current.response.ok)
      throw new Error(
        `ネットワークポリシーを取得できませんでした (HTTP ${current.response.status})`,
      );
    const previousPolicy = current.data.policy;
    if (!previousPolicy)
      throw new Error("現在のネットワークポリシーを取得できませんでした。");

    const opened = await lifecycle.PUT(
      "/sandboxes/{sandboxId}/networkpolicy",
      {
        params: { path },
        body: { defaultAction: "allow", egress: [] },
      },
    );
    if (opened.error || !opened.response.ok)
      throw new Error(
        `シェル用のネットワークポリシーを設定できませんでした (HTTP ${opened.response.status})`,
      );
    try {
      const result = await sandbox.commands.run(command, { envs });
      return {
        stdout: result.logs.stdout.map((entry) => entry.text).join("\n"),
        stderr: result.logs.stderr.map((entry) => entry.text).join("\n"),
        exitCode: result.exitCode ?? 0,
      };
    } finally {
      const restored = await lifecycle.PUT(
        "/sandboxes/{sandboxId}/networkpolicy",
        {
          params: { path },
          body: previousPolicy,
        },
      );
      if (restored.error || !restored.response.ok)
        throw new Error(
          `元のネットワークポリシーを復元できませんでした (HTTP ${restored.response.status})`,
        );
    }
  },
  createTerminalSession: async (
    instanceId,
    envs,
    _allowedDomains,
    size,
    onData,
    onExit,
  ) => {
    const sandbox = await OpenSandbox.connect({
      connectionConfig: getConfig(),
      sandboxId: instanceId,
    });
    const connection = sandbox.connectionConfig;
    const baseUrl = connection.getBaseUrl();
    const lifecycle = createLifecycleClient({
      baseUrl,
      apiKey: connection.apiKey,
      headers: connection.headers,
      fetch: createRedirectSafeFetch(
        baseUrl,
        connection.fetch,
        {
          overallTimeoutMs: connection.requestTimeoutSeconds * 1_000,
        },
      ),
    });
    const path = { sandboxId: instanceId };
    const current = await lifecycle.GET(
      "/sandboxes/{sandboxId}/networkpolicy",
      { params: { path } },
    );
    if (current.error || !current.response.ok || !current.data.policy)
      throw new Error(
        `ネットワークポリシーを取得できませんでした (HTTP ${current.response.status})`,
      );
    const previousPolicy = current.data.policy;
    const opened = await lifecycle.PUT(
      "/sandboxes/{sandboxId}/networkpolicy",
      {
        params: { path },
        body: { defaultAction: "allow", egress: [] },
      },
    );
    if (opened.error || !opened.response.ok)
      throw new Error(
        `シェル用のネットワークポリシーを設定できませんでした (HTTP ${opened.response.status})`,
      );

    let ptySessionId: string | null = null;
    let socket: WebSocket | null = null;
    let closed = false;
    let restored = false;
    async function restoreNetworkPolicy() {
      if (restored) return;
      restored = true;
      const result = await lifecycle.PUT(
        "/sandboxes/{sandboxId}/networkpolicy",
        { params: { path }, body: previousPolicy },
      );
      if (result.error || !result.response.ok)
        throw new Error(
          `元のネットワークポリシーを復元できませんでした (HTTP ${result.response.status})`,
        );
    }

    try {
      const endpoint = await sandbox.getEndpoint(44772);
      const ptyEndpoint = appendEndpointPath(endpoint.endpoint, "/pty");
      const response = await fetch(ptyEndpoint, {
        method: "POST",
        headers: {
          ...endpoint.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: terminalCommand(envs) }),
      });
      if (!response.ok)
        throw new Error(
          `PTYセッションを作成できませんでした (HTTP ${response.status})`,
        );
      const created: unknown = await response.json();
      if (
        !created ||
        typeof created !== "object" ||
        !("session_id" in created) ||
        typeof created.session_id !== "string"
      ) {
        throw new Error("PTYセッションの応答形式が不正です。");
      }
      ptySessionId = created.session_id;

      socket = await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(
          getWebSocketUrl(endpoint.endpoint, `/pty/${ptySessionId}/ws`),
          { headers: endpoint.headers },
        );
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error("PTY WebSocket接続がタイムアウトしました。"));
        }, 15_000);
        const handleInitialMessage = (data: RawData, isBinary: boolean) => {
          if (isBinary) return;
          let message: { type?: string; message?: string };
          try {
            message = JSON.parse(data.toString()) as {
              type?: string;
              message?: string;
            };
          } catch {
            return;
          }
          if (message.type === "connected") {
            clearTimeout(timeout);
            ws.off("message", handleInitialMessage);
            resolve(ws);
          } else if (message.type === "error") {
            clearTimeout(timeout);
            ws.off("message", handleInitialMessage);
            reject(new Error(message.message ?? "PTY接続に失敗しました。"));
          }
        };
        ws.on("message", handleInitialMessage);
        ws.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        ws.once("close", (code) => {
          clearTimeout(timeout);
          if (ws !== socket)
            reject(new Error(`PTY接続が閉じられました (code: ${code})`));
        });
      });
      const activeSocket = socket;
      activeSocket.on("close", () => onExit());
      activeSocket.on("message", (data: RawData, isBinary: boolean) => {
        if (!isBinary) {
          try {
            const message = JSON.parse(data.toString()) as {
              type?: string;
              exit_code?: number;
            };
            if (message.type === "exit") {
              onData(
                new TextEncoder().encode(
                  `\r\n[PTY exited with code ${message.exit_code ?? "unknown"}]\r\n`,
                ),
              );
              onExit(message.exit_code);
            }
          } catch (error) {
            logger.warn("Invalid OpenSandbox PTY message", { error, instanceId });
          }
          return;
        }
        const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (frame[0] === 0x01) onData(frame.subarray(1));
      });
      activeSocket.send(JSON.stringify({ type: "resize", ...size }));

      return {
        sendInput: async (data: string) => {
          if (activeSocket.readyState !== WebSocket.OPEN)
            throw new Error("PTY接続が閉じています。");
          activeSocket.send(
            Buffer.concat([Buffer.from([0x00]), Buffer.from(data)]),
          );
        },
        resize: async (nextSize: TerminalSize) => {
          if (activeSocket.readyState !== WebSocket.OPEN)
            throw new Error("PTY接続が閉じています。");
          activeSocket.send(
            JSON.stringify({ type: "resize", ...nextSize }),
          );
        },
        close: async () => {
          if (closed) return;
          closed = true;
          activeSocket.close();
          try {
            if (ptySessionId) {
              const ptyUrl = appendEndpointPath(
                endpoint.endpoint,
                `/pty/${ptySessionId}`,
              );
              const deleted = await fetch(ptyUrl, {
                method: "DELETE",
                headers: endpoint.headers,
              });
              if (!deleted.ok && deleted.status !== 404)
                throw new Error(
                  `PTYセッションを終了できませんでした (HTTP ${deleted.status})`,
                );
            }
          } finally {
            await restoreNetworkPolicy();
          }
        },
      };
    } catch (error) {
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      try {
        if (ptySessionId) {
          const endpoint = await sandbox.getEndpoint(44772);
          const ptyUrl = appendEndpointPath(
            endpoint.endpoint,
            `/pty/${ptySessionId}`,
          );
          await fetch(ptyUrl, { method: "DELETE", headers: endpoint.headers });
        }
      } finally {
        await restoreNetworkPolicy();
      }
      throw error;
    }
  },
  getBashSandbox: async (
    instanceId: string | null,
    envs: Record<string, string>,
    allowedDomains: string[],
  ) => {
    let sandbox: OpenSandbox | null = null;
    let createdInstanceId: string | null = null;
    if (instanceId !== null) {
      sandbox = await OpenSandbox.connect({
        connectionConfig: getConfig(),
        sandboxId: instanceId,
      });
    }
    if (sandbox === null) {
      sandbox = await OpenSandbox.create({
        connectionConfig: getConfig(),
        image: "ubuntu",
        timeoutSeconds: null,
        networkPolicy: {
          defaultAction: "deny",
          egress: [],
        },
      });
      logger.info("instance created", { instanceId: sandbox.id });
      createdInstanceId = sandbox.id;
    }

    if (sandbox === null) {
      throw new Error("sandbox creation failed!");
    }

    const current = await sandbox.getEgressPolicy();
    if (current.egress !== undefined && current.egress.length > 0) {
      const targets = current.egress
        .map((rule) => rule.target)
        .filter((t) => t !== undefined);
      await sandbox.deleteEgressRules(targets);
    }
    if (allowedDomains.length > 0) {
      await sandbox.patchEgressRules(
        allowedDomains.map((target) => ({ action: "allow" as const, target })),
      );
    }

    const bashSandbox: BashSandboxExtended = {
      async executeCommand(command) {
        const result = await sandbox.commands.run(command, { envs: envs });
        return {
          stdout: result.logs.stdout.at(0)?.text ?? "",
          stderr: result.logs.stderr.at(0)?.text ?? "",
          exitCode: result.exitCode ?? 0,
        };
      },
      async readFile(path) {
        return await sandbox.files.readFile(path);
      },
      readFileBinaryStream(path) {
        return sandbox.files.readBytesStream(path);
      },
      async writeFiles(files) {
        if (files.length === 0) return;

        await sandbox.files.writeFiles(
          files.map(({ path, content }) => {
            if (typeof content === "string") return { path, data: content };

            const data = new ArrayBuffer(content.byteLength);
            new Uint8Array(data).set(content);
            return { path, data };
          }),
        );
      },
    };
    return {
      createdInstanceId,
      sandbox: bashSandbox,
    };
  },

  destroySandbox: async (instanceId: string) => {
    const conn = await OpenSandbox.connect({ sandboxId: instanceId });
    await conn.kill();
  },
};
