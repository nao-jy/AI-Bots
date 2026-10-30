import { tool } from "ai";
import { z } from "zod";
import {
  extract,
  ExtractInputKind,
  type ExtractionConfig,
} from "@xberg-io/xberg";
import dns from "node:dns/promises";
import net from "node:net";

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

export function getDocumentParseTools(
  ocrLanguages: string[],
  attachments: Map<string, AttachmentData>,
) {
  const config: ExtractionConfig = {
    outputFormat: "markdown",
    ocr: {
      language: ocrLanguages,
    },
  };

  const documentParseFromUri = tool({
    description: "Webコンテンツをフェッチしてパースします",
    inputSchema: z.object({
      uri: z.string().min(1).describe("uri"),
    }),
    execute: async ({ uri }) => {
      try {
        const u = await assertPublicUrl(uri);
        const result = await extract(
          {
            kind: ExtractInputKind.Uri,
            uri: u.toString(),
          },
          config,
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

  const documentParseFromAttachment = tool({
    description:
      "会話に添付されたPDF、Office文書、画像などを解析し、Markdownを返します。",
    inputSchema: z.object({
      attachmentId: z.string().min(1).describe("解析対象の添付ファイルID"),
    }),

    execute: async ({ attachmentId }) => {
      try {
        const attachment = attachments.get(attachmentId);
        if (attachment === undefined) {
          throw new Error("attachment not found");
        }
        const result = await extract(
          {
            kind: ExtractInputKind.Bytes,
            bytes: attachment.data,
            mimeType: attachment.mimeType,
            filename: attachment.filename,
          },
          config,
        );

        const doc = result.results?.[0];

        if (!doc) {
          throw new Error("No document was extracted");
        }
        return {
          filename: attachment.filename,
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
    fronUri: documentParseFromUri,
    fromAttachment: documentParseFromAttachment,
  };
}
