import { type BashSandboxExtended, type Sandbox } from ".";
import { Sandbox as E2BSandbox } from "e2b";

export const E2B: Sandbox = {
  sandboxType: "e2b",

  getBashSandbox: async (
    instanceId: string | null,
    envs: Record<string, string>,
    allowedDomains: string[],
  ) => {
    let sandbox: E2BSandbox | null = null;
    let createdInstanceId: string | null = null;
    if (instanceId !== null) {
      sandbox = await E2BSandbox.connect(instanceId);
    }
    if (sandbox === null) {
      sandbox = await E2BSandbox.create();
      createdInstanceId = sandbox.sandboxId;
    }

    if (sandbox === null) {
      throw new Error("sandbox creation failed!");
    }

    await sandbox.updateNetwork({
      allowOut: allowedDomains,
      denyOut: ({ allTraffic }) => [allTraffic],
    });

    const bashSandbox: BashSandboxExtended = {
      async executeCommand(command) {
        const result = await sandbox.commands.run(command, { envs: envs });
        return result;
      },
      async readFile(path) {
        return await sandbox.files.read(path);
      },
      async readFileBinaryStream(path) {
        return await sandbox.files.read(path, { format: "stream" });
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
    await E2BSandbox.kill(instanceId);
  },
};
