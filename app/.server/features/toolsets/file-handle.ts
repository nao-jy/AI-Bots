import { randomUUID } from "node:crypto";

interface FileInfo {
  stream: () => AsyncIterable<Uint8Array<ArrayBufferLike>>;
  mimeType?: string;
  filename?: string;
}

type FileHandle = string;

export type FileHandleReaderMap = Map<FileHandle, FileInfo>;

export function generateFileHandle() {
  const uuid = randomUUID();
  const firstPart = uuid.split("-")[0];
  return firstPart;
}

export async function toBuffer(
  source: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of source) {
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }

  return Buffer.concat(chunks);
}
