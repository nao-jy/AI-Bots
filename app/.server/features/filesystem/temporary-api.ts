import { getFilesystemApi, getOrganization, getOrganizationFilesystemApi } from "../../repository/runtime-lookups";
import { decryptMcpContext, decryptMcpHeaders, isUuid } from "../../utils";
import { ApiFileSystem, type FileSystemConfig } from "./api";
import { TemporaryFileStore } from "./temporary";

export async function getTemporaryStoreForApi(apiId: string) {
  if (!isUuid(apiId)) return null;
  const api = await getFilesystemApi(apiId);
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
  const organization = await getOrganization(organizationId);
  if (!organization?.temporaryFileSystemApiId) return null;
  const api = await getOrganizationFilesystemApi(organization.temporaryFileSystemApiId, organizationId);
  if (!api) throw new Error("Temporary filesystem API is not available");
  const store = await getTemporaryStoreForApi(api.id);
  if (!store) throw new Error("Temporary filesystem API is not available");
  return { apiId: api.id, store };
}
