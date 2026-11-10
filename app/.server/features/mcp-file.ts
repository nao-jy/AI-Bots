import {
  generateFileHandle,
  type FileHandleReaderMap,
} from "./toolsets/helpers/file-handle";

// MCP servers opt into this private response field. Never send file bytes to the model.
export function registerMcpFile(
  result: unknown,
  handles: FileHandleReaderMap,
): unknown {
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
  if (
    typeof value.base64 !== "string" ||
    value.base64.length > 14_000_020 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value.base64,
    ) ||
    typeof value.filename !== "string" ||
    typeof value.mimeType !== "string"
  ) {
    return {
      content: [
        { type: "text", text: "Invalid or oversized MCP file response." },
      ],
      isError: true,
    };
  }
  const data = Buffer.from(value.base64, "base64");
  if (data.length > 10 * 1024 * 1024)
    return {
      content: [{ type: "text", text: "MCP file exceeds 10 MiB." }],
      isError: true,
    };
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
}
