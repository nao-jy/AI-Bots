import { drive } from "@googleapis/drive";

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

export function isGoogleWorkspaceFile(mimeType: string): boolean {
  return (
    mimeType.startsWith("application/vnd.google-apps.") ||
    mimeType.startsWith("application/vnd.google-gemini.")
  );
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
  const driveClient = drive({ version: "v3", auth: accessToken });
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
