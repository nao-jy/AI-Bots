import type { Route } from "./+types/api.files.$apiId.$token";
import { getTemporaryStoreForApi } from "../.server/features/filesystem/temporary-api";
import { serveTemporaryFile } from "./api.files.$token";

export async function loader({ params }: Route.LoaderArgs) {
  const store = await getTemporaryStoreForApi(params.apiId || "");
  return serveTemporaryFile(store ? await store.get(params.token || "") : null);
}
