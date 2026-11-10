import {
  generateFileHandle,
  type FileHandleReaderMap,
} from "./toolsets/helpers/file-handle";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Resolve only a file capability belonging to the MCP endpoint that returned it. */
function fileUrl(reference: string, endpoint: string): URL {
  const base = new URL(endpoint);
  const url = new URL(reference, base);
  const filesPath = new URL("files/", base).pathname;
  const token = url.pathname.slice(filesPath.length);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(filesPath) ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new Error("Invalid MCP file URL");
  return url;
}

/** Download a file capability and register it without sending its URL to the model. */
export async function registerMcpFile(
  result: unknown,
  handles: FileHandleReaderMap,
  endpoint: string,
  getHeaders: () => Promise<Record<string, string>> = async () => ({}),
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return result;
  const response = result as { structuredContent?: unknown; isError?: boolean };
  if (
    response.isError ||
    !response.structuredContent ||
    typeof response.structuredContent !== "object" ||
    Array.isArray(response.structuredContent)
  )
    return result;
  const payload = response.structuredContent as Record<string, unknown>;
  const file = payload["bot_manager/file"];
  if (!file || typeof file !== "object" || Array.isArray(file)) return result;
  const value = file as Record<string, unknown>;
  try {
    if (
      typeof value.url !== "string" ||
      typeof value.filename !== "string" ||
      typeof value.mimeType !== "string"
    )
      throw new Error("Invalid file response");
    const url = fileUrl(value.url, endpoint);
    const download = await fetchImpl(url, {
      headers: await getHeaders(),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!download.ok) throw new Error("File download failed");
    const length = download.headers.get("content-length");
    if (length && Number(length) > MAX_FILE_BYTES) {
      await download.body?.cancel();
      throw new Error("File exceeds size limit");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = download.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > MAX_FILE_BYTES) {
            await reader.cancel();
            throw new Error("File exceeds size limit");
          }
          chunks.push(Buffer.from(chunk));
        }
      } finally {
        reader.releaseLock();
      }
    }
    const data = Buffer.concat(chunks, size);
    const handle = generateFileHandle();
    const filename = value.filename;
    const mimeType = value.mimeType;
    handles.set(handle, {
      filename,
      mimeType,
      stream: async function* () {
        yield data;
      },
    });
    const { ["bot_manager/file"]: _file, ...rest } = payload;
    const cleaned = {
      ...rest,
      success: true,
      fileHandle: handle,
      filename,
      contentType: mimeType,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(cleaned) }],
      structuredContent: cleaned,
      isError: false,
    };
  } catch {
    // Do not expose the capability URL or credentials in errors returned to the model.
    return {
      content: [
        {
          type: "text",
          text: "Could not download the MCP file, or it exceeded the 10 MiB limit.",
        },
      ],
      isError: true,
    };
  }
}
