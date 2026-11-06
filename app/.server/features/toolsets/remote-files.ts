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
import { t } from "~/.server/i18n";

async function getSchema(organizationId: string, principalId?: string) {
  const schema = z.object({
    service: z
      .string()
      .meta({
        title: t("server.openDalServiceName"),
      })
      .describe(t("server.openDalServiceNameDescription")),
    configuration: z
      .array(z.object({ key: z.string(), value: z.string() }))
      .meta({
        title: t("server.openDalServiceConfig"),
      })
      .describe(t("server.openDalServiceConfigDescription")),
    ...(await ReservedParams.getAuthIdOptionalSchema(organizationId, principalId)),
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

export async function getToolSetFactory(organizationId: string, principalId?: string) {
  const schema = await getSchema(organizationId, principalId);
  const ret: ToolSetFactory = {
    name: "remote-files-opendal",
    displayName: t("server.openDalRemoteFileTools"),
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
          description: t("server.openDalListPathDescription"),
          inputSchema: z.object({
            path: z
              .string()
              .default("")
              .describe(t("server.openDalPathToList")),
            recursive: z
              .boolean()
              .default(false)
              .describe(t("server.openDalRecursive")),
            limit: z
              .number()
              .int()
              .min(1)
              .max(1000)
              .default(100)
              .describe(t("server.openDalMaxResults")),
            startAfter: z
              .string()
              .optional()
              .describe(t("server.openDalPageToken")),
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
          description: t("server.openDalFileHandleDescription"),
          inputSchema: z.object({
            path: z
              .string()
              .min(1)
              .describe(t("server.openDalFilePathForHandle")),
          }),
          execute: async ({ path }) => {
            try {
              const metadata = await operator.stat(path);
              if (!metadata.isFile()) {
                throw new Error("server.openDalExpectedFile");
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
                    "server.googleDriveOAuthRequired",
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
                        "server.openDalExpectedBinaryContent",
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
          description: t("server.openDalMetadataDescription"),
          inputSchema: z.object({
            path: z
              .string()
              .min(1)
              .describe(t("server.openDalMetadataPath")),
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
          description: t("server.openDalPathExistsDescription"),
          inputSchema: z.object({
            path: z.string().min(1).describe(t("server.openDalPathToCheck")),
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
