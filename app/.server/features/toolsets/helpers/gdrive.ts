import { drive } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";

const DRIVE_FILE_FIELDS =
  "id,name,mimeType,size,modifiedTime,createdTime,md5Checksum,webViewLink,description,parents,trashed";

const EXPORT_FORMAT_PRIORITY = [
  (mimeType: string) => mimeType === "text/markdown",
  (mimeType: string) =>
    mimeType.startsWith("application/vnd.openxmlformats-officedocument.") ||
    mimeType.startsWith("application/vnd.ms-") ||
    mimeType.startsWith("application/vnd.oasis.opendocument.") ||
    mimeType === "application/msword" ||
    mimeType === "application/rtf",
  (mimeType: string) => mimeType.startsWith("text/"),
  (mimeType: string) => mimeType.startsWith("image/"),
  (mimeType: string) => mimeType === "application/pdf",
];

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "application/epub+zip": "epub",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.apple.numbers": "numbers",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/zip": "zip",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "text/tab-separated-values": "tsv",
};

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function getDriveClient(accessToken: string) {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  return drive({ version: "v3", auth });
}

function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function isGoogleWorkspaceFile(mimeType: string): boolean {
  return (
    mimeType.startsWith("application/vnd.google-apps.") ||
    mimeType.startsWith("application/vnd.google-gemini.")
  );
}

export function isGoogleDriveFolder(mimeType: string | null | undefined) {
  return mimeType === FOLDER_MIME_TYPE;
}

export async function listGoogleDriveFiles({
  accessToken,
  folderId,
  recursive,
  limit,
  startAfter,
}: {
  accessToken: string;
  folderId: string;
  recursive: boolean;
  limit: number;
  startAfter?: string;
}) {
  const driveClient = getDriveClient(accessToken);
  const files: Array<{
    path: string;
    id: string;
    name: string;
    [key: string]: unknown;
  }> = [];
  const pendingFolders = [{ id: folderId, path: "" }];

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.shift();
    if (!folder) break;

    let pageToken: string | undefined;
    do {
      const response = await driveClient.files.list({
        q: `'${escapeQueryValue(folder.id)}' in parents and trashed = false`,
        pageSize: 1000,
        pageToken,
        orderBy: "name",
        fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      for (const file of response.data.files ?? []) {
        if (!file.id || !file.name) continue;
        const path = folder.path ? `${folder.path}/${file.name}` : file.name;
        files.push({ ...file, path, id: file.id, name: file.name });
        if (recursive && isGoogleDriveFolder(file.mimeType)) {
          pendingFolders.push({ id: file.id, path });
        }
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return files
    .filter((file) => !startAfter || file.path.localeCompare(startAfter) > 0)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, limit);
}

export async function listGoogleDriveSharedFiles({
  accessToken,
  limit,
  startAfter,
}: {
  accessToken: string;
  limit: number;
  startAfter?: string;
}) {
  const driveClient = getDriveClient(accessToken);
  const files: Array<{
    path: string;
    id: string;
    name: string;
    [key: string]: unknown;
  }> = [];
  let pageToken: string | undefined;

  do {
    const response = await driveClient.files.list({
      q: "sharedWithMe = true and trashed = false",
      pageSize: 1000,
      pageToken,
      orderBy: "name",
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    for (const file of response.data.files ?? []) {
      if (!file.id || !file.name) continue;
      if (startAfter && file.name.localeCompare(startAfter) <= 0) continue;
      files.push({ ...file, path: file.name, id: file.id, name: file.name });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken && files.length < limit);

  return files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, limit);
}

export async function searchGoogleDriveFiles({
  accessToken,
  q,
  limit,
  pageToken,
}: {
  accessToken: string;
  q: string;
  limit: number;
  pageToken?: string;
}) {
  const response = await getDriveClient(accessToken).files.list({
    q,
    pageSize: limit,
    pageToken,
    fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  return {
    files: (response.data.files ?? [])
      .filter((file) => file.id && file.name)
      .map((file) => ({
        ...file,
        path: file.name!,
        id: file.id!,
        name: file.name!,
      })),
    nextPageToken: response.data.nextPageToken ?? null,
  };
}

export async function getGoogleDriveFileMetadata({
  accessToken,
  fileId,
}: {
  accessToken: string;
  fileId: string;
}) {
  const response = await getDriveClient(accessToken).files.get({
    fileId,
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  });
  return response.data;
}

export async function googleDriveFileExists({
  accessToken,
  fileId,
}: {
  accessToken: string;
  fileId: string;
}) {
  try {
    await getGoogleDriveFileMetadata({ accessToken, fileId });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 404
    ) {
      return false;
    }
    throw error;
  }
}

function getExportPriority(mimeType: string): number {
  const priority = EXPORT_FORMAT_PRIORITY.findIndex((matches) =>
    matches(mimeType),
  );
  return priority === -1 ? EXPORT_FORMAT_PRIORITY.length : priority;
}

function withExportExtension(filename: string, mimeType: string): string {
  const extension = MIME_TYPE_EXTENSIONS[mimeType];
  if (!extension) return filename;

  const extensionIndex = filename.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return `${baseName}.${extension}`;
}

export async function exportGoogleWorkspaceFile({
  accessToken,
  fileId,
  mimeType: sourceMimeType,
  filename,
}: {
  accessToken: string;
  fileId: string;
  mimeType: string;
  filename: string;
}) {
  const driveClient = getDriveClient(accessToken);
  const about = await driveClient.about.get({ fields: "exportFormats" });
  const formats = about.data.exportFormats?.[sourceMimeType] ?? [];
  const mimeType = formats
    .map((format, index) => ({ format, index }))
    .sort(
      (a, b) =>
        getExportPriority(a.format) - getExportPriority(b.format) ||
        a.index - b.index,
    )[0]?.format;

  if (!mimeType) {
    throw new Error(
      `No Google Drive export format is available for ${sourceMimeType}.`,
    );
  }

  const response = await driveClient.files.export(
    { fileId, mimeType },
    { responseType: "stream" },
  );

  return {
    stream: response.data,
    filename: withExportExtension(filename, mimeType),
    mimeType,
  };
}

export async function downloadGoogleDriveFile({
  accessToken,
  fileId,
  mimeType: sourceMimeType,
  filename,
}: {
  accessToken: string;
  fileId: string;
  mimeType: string;
  filename: string;
}) {
  if (isGoogleWorkspaceFile(sourceMimeType)) {
    return exportGoogleWorkspaceFile({
      accessToken,
      fileId,
      mimeType: sourceMimeType,
      filename,
    });
  }

  const response = await getDriveClient(accessToken).files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return {
    stream: response.data,
    filename,
    mimeType: sourceMimeType,
  };
}
