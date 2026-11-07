import { getTemporaryFileStore } from "../filesystem/temporary";

export async function createTemporaryFileLink(
  data: Uint8Array,
  filename: string,
  publicOrigin?: string,
) {
  const base = process.env.PUBLIC_APP_URL || publicOrigin;
  if (!base)
    throw new Error("PUBLIC_APP_URL is required to create a download link");
  const origin = new URL(base);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("Public URL must use HTTP or HTTPS");
  }
  const saved = await getTemporaryFileStore().save(data, filename);
  return {
    url: new URL(`/api/files/${saved.token}`, origin).toString(),
    filename: saved.filename,
    expiresAt: saved.expiresAt,
  };
}
