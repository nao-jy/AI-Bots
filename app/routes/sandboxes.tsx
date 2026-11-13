import { isUuid } from "../.server/utils";
import { t } from "~/i18n";
import type { Route } from "./+types/sandboxes";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { requireUser } from "../.server/auth";
import {
  deleteSandbox,
  deleteSandboxInstance,
  listSandboxes,
  runPersistentSandboxCommand,
  saveSandbox,
  startPersistentSandboxTerminal,
} from "../.server/repository/entities";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import { APP_NAME } from "~/const";
import { entityListPage } from "../.server/repository/list-pages";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.sandboxes.title",
  description: "pages.sandboxes.description",
  icon: "sandboxes",
  tableFeatures: { sandboxShell: true, resourceGrants: true },
  columns: [
    { key: "name", label: "pages.sandboxes.title" },
    { key: "type", label: "pages.sandboxes.typeLabel" },
    { key: "allowedDomainList", label: "pages.sandboxes.allowedDomainsLabel" },
    { key: "initCommands", label: "pages.sandboxes.initCommandsLabel" },
  ],
  fields: [
    { key: "name", label: "pages.sandboxes.nameLabel", type: "text" },
    {
      key: "apiId",
      label: "pages.sandboxes.typeLabel",
      type: "select",
      options: [],
    },
    {
      key: "envs",
      label: "pages.sandboxes.environmentVariablesLabel",
      type: "key-value",
      valueType: "string",
      wide: true,
    },
    {
      key: "allowedDomainList",
      label: "pages.sandboxes.allowedDomainsLabel",
      type: "tags",
      placeholder: "pages.sandboxes.allowedDomainPlaceholder",
      wide: true,
    },
    {
      key: "initCommands",
      label: "pages.sandboxes.initCommandsLabel",
      type: "textarea",
      placeholder: "pages.sandboxes.initCommandsPlaceholder",
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.sandboxes.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const pagination = await entityListPage(user, "sandboxes", request);
  return { ...(await listSandboxes(user, pagination.ids)), pagination };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (intent === "run-command")
    return runPersistentSandboxCommand(
      user,
      id,
      String(form.get("instanceId") ?? ""),
      String(form.get("command") ?? ""),
    );
  if (intent === "start-terminal") {
    const result = await startPersistentSandboxTerminal(
      user,
      id,
      String(form.get("instanceId") ?? ""),
      Number(form.get("cols")),
      Number(form.get("rows")),
    );
    return { ...result, instanceId: String(form.get("instanceId") ?? "") };
  }
  if (intent === "delete-instance") {
    const instanceId = String(form.get("instanceId") ?? "");
    const deleted = await deleteSandboxInstance(user, id, instanceId);
    return deleted
      ? { ok: true, instanceId }
      : { ok: false, error: t("pages.sandboxes.persistentInstanceNotFound") };
  }
  if (intent === "delete")
    return isUuid(id) && (await deleteSandbox(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.sandboxes.notFound") };
  if (intent === "create") return saveSandbox(user, null, form);
  if (intent === "update")
    return isUuid(id)
      ? saveSandbox(user, id, form)
      : { ok: false, error: t("pages.sandboxes.notFound") };
  return { ok: false, error: t("pages.sandboxes.unknownAction") };
}

export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    formData?.get("_intent") === "run-command" ||
    formData?.get("_intent") === "start-terminal"
  )
    return false;
  return defaultShouldRevalidate;
}

export default function Sandboxes({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        pagination: loaderData.pagination,
        fields: page.fields.map((field) =>
          field.key === "apiId"
            ? { ...field, options: loaderData.sandboxApiOptions }
            : field,
        ),
      }}
    />
  );
}
