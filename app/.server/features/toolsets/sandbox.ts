import type { Chat } from "chat";
import { createBashTool } from "bash-tool";
import { tool } from "ai";
import { z } from "zod";
import { type BashSandboxExtended } from "./sandboxes";

async function toBuffer(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of source) {
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }

  return Buffer.concat(chunks);
}

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
        const stream = bashSandbox.readFileBinaryStream(path);
        const data = await toBuffer(stream);
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
