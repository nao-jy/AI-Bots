import { t } from "~/i18n";
import type { Route } from "./+types/groups";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { requireAdmin } from "../.server/auth";
import {
  createGroup,
  deleteGroup,
  listGroupCandidates,
  listGroups,
  renameGroup,
  setGroupMembership,
} from "../.server/repository/groups";
import { record, isUuid } from "../.server/utils";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records" | "memberOptions"> = {
  title: "pages.groups.title",
  description: "pages.groups.description",
  icon: "groups",
  deleteWarning: "pages.groups.deleteWarning",
  tableFeatures: {
    groupMembers: true,
  },
  columns: [
    { key: "name", label: "pages.groups.groupName" },
    { key: "memberCount", label: "pages.groups.members" },
    { key: "updated", label: "pages.groups.updated" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.groups.groupName",
      placeholder: "pages.groups.groupNamePlaceholder",
      required: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.groups.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const [groups, users] = await Promise.all([
    listGroups(user),
    listGroupCandidates(user),
  ]);
  return {
    records: groups.map((group) => record(group.id, group.updatedAt, {
      name: group.name,
      memberCount: group.members.length,
      members: JSON.stringify(group.members),
    })),
    memberOptions: users.map((member) => ({
      value: member.id,
      label: `${member.name} (${member.email})`,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const groupId = String(form.get("id") ?? form.get("groupId") ?? "");
  const name = String(form.get("name") ?? "");

  if (intent === "create" || intent === "update") {
    const result = intent === "create"
      ? await createGroup(user, name)
      : isUuid(groupId)
        ? await renameGroup(user, groupId, name)
        : { error: "server.groupNotFound" };
    if ("error" in result) {
      return {
        ok: false,
        error: result.error === "server.duplicateGroupName"
          ? "pages.groups.nameTaken"
          : result.error === "server.groupNotFound"
            ? "pages.groups.notFound"
            : "pages.groups.nameRequired",
      };
    }
    return { ok: true };
  }

  if (intent === "delete") {
    if (!isUuid(groupId) || !(await deleteGroup(user, groupId)))
      return { ok: false, error: "pages.groups.notFound" };
    return { ok: true };
  }

  if (intent === "membership") {
    const memberId = String(form.get("memberId") ?? "");
    const membershipValue = String(form.get("isMember") ?? "");
    if (!isUuid(groupId) || !isUuid(memberId) || !["true", "false"].includes(membershipValue))
      return { ok: false, error: "pages.groups.invalidMembership" };
    const result = await setGroupMembership(user, groupId, memberId, membershipValue === "true");
    if ("error" in result)
      return { ok: false, error: "pages.groups.invalidMembership" };
    return { ok: true };
  }

  return { ok: false, error: "pages.groups.unknownAction" };
}

export default function Groups({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        memberOptions: loaderData.memberOptions,
      }}
    />
  );
}
