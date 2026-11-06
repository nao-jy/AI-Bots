import type { Route } from "./+types/api.resource-grants";
import { requireUser } from "../.server/auth";
import { listResourceGrants, setResourceGrant, type Role } from "../.server/authorization";
import { isUuid } from "../.server/utils";

const roles = new Set<Role>(["viewer", "editor", "manager"]);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const resourceId = new URL(request.url).searchParams.get("resourceId") ?? "";
  if (!isUuid(resourceId)) return Response.json({ error: "server.resourceNotFound" }, { status: 400 });
  return Response.json(await listResourceGrants(user, resourceId));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const resourceId = String(form.get("resourceId") ?? "");
  const principalId = String(form.get("principalId") ?? "");
  const roleValue = String(form.get("role") ?? "");
  if (!isUuid(resourceId) || !isUuid(principalId) || (roleValue !== "" && !roles.has(roleValue as Role)))
    return Response.json({ error: "server.invalidGrant" }, { status: 400 });

  await setResourceGrant(user, resourceId, principalId, roleValue === "" ? null : roleValue as Role);
  return Response.json({ ok: true });
}
