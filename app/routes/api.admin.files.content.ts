import type { Route } from "./+types/api.admin.files.content";
import { requireAdmin } from "../.server/auth";
import { getBrowserFileSystem } from "../.server/features/filesystem/browser";
import { logAuditEvent } from "../.server/logger/audit-logger";

const PREVIEW_LIMIT = 1024 * 1024;

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const url = new URL(request.url);
  const apiId = url.searchParams.get("api") ?? "";
  const path = url.searchParams.get("path") ?? "";
  if (!path || path.endsWith("/"))
    throw new Response("Not Found", { status: 404 });
  const fs = await getBrowserFileSystem(user, apiId);
  const download = url.searchParams.get("download") === "1";
  const response = await fs.openRead(path).catch(() => null);
  if (!response || response.status === 404 || !response.body) {
    if (download) throw new Response("Not Found", { status: 404 });
    return Response.json(
      { kind: "error" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const filename = path.split("/").at(-1) || "download";
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (download) {
    logAuditEvent(
      "filesystem.file.downloaded",
      "filesystem_api",
      apiId,
      user.id,
    );
    const encoded = encodeURIComponent(filename).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(response.body, {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      },
    });
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > PREVIEW_LIMIT) {
        await reader.cancel();
        return Response.json({ kind: "large" }, { headers });
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ kind: "error" }, { headers });
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  try {
    if (bytes.includes(0)) throw new Error("Binary");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    logAuditEvent("filesystem.file.viewed", "filesystem_api", apiId, user.id);
    return Response.json({ kind: "text", text }, { headers });
  } catch {
    return Response.json({ kind: "binary" }, { headers });
  }
}
