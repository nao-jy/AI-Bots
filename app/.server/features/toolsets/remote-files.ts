import { tool } from "ai";
import { Operator, type Metadata } from "opendal";
import z from "zod";
import type { ToolSetFactory } from ".";
import { ReservedParams } from "./helpers/reserved-params";
import { getAccessToken } from "~/.server/repository/oauth";
import {
  generateFileHandle,
  type FileHandleReaderMap,
} from "./helpers/file-handle";
import {
  exportGoogleWorkspaceFile,
  isGoogleWorkspaceFile,
} from "./helpers/gdrive";

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
    ...(await ReservedParams.getAuthIdOptionalSchema(userId)),
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
    displayName: "汎用リモートファイルツール（OpenDAL）",
    getToolSetContextSchema: () => {
      return schema.toJSONSchema({ target: "draft-7" });
    },
    validateContext: (value: unknown) => {
      return schema.validate(value);
    },
    getTools: async (fileHandles: FileHandleReaderMap, context: unknown) => {
      const args = schema.parse(context);
      const accessToken =
        args.authId !== null && args.authId !== undefined
          ? await getAccessToken(args.authId)
          : null;
      let config = args.configuration.map(
        ({ key, value }) => [key, value] as const,
      );
      if (accessToken !== null) {
        config = [...config, ["access_token", accessToken.accessToken]];
      }
      const operator = new Operator(args.service, Object.fromEntries(config));

      const authName = accessToken?.name ? `_${accessToken.name}` : "";

      return {
        [`listRemoteFiles_${args.service}${authName}`]: tool({
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
            try {
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
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`getRemoteFileHandle_${args.service}${authName}`]: tool({
          description: "リモートファイルのハンドルを取得します。",
          inputSchema: z.object({
            path: z
              .string()
              .min(1)
              .describe("ハンドルを作成するファイルのパス"),
          }),
          execute: async ({ path }) => {
            try {
              const metadata = await operator.stat(path);
              if (!metadata.isFile()) {
                throw new Error(`Not a remote file: ${path}`);
              }
              const sourceFilename =
                path.split("/").filter(Boolean).at(-1) ?? path;
              const sourceMimeType = metadata.contentType;
              let exportedFile:
                | Awaited<ReturnType<typeof exportGoogleWorkspaceFile>>
                | undefined;
              if (sourceMimeType && isGoogleWorkspaceFile(sourceMimeType)) {
                if (!accessToken) {
                  throw new Error(
                    "Google Workspace files require an OAuth authentication.",
                  );
                }
                exportedFile = await exportGoogleWorkspaceFile({
                  accessToken: accessToken.accessToken,
                  fileId: path,
                  mimeType: sourceMimeType,
                  filename: sourceFilename,
                });
              }
              const filename = exportedFile?.filename ?? sourceFilename;
              const mimeType = exportedFile?.mimeType ?? sourceMimeType;
              const handle = generateFileHandle();
              fileHandles.set(handle, {
                stream: async function* () {
                  const source = exportedFile
                    ? exportedFile.stream
                    : (await operator.reader(path)).createReadStream();
                  for await (const chunk of source) {
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
                mimeType: mimeType ?? undefined,
              });

              return {
                success: true,
                fileHandle: handle,
                filename,
                ...serializeMetadata(metadata),
                contentType: mimeType ?? null,
              };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`getRemoteFileMetadata_${args.service}${authName}`]: tool({
          description:
            "リモートファイルまたはディレクトリのメタデータを取得します。",
          inputSchema: z.object({
            path: z.string().min(1).describe("メタデータを取得するパス"),
          }),
          execute: async ({ path }) => {
            try {
              const metadata = await operator.stat(path);
              return { path, ...serializeMetadata(metadata) };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`remoteFileExists_${args.service}${authName}`]: tool({
          description: "リモートソース上のパスが存在するかを確認します。",
          inputSchema: z.object({
            path: z.string().min(1).describe("確認するパス"),
          }),
          execute: async ({ path }) => {
            try {
              return { path, exists: await operator.exists(path) };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
      };
    },
  };
  return ret;
}
