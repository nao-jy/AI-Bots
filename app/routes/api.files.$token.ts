import type { Route } from "./+types/api.files.$token";
import { getTemporaryFileStore } from "../.server/features/filesystem/temporary";

export async function loader({ params }: Route.LoaderArgs) {
  const file = await getTemporaryFileStore().get(params.token || "");
  return serveTemporaryFile(file);
}

export function serveTemporaryFile(
  file: Awaited<ReturnType<ReturnType<typeof getTemporaryFileStore>["get"]>>,
) {
  if (!file) return new Response("Not Found", { status: 404 });

  const encodedFilename = encodeURIComponent(file.filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(file.data.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
