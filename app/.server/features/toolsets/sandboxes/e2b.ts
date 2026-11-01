import { type BashSandboxExtended, type Sandbox } from ".";
import { Sandbox as E2BSandbox } from "e2b";

async function* toAsyncIterable(
  streamPromise: Promise<ReadableStream<Uint8Array>>,
): AsyncGenerator<Uint8Array> {
  const stream = await streamPromise;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export const E2B: Sandbox = {
  sandboxType: "E2B",
  isAvailable: async () => {
    return Boolean(process.env.E2B_API_KEY);
  },
  executeCommandWithOpenNetwork: async (
    instanceId,
    envs,
    allowedDomains,
    command,
  ) => {
    const sandbox = await E2BSandbox.connect(instanceId);
    await sandbox.updateNetwork({ allowInternetAccess: true });
    try {
      return await sandbox.commands.run(command, { envs });
    } finally {
      await sandbox.updateNetwork({
        allowOut: allowedDomains,
        denyOut: ({ allTraffic }) => [allTraffic],
      });
    }
  },
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
      sandbox = await E2BSandbox.create({
        lifecycle: {
          onTimeout: { action: "pause", mode: "filesystem" },
        },
      });
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
      readFileBinaryStream(path) {
        const stream = sandbox.files.read(path, { format: "stream" });
        return toAsyncIterable(stream);
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
