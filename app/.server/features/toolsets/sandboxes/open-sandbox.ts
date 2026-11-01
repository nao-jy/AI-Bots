import { logger } from "~/.server/logger";
import { type BashSandboxExtended, type Sandbox } from ".";
import {
  ConnectionConfig,
  Sandbox as OpenSandbox,
} from "@alibaba-group/opensandbox";
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
