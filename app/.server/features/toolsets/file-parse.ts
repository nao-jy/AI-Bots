import { tool } from "ai";
import { z } from "zod";
import { extract, ExtractInputKind } from "@xberg-io/xberg";
import dns from "node:dns/promises";
import net from "node:net";
import type { Chat } from "chat";
import { toBuffer, type FileHandleReaderMap } from "./helpers/file-handle";
import { t } from "~/.server/i18n";

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
    throw new Error(t("server.httpOrHttpsOnly"));
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address)))
    throw new Error(t("server.privateAddressBlocked"));
  return u;
}

export interface AttachmentData {
  filename: string;
  mimeType: string;
  data: Buffer;
}

const MAX_PAGINATION = 5;

export function getFileParseTools(fileHandles: FileHandleReaderMap) {
  const parseFileFromUri = tool({
    description: t("server.webContentFetchToolDescription"),
    inputSchema: z.object({
      uri: z.string().min(1).describe(t("server.webContentUri")),
      ocrLanguages: z
        .array(z.string())
        .describe(t("server.ocrLanguages")),
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

  const parseFileFromHandle = tool({
      description: t("server.parseFileFromHandleDescription"),
    inputSchema: z.object({
      fileHandle: z.string().describe(t("server.fileHandle")),
      ocrLanguages: z
        .array(z.string())
        .describe(t("server.ocrLanguages")),
    }),

    execute: async ({ fileHandle, ocrLanguages }) => {
      try {
        const fileInfo = fileHandles.get(fileHandle);
        if (fileInfo === undefined) {
          throw new Error(t("server.fileNotRegistered"));
        }
        const data = await toBuffer(fileInfo.stream());

        const result = await extract(
          {
            kind: ExtractInputKind.Bytes,
            bytes: data,
            mimeType: fileInfo.mimeType,
            filename: fileInfo.filename,
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
          throw new Error(t("server.documentExtractionEmpty"));
        }
        return {
          filename: fileInfo.filename,
          mimeType: doc.mimeType || fileInfo.mimeType,
          markdown: doc.content ?? "",
          metadata: doc.metadata,
          tables: doc.tables ?? [],
        };
      } catch (error) {
        return {
          error: t("server.documentExtractionFailed", {
            0: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    },
  });

  return {
    parseFileFromUri: parseFileFromUri,
    parseFileFromHandle: parseFileFromHandle,
  };
}
