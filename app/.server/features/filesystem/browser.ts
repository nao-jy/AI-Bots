import type { AuthUser } from "../../auth";
import { db } from "../../repository/db";
import { decryptMcpContext, decryptMcpHeaders, isUuid } from "../../utils";
import { ApiFileSystem, type FileSystemConfig } from "./api";

export async function getBrowserFileSystem(user: AuthUser, apiId: string) {
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  if (!isUuid(apiId)) throw new Response("Not Found", { status: 404 });
  const api = await db.orm.aibot.FileSystemAPI.first({
    id: apiId,
    organizationId: user.organizationId,
  });
  if (!api) throw new Response("Not Found", { status: 404 });
  return new ApiFileSystem(
    decryptMcpContext(api.context) as unknown as FileSystemConfig,
    "",
    {
      endpoint: api.endpoint,
      headers: decryptMcpHeaders(api.headers),
    },
  );
}
