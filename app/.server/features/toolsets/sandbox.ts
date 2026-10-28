import type { Chat } from "chat";
import { createBashTool } from "bash-tool";
import { tool } from "ai";
import { z } from "zod";
import { getSandboxInstance } from "~/.server/repository/sandboxes";
import { jsonbToStringRecord } from "~/.server/utils";
import { getSandbox } from "./sandboxes";

export async function getSandboxTools(
  sandboxInstanceId: string,
  chat: Chat,
  threadId: string,
) {
  const instance = await getSandboxInstance(sandboxInstanceId);
  if (instance === null) {
    throw new Error(`sandbox instance ${sandboxInstanceId} not found`);
  }
  const sbx = getSandbox(instance.sandbox.sandboxType);
  if (sbx === null) {
    throw new Error(`sandbox type ${instance.sandbox.sandboxType} not found`);
  }
  const info = await sbx.getBashSandbox(
    instance.instanceId,
    jsonbToStringRecord(instance.sandbox.envs),
    [...instance.sandbox.allowedDomainList],
  );
  const { tools } = await createBashTool({
    sandbox: info.sandbox,
  });

  return {
    ...tools,
    uploadFileToChat: tool({
      description:
        "Upload a file from the sandbox to a chat thread as an attachment.",
      inputSchema: z.object({
        path: z.string().describe("Path of the file inside the sandbox."),
      }),
      execute: async ({ path }) => {
        const stream = await info.sandbox.readFileBinaryStream(path);
        const data = await new Response(stream).arrayBuffer();
        const filename = path.split("/").filter(Boolean).at(-1) ?? path;

        await chat.thread(threadId).post({
          markdown: "",
          files: [{ data, filename }],
        });

        return { success: true, filename, threadId };
      },
    }),
  };
}
