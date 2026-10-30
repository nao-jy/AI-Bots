import { tool } from "ai";
import { z } from "zod";
import { extract, ExtractInputKind } from "@xberg-io/xberg";
import dns from "node:dns/promises";
import net from "node:net";
import type { Adapter, Attachment, Chat } from "chat";

// SSRF
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return (
    v === "::" ||
    v === "::1" ||
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    v.startsWith("fe80")
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error("http/https only");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address)))
    throw new Error("private address blocked");
  return u;
}

export interface AttachmentData {
  filename: string;
  mimeType: string;
  data: Buffer;
}

const MAX_PAGINATION = 5;

export function getFileParseTools(chat: Chat, adapterPlatform: string) {
  const adapter = chat.getAdapter(adapterPlatform);
  const fileParseFromUri = tool({
    description: "Webコンテンツをフェッチしてパースします",
    inputSchema: z.object({
      uri: z.string().min(1).describe("uri"),
      ocrLanguages: z
        .array(z.string())
        .describe("tesseract ocr languages such as 'eng'"),
    }),
    execute: async ({ uri, ocrLanguages }) => {
      try {
        const u = await assertPublicUrl(uri);
        const result = await extract(
          {
            kind: ExtractInputKind.Uri,
            uri: u.toString(),
          },
          {
            outputFormat: "markdown",
            ocr: {
              language: ocrLanguages,
            },
          },
        );
        const doc = result.results?.[0];
        const document = {
          markdown: doc?.content ?? "",
          metadata: doc?.metadata,
          tables: doc?.tables ?? [],
        };
        return document;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  const fileParseFromAttachment = tool({
    description:
      "会話に添付されたPDF、Office文書、画像などを解析し、Markdownを返します。",
    inputSchema: z.object({
      threadId: z.string().min(1).describe("スレッドID"),
      messageId: z.string().min(1).describe("メッセージID"),
      attachmentIndex: z
        .number()
        .min(0)
        .describe("アタッチメントのインデックス"),
      ocrLanguages: z
        .array(z.string())
        .describe("tesseract ocr languages such as 'eng'"),
    }),

    execute: async ({ threadId, messageId, attachmentIndex, ocrLanguages }) => {
      try {
        let attachment: null | Attachment = null;
        const message = await adapter.fetchMessage?.(threadId, messageId);
        if (message) {
          attachment = message.attachments.at(attachmentIndex) ?? null;
        } else {
          let cursor = undefined;
          for (let i = 0; i < MAX_PAGINATION; i++) {
            const result = await adapter.fetchMessages(threadId, {
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
        const data = await attachment.fetchData?.();
        if (data === undefined) {
          throw new Error("data fetch failed");
        }

        const uint8Array: Uint8Array<ArrayBufferLike> =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

        const result = await extract(
          {
            kind: ExtractInputKind.Bytes,
            bytes: uint8Array,
            mimeType: attachment.mimeType,
            filename: attachment.name,
          },
          {
            outputFormat: "markdown",
            ocr: {
              language: ocrLanguages,
            },
          },
        );

        const doc = result.results?.[0];

        if (!doc) {
          throw new Error("No document was extracted");
        }
        return {
          filename: attachment.name,
          mimeType: doc.mimeType || attachment.mimeType,
          markdown: doc.content ?? "",
          metadata: doc.metadata,
          tables: doc.tables ?? [],
        };
      } catch (error) {
        throw new Error(
          `Document extraction failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  });

  return {
    fileParseFronUri: fileParseFromUri,
    fileParseFromAttachment: fileParseFromAttachment,
  };
}
