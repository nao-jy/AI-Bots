import type { Chat } from "chat";
import { createBashTool } from "bash-tool";
import { tool } from "ai";
import { z } from "zod";
import { type BashSandboxExtended } from "./sandboxes";

export async function getSandboxTools(
  bashSandbox: BashSandboxExtended,
  chat: Chat,
  threadId: string,
) {
  const { tools } = await createBashTool({
    sandbox: bashSandbox,
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
        const stream = await bashSandbox.readFileBinaryStream(path);
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
