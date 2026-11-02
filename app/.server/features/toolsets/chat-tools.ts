import type { Attachment, Chat, Thread } from "chat";
import { createChatTools } from "chat/ai";
import {
  generateFileHandle,
  toBuffer,
  type FileHandleReaderMap,
} from "./helpers/file-handle";
import { tool } from "ai";
import z from "zod";

const MAX_PAGINATION = 5;

export function getChatTools(
  chat: Chat,
  adapterPlatform: string,
  thread: Thread<Record<string, unknown>, unknown>,
  fileHandles: FileHandleReaderMap,
) {
  const adapter = chat.getAdapter(adapterPlatform);
  const tools = createChatTools({
    chat,
    preset: "messenger",
    requireApproval: false,
    scope: thread,
    strictScope: true,
  });
  return {
    ...tools,
    uploadFileToChat: tool({
      description: "Upload a file from file handle.",
      inputSchema: z.object({
        fileHandle: z.string().describe("file handle"),
        filename: z.string().describe("file name for upload"),
      }),
      execute: async ({ fileHandle, filename }) => {
        try {
          const fileInfo = fileHandles.get(fileHandle);
          if (fileInfo === undefined) {
            return { succes: false, message: "file not registered" };
          }
          const data = await toBuffer(fileInfo.stream());

          await chat.thread(thread.id).post({
            markdown: "",
            files: [{ data, filename }],
          });

          return { success: true, filename, threadId: thread.id };
        } catch (error) {
          throw new Error(
            `failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    }),
    getFileHandleFromAttachment: tool({
      description: "Get file handle from attachment.",
      inputSchema: z.object({
        messageId: z.string().min(1).describe("メッセージID"),
        attachmentIndex: z
          .number()
          .min(0)
          .describe("アタッチメントのインデックス"),
      }),
      execute: async ({ messageId, attachmentIndex }) => {
        try {
          let attachment: null | Attachment = null;
          const message = await adapter.fetchMessage?.(thread.id, messageId);
          if (message) {
            attachment = message.attachments.at(attachmentIndex) ?? null;
          } else {
            let cursor = undefined;
            for (let i = 0; i < MAX_PAGINATION; i++) {
              const result = await adapter.fetchMessages(thread.id, {
                cursor: cursor,
              });
              cursor = result.nextCursor;

              const messages = result.messages;
              for (const mes of messages) {
                if (mes.id === messageId) {
                  attachment = mes.attachments.at(attachmentIndex) ?? null;
                  i = MAX_PAGINATION;
                  break;
                }
              }
            }
          }

          if (attachment === null) {
            throw new Error("attachment not found");
          }

          const selectedAttachment = attachment;
          const reader = async function* (): AsyncGenerator<
            Uint8Array<ArrayBufferLike>
          > {
            const data = await selectedAttachment.fetchData?.();
            if (data === undefined) {
              throw new Error("data fetch failed");
            }
            yield data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          };

          const handle = generateFileHandle();
          fileHandles.set(handle, {
            stream: reader,
            filename: selectedAttachment.name,
            mimeType: selectedAttachment.mimeType,
          });

          return { success: true, fileHandle: handle, threadId: thread.id };
        } catch (error) {
          throw new Error(
            `failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    }),
  };
}
