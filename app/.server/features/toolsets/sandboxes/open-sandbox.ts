import { logger } from "~/.server/logger";
import { type BashSandboxExtended, type Sandbox } from ".";
import {
  ConnectionConfig,
  Sandbox as OpenSandbox,
} from "@alibaba-group/opensandbox";

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
    try {
      const sandbox = await OpenSandbox.create({
        connectionConfig: getConfig(),
        timeoutSeconds: null,
        image: "ubuntu",
      });
      await sandbox.kill();
    } catch (error) {
      logger.error(error);
      return false;
    }
    return true;
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
      createdInstanceId = sandbox.id;
    }

    if (sandbox === null) {
      throw new Error("sandbox creation failed!");
    }

    const current = await sandbox.getEgressPolicy();
    if (current.egress !== undefined) {
      const targets = current.egress
        .map((rule) => rule.target)
        .filter((t) => t !== undefined);
      await sandbox.deleteEgressRules(targets);
    }
    await sandbox.patchEgressRules(
      allowedDomains.map((target) => ({ action: "allow" as const, target })),
    );

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
