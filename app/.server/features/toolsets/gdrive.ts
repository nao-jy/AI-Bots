import { tool } from "ai";
import z from "zod";
import type { ToolSetFactory } from ".";
import { getAccessToken } from "~/.server/repository/oauth";
import {
  generateFileHandle,
  type FileHandleReaderMap,
} from "./helpers/file-handle";
import {
  downloadGoogleDriveFile,
  getGoogleDriveFileMetadata,
  googleDriveFileExists,
  isGoogleDriveFolder,
  listGoogleDriveFiles,
  listGoogleDriveSharedFiles,
  searchGoogleDriveFiles,
} from "./helpers/gdrive";
import { ReservedParams } from "./helpers/reserved-params";

async function getSchema(userId: number) {
  return z.object({
    ...(await ReservedParams.getAuthIdOptionalSchema(userId)),
  });
}

function serializeMetadata(
  metadata: Awaited<ReturnType<typeof getGoogleDriveFileMetadata>>,
) {
  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    isDirectory: isGoogleDriveFolder(metadata.mimeType),
    isFile: Boolean(
      metadata.mimeType && !isGoogleDriveFolder(metadata.mimeType),
    ),
    contentLength: metadata.size ?? null,
    lastModified: metadata.modifiedTime ?? null,
    createdTime: metadata.createdTime ?? null,
    md5Checksum: metadata.md5Checksum ?? null,
    webViewLink: metadata.webViewLink ?? null,
    description: metadata.description ?? null,
    parents: metadata.parents ?? [],
    trashed: metadata.trashed ?? false,
  };
}

function requireAccessToken(
  accessToken: Awaited<ReturnType<typeof getAccessToken>> | null,
) {
  if (!accessToken) {
    throw new Error("Google Drive tools require an OAuth authentication.");
  }
  return accessToken;
}

export async function getToolSetFactory(userId: number) {
  const schema = await getSchema(userId);
  const ret: ToolSetFactory = {
    name: "gdrive",
    displayName: "Googleドライブ用リモートファイルツール",
    getToolSetContextSchema: () => schema.toJSONSchema({ target: "draft-7" }),
    validateContext: (value: unknown) => schema.validate(value),
    getTools: async (fileHandles: FileHandleReaderMap, context: unknown) => {
      const args = schema.parse(context);
      const accessToken =
        args.authId !== null && args.authId !== undefined
          ? await getAccessToken(args.authId)
          : null;
      const authName = accessToken?.name ? `_${accessToken.name}` : "";

      return {
        [`listGdrive_${authName}`]: tool({
          description:
            "Googleドライブ上のフォルダのファイル・フォルダを一覧します。再帰的に取得することも可能です。",
          inputSchema: z.object({
            folderId: z.string().min(1).describe("一覧を取得するフォルダのID"),
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
          execute: async ({ folderId, recursive, limit, startAfter }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              const files = await listGoogleDriveFiles({
                accessToken: token,
                folderId,
                recursive,
                limit,
                startAfter,
              });
              return files.map((file) => ({
                ...file,
                ...serializeMetadata(file),
              }));
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`listSharedGdrive_${authName}`]: tool({
          description:
            "Googleドライブで自分と共有されているファイル・フォルダを一覧します。共有フォルダの中身は通常の一覧ツールで取得してください。",
          inputSchema: z.object({
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
              .describe("この名前より後から一覧を続ける場合の開始位置"),
          }),
          execute: async ({ limit, startAfter }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              const files = await listGoogleDriveSharedFiles({
                accessToken: token,
                limit,
                startAfter,
              });
              return files.map((file) => ({
                ...file,
                ...serializeMetadata(file),
              }));
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`searchGdrive_${authName}`]: tool({
          description:
            "Google Drive APIの検索クエリ（q）でファイル・フォルダを検索します。Drive APIのq構文を使い、name contains、fullText contains、'<folderId>' in parents、modifiedTime、mimeType、sharedWithMeなどの条件を指定してください。複数条件はand/orで組み合わせられます。詳細な構文はGoogle Drive APIの仕様に従います。",
          inputSchema: z.object({
            q: z
              .string()
              .trim()
              .min(1)
              .describe("Google Drive APIの検索クエリ"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(1000)
              .default(100)
              .describe("取得する最大件数（1〜1000）"),
            pageToken: z
              .string()
              .optional()
              .describe("前回の検索結果に含まれる次ページトークン"),
          }),
          execute: async ({ q, limit, pageToken }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              const result = await searchGoogleDriveFiles({
                accessToken: token,
                q,
                limit,
                pageToken,
              });
              return {
                files: result.files.map((file) => ({
                  ...file,
                  ...serializeMetadata(file),
                })),
                nextPageToken: result.nextPageToken,
              };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`getGdriveFileHandle_${authName}`]: tool({
          description:
            "Googleドライブのファイル内容を参照するファイルハンドルを取得します。",
          inputSchema: z.object({
            fileId: z
              .string()
              .min(1)
              .describe("ハンドルを作成するファイルのID"),
          }),
          execute: async ({ fileId }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              const metadata = await getGoogleDriveFileMetadata({
                accessToken: token,
                fileId,
              });
              if (
                !metadata.mimeType ||
                isGoogleDriveFolder(metadata.mimeType)
              ) {
                throw new Error(`Not a Google Drive file: ${fileId}`);
              }

              const sourceFilename = metadata.name ?? fileId;
              const downloadedFile = await downloadGoogleDriveFile({
                accessToken: token,
                fileId,
                mimeType: metadata.mimeType,
                filename: sourceFilename,
              });
              const { filename, mimeType } = downloadedFile;
              const handle = generateFileHandle();

              fileHandles.set(handle, {
                stream: async function* () {
                  for await (const chunk of downloadedFile.stream) {
                    if (!(chunk instanceof Uint8Array)) {
                      throw new Error(
                        `Google Drive returned non-binary data: ${fileId}`,
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
                mimeType,
              });

              return {
                success: true,
                fileHandle: handle,
                filename,
                ...serializeMetadata(metadata),
                contentType: mimeType,
              };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`getGdriveFileMetadata_${authName}`]: tool({
          description:
            "Googleドライブ上のファイルまたはフォルダのメタデータを取得します。",
          inputSchema: z.object({
            fileOrFolderId: z
              .string()
              .min(1)
              .describe("メタデータを取得するファイルまたはフォルダのID"),
          }),
          execute: async ({ fileOrFolderId }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              const metadata = await getGoogleDriveFileMetadata({
                accessToken: token,
                fileId: fileOrFolderId,
              });
              return serializeMetadata(metadata);
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`gdriveFileExists_${authName}`]: tool({
          description:
            "Googleドライブ上のファイルまたはフォルダの存在を確認します。",
          inputSchema: z.object({
            fileOrFolderId: z
              .string()
              .min(1)
              .describe("存在を確認するファイルまたはフォルダのID"),
          }),
          execute: async ({ fileOrFolderId }) => {
            try {
              const { accessToken: token } = requireAccessToken(accessToken);
              return {
                fileOrFolderId,
                exists: await googleDriveFileExists({
                  accessToken: token,
                  fileId: fileOrFolderId,
                }),
              };
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
