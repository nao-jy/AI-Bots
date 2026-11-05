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
import { t } from "~/.server/i18n";

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
    throw new Error("server.googleDriveOAuthRequired");
  }
  return accessToken;
}

export async function getToolSetFactory(userId: number) {
  const schema = await getSchema(userId);
  const ret: ToolSetFactory = {
    name: "gdrive",
    displayName: t("server.googleDriveRemoteFileTools"),
    getToolSetContextSchema: () => schema.toJSONSchema({ target: "draft-7" }),
    validateContext: (value: unknown) => schema.validate(value),
    getTools: async (fileHandles: FileHandleReaderMap, context: unknown) => {
      const args = schema.parse(context);
      const accessToken =
        args.authId !== null && args.authId !== undefined
          ? await getAccessToken(args.authId)
          : null;
      const authName = accessToken?.name ?? "";

      return {
        [`listGdrive_${authName}`]: tool({
          description: t("server.googleDriveListFilesDescription"),
          inputSchema: z.object({
            folderId: z
              .string()
              .min(1)
              .describe(t("server.googleDriveFolderId")),
            recursive: z
              .boolean()
              .default(false)
              .describe(t("server.googleDriveRecursive")),
            limit: z
              .number()
              .int()
              .min(1)
              .max(1000)
              .default(100)
              .describe(t("server.googleDriveMaxResults")),
            startAfter: z
              .string()
              .optional()
              .describe(t("server.googleDrivePageToken")),
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
          description: t("server.googleDriveSharedFilesDescription"),
          inputSchema: z.object({
            limit: z
              .number()
              .int()
              .min(1)
              .max(1000)
              .default(100)
              .describe(t("server.googleDriveMaxResults")),
            startAfter: z
              .string()
              .optional()
              .describe(t("server.googleDriveNamePageToken")),
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
          description: t("server.googleDriveSearchDescription"),
          inputSchema: z.object({
            q: z
              .string()
              .trim()
              .min(1)
              .describe(t("server.googleDriveSearchQuery")),
            limit: z
              .number()
              .int()
              .min(1)
              .max(1000)
              .default(100)
              .describe(t("server.googleDriveMaxResults")),
            pageToken: z
              .string()
              .optional()
              .describe(t("server.googleDriveNextPageToken")),
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
          description: t("server.googleDriveFileHandleDescription"),
          inputSchema: z.object({
            fileId: z
              .string()
              .min(1)
              .describe(t("server.googleDriveFileIdForHandle")),
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
                throw new Error("server.googleDriveExpectedFile");
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
                        "server.googleDriveExpectedBinaryContent",
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
          description: t("server.googleDriveMetadataDescription"),
          inputSchema: z.object({
            fileOrFolderId: z
              .string()
              .min(1)
              .describe(t("server.googleDriveMetadataFileId")),
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
          description: t("server.googleDriveExistsDescription"),
          inputSchema: z.object({
            fileOrFolderId: z
              .string()
              .min(1)
              .describe(t("server.googleDriveExistsFileId")),
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
