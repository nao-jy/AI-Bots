import type { Route } from "./+types/api.groups";
import { requireAdmin } from "../.server/auth";
import { createGroup, listGroups, renameGroup, deleteGroup, setGroupMembership } from "../.server/repository/groups";
import { isUuid } from "../.server/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  return Response.json(await listGroups(user));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const groupId = String(form.get("groupId") ?? "");

  if (intent === "create") {
    const result = await createGroup(user, String(form.get("name") ?? ""));
    return Response.json(result, { status: "error" in result ? 400 : 201 });
  }
  if (!isUuid(groupId)) return Response.json({ error: "server.groupNotFound" }, { status: 400 });

  if (intent === "rename") {
    const result = await renameGroup(user, groupId, String(form.get("name") ?? ""));
    return Response.json(result, { status: "error" in result ? 400 : 200 });
  }
  if (intent === "delete") {
    const ok = await deleteGroup(user, groupId);
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (intent === "membership") {
    const memberId = String(form.get("memberId") ?? "");
    const isMemberValue = String(form.get("isMember") ?? "");
    if (!isUuid(memberId) || !["true", "false"].includes(isMemberValue))
      return Response.json({ error: "server.groupOrUserNotFound" }, { status: 400 });
    const result = await setGroupMembership(user, groupId, memberId, isMemberValue === "true");
    return Response.json(result, { status: "error" in result ? 404 : 200 });
  }
  return Response.json({ error: "server.unknownAction" }, { status: 400 });
}
