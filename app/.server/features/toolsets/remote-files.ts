import { tool } from "ai";
import { isUtf8 } from "node:buffer";
import { Operator, type Metadata } from "opendal";
import z from "zod";
import type { ToolSet, ToolSetFactory } from ".";
import { ReservedParams } from "./helpers/reserved-params";
import { getAccessToken } from "~/.server/repository/oauth";
import {
  generateFileHandle,
  type FileHandleReaderMap,
} from "./helpers/file-handle";

const MAX_READ_SIZE = 1024 * 1024;
const DEFAULT_READ_SIZE = 256 * 1024;

async function getSchema(userId: number) {
  const schema = z.object({
    service: z
      .string()
      .meta({
        title: "OpenDALサービス名",
      })
      .describe(
        "service name of OpenDAL. see https://opendal.apache.org/services/",
      ),
    configuration: z
      .array(z.object({ key: z.string(), value: z.string() }))
      .meta({
        title: "OpenDALサービスの設定",
      })
      .describe("configuration of service"),
    ...(await ReservedParams.getAuthIdSchema(userId)),
  });
  return schema;
}

function serializeMetadata(metadata: Metadata) {
  const contentLength = metadata.contentLength;
  return {
    isDirectory: metadata.isDirectory(),
    isFile: metadata.isFile(),
    contentLength: contentLength === null ? null : contentLength.toString(),
    contentType: metadata.contentType,
    lastModified: metadata.lastModified,
    etag: metadata.etag,
    contentEncoding: metadata.contentEncoding,
    cacheControl: metadata.cacheControl,
  };
}

export async function getToolSetFactory(userId: number) {
  const schema = await getSchema(userId);
  const ret: ToolSetFactory = {
    name: "remote-files-opendal",
    getToolSetContextSchema: () => {
      return schema.toJSONSchema({ target: "draft-7" });
    },
    validateContext: (value: unknown) => {
      return schema.validate(value);
    },
    getToolSet: (fileHandles: FileHandleReaderMap) => {
      const ret: ToolSet = {
        getTools: async (toolSetCtx: Record<string, unknown>) => {
          const args = schema.parse(toolSetCtx);
          const accessToken =
            args.authId !== null ? await getAccessToken(args.authId) : null;
          let config = args.configuration.map(
            ({ key, value }) => [key, value] as const,
          );
          if (accessToken !== null) {
            config = [...config, ["access_token", accessToken]];
          }
          const operator = new Operator(
            args.service,
            Object.fromEntries(config),
          );

          return {
            [`listRemoteFiles_${args.service}`]: tool({
              description:
                "リモートファイルソースの指定したパス直下または配下のファイル・ディレクトリを一覧します。",
              inputSchema: z.object({
                path: z.string().default("").describe("一覧を取得するパス"),
                recursive: z
                  .boolean()
                  .default(false)
                  .describe("配下を再帰的に一覧するか"),
                limit: z
                  .number()
                  .int()
                  .min(1)
                  .max(1000)
                  .default(100)
                  .describe("取得する最大件数（1〜1000）"),
                startAfter: z
                  .string()
                  .optional()
                  .describe("このパスより後から一覧を続ける場合の開始位置"),
              }),
              execute: async ({ path, recursive, limit, startAfter }) => {
                const entries = await operator.list(path, {
                  recursive,
                  limit,
                  startAfter,
                });
                return entries.map((entry) => ({
                  path: entry.path(),
                  name: entry.name(),
                  ...serializeMetadata(entry.metadata()),
                }));
              },
            }),
            getRemoteFileHandle: tool({
              description:
                "リモートファイルを他のファイルツールで扱うためのハンドルを取得します。",
              inputSchema: z.object({
                path: z
                  .string()
                  .min(1)
                  .describe("ハンドルを作成するファイルのパス"),
              }),
              execute: async ({ path }) => {
                const metadata = await operator.stat(path);
                if (!metadata.isFile()) {
                  throw new Error(`Not a remote file: ${path}`);
                }

                const filename = path.split("/").filter(Boolean).at(-1) ?? path;
                const handle = generateFileHandle();
                fileHandles.set(handle, {
                  stream: async function* () {
                    const reader = await operator.reader(path);
                    for await (const chunk of reader.createReadStream()) {
                      if (!(chunk instanceof Uint8Array)) {
                        throw new Error(
                          `Remote file reader returned non-binary data: ${path}`,
                        );
                      }
                      yield new Uint8Array(
                        chunk.buffer,
                        chunk.byteOffset,
                        chunk.byteLength,
                      );
                    }
                  },
                  filename,
                  mimeType: metadata.contentType ?? undefined,
                });

                return {
                  success: true,
                  fileHandle: handle,
                  filename,
                  ...serializeMetadata(metadata),
                };
              },
            }),
            [`readRemoteFileAsText_${args.service}`]: tool({
              description:
                "リモートファイルを指定バイト範囲で読み込みます。テキストはUTF-8、その他のデータはBase64で返します。",
              inputSchema: z.object({
                path: z.string().min(1).describe("読み込むファイルのパス"),
                offset: z
                  .number()
                  .int()
                  .min(0)
                  .default(0)
                  .describe("読み込み開始位置（バイト）"),
                size: z
                  .number()
                  .int()
                  .min(1)
                  .max(MAX_READ_SIZE)
                  .default(DEFAULT_READ_SIZE)
                  .describe("読み込む最大サイズ（1〜1048576バイト）"),
              }),
              execute: async ({ path, offset, size }) => {
                const data = await operator.read(path, {
                  offset: BigInt(offset),
                  size: BigInt(size),
                });
                const isText = isUtf8(data);
                const content = data.toString(isText ? "utf8" : "base64");
                const encoding = isText ? "utf-8" : "base64";
                return {
                  path,
                  offset,
                  bytesRead: data.length,
                  encoding,
                  content,
                };
              },
            }),
            getRemoteFileMetadata: tool({
              description:
                "リモートファイルまたはディレクトリのメタデータを取得します。",
              inputSchema: z.object({
                path: z.string().min(1).describe("メタデータを取得するパス"),
              }),
              execute: async ({ path }) => {
                const metadata = await operator.stat(path);
                return { path, ...serializeMetadata(metadata) };
              },
            }),
            remoteFileExists: tool({
              description: "リモートソース上のパスが存在するかを確認します。",
              inputSchema: z.object({
                path: z.string().min(1).describe("確認するパス"),
              }),
              execute: async ({ path }) => ({
                path,
                exists: await operator.exists(path),
              }),
            }),
          };
        },
      };
      return ret;
    },
  };
  return ret;
}
