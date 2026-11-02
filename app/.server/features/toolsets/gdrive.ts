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
} from "./helpers/gdrive";
import { ReservedParams } from "./helpers/reserved-params";

async function getSchema(userId: number) {
  return z.object({
    ...(await ReservedParams.getAuthIdSchema(userId)),
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
        args.authId !== null ? await getAccessToken(args.authId) : null;
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
            const { accessToken: token } = requireAccessToken(accessToken);
            const metadata = await getGoogleDriveFileMetadata({
              accessToken: token,
              fileId,
            });
            if (!metadata.mimeType || isGoogleDriveFolder(metadata.mimeType)) {
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
            const { accessToken: token } = requireAccessToken(accessToken);
            const metadata = await getGoogleDriveFileMetadata({
              accessToken: token,
              fileId: fileOrFolderId,
            });
            return serializeMetadata(metadata);
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
            const { accessToken: token } = requireAccessToken(accessToken);
            return {
              fileOrFolderId,
              exists: await googleDriveFileExists({
                accessToken: token,
                fileId: fileOrFolderId,
              }),
            };
          },
        }),
      };
    },
  };
  return ret;
}
