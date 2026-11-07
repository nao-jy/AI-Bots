import type { Attachment, Chat, Thread } from "chat";
import { createChatTools } from "chat/ai";
import {
  generateFileHandle,
  toBuffer,
  type FileHandleReaderMap,
} from "./helpers/file-handle";
import { tool } from "ai";
import z from "zod";
import { t } from "~/.server/i18n";

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
      description: t("server.uploadFileToChatDescription"),
      inputSchema: z.object({
        fileHandle: z.string().describe(t("server.fileHandle")),
        filename: z.string().describe(t("server.filenameForUpload")),
      }),
      execute: async ({ fileHandle, filename }) => {
        try {
          const fileInfo = fileHandles.get(fileHandle);
          if (fileInfo === undefined) {
            return { error: t("server.fileNotRegistered") };
          }
          const data = await toBuffer(fileInfo.stream());

          await chat.thread(thread.id).post({
            markdown: "",
            files: [{ data, filename }],
          });

          return { success: true, filename, threadId: thread.id };
        } catch (error) {
          return {
            error: t("server.chatFileOperationFailed", {
              0: error instanceof Error ? error.message : String(error),
            }),
          };
        }
      },
    }),
    getFileHandleFromAttachment: tool({
      description: t("server.getFileHandleFromAttachmentDescription"),
      inputSchema: z.object({
        messageId: z.string().min(1).describe(t("server.messageId")),
        attachmentIndex: z
          .number()
          .min(0)
          .describe(t("server.attachmentIndex")),
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
            throw new Error(t("server.attachmentNotFound"));
          }

          const selectedAttachment = attachment;
          const reader = async function* (): AsyncGenerator<
            Uint8Array<ArrayBufferLike>
          > {
            const data = await selectedAttachment.fetchData?.();
            if (data === undefined) {
              throw new Error(t("server.attachmentFetchFailed"));
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
          return {
            error: t("server.chatFileOperationFailed", {
              0: error instanceof Error ? error.message : String(error),
            }),
          };
        }
      },
    }),
  };
}
