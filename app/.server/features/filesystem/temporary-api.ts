import { db } from "../../repository/db";
import { decryptMcpContext, decryptMcpHeaders, isUuid } from "../../utils";
import { ApiFileSystem, type FileSystemConfig } from "./api";
import { TemporaryFileStore } from "./temporary";

export async function getTemporaryStoreForApi(apiId: string) {
  if (!isUuid(apiId)) return null;
  const api = await db.orm.aibot.FileSystemAPI.first({ id: apiId });
  if (!api) return null;
  const context = decryptMcpContext(api.context) as unknown as FileSystemConfig;
  return new TemporaryFileStore(
    new ApiFileSystem(context, "temporary-files", {
      endpoint: api.endpoint,
      headers: decryptMcpHeaders(api.headers),
    }),
  );
}

export async function getOrganizationTemporaryStore(organizationId: string) {
  const organization = await db.orm.aibot.Organization.first({
    id: organizationId,
  });
  if (!organization?.temporaryFileSystemApiId) return null;
  const api = await db.orm.aibot.FileSystemAPI.first({
    id: organization.temporaryFileSystemApiId,
    organizationId,
  });
  if (!api) throw new Error("Temporary filesystem API is not available");
  const store = await getTemporaryStoreForApi(api.id);
  if (!store) throw new Error("Temporary filesystem API is not available");
  return { apiId: api.id, store };
}
