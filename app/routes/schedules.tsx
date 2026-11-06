import { isUuid } from "../.server/utils";
import { t } from "~/i18n";
import type { Route } from "./+types/schedules";
import { requireUser } from "../.server/auth";
import { appLogger } from "../.server/logger/app-logger";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteSchedule,
  listSchedules,
  saveSchedule,
} from "../.server/repository/schedules";
import { refreshCronJobs } from "../.server/features/scheduler";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.schedules.title",
  description: "pages.schedules.description",
  icon: "schedules",
  tableFeatures: { resourceGrants: true },
  columns: [
    { key: "name", label: "pages.schedules.nameLabel" },
    { key: "cronParam", label: "pages.schedules.frequencyLabel" },
    { key: "timezone", label: "pages.schedules.timezoneLabel" },
    { key: "targets", label: "pages.schedules.targetsLabel" },
    { key: "updated", label: "pages.schedules.createdAtLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.schedules.nameLabel",
      placeholder: "pages.schedules.namePlaceholder",
      required: true,
    },
    {
      key: "prompt",
      label: "pages.schedules.promptLabel",
      type: "textarea",
      wide: true,
      placeholder: "pages.schedules.promptPlaceholder",
      required: true,
    },
    {
      key: "cronParam",
      label: "pages.schedules.frequencyLabel",
      type: "cron",
      wide: true,
    },
    {
      key: "timezone",
      label: "pages.schedules.timezoneLabel",
      type: "select",
      options: [],
      placeholder: "pages.schedules.timezonePlaceholder",
      defaultValue: "Asia/Tokyo",
      required: true,
    },
    {
      key: "targetsJson",
      label: "pages.schedules.targetsLabel",
      type: "schedule-targets",
      options: [],
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.schedules.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const [schedules, timezones] = await Promise.all([
    listSchedules(user),
    Promise.resolve([
      "UTC",
      ...Intl.supportedValuesOf("timeZone").filter(
        (timezone) => timezone !== "UTC",
      ),
    ]),
  ]);
  return { ...schedules, timezones };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");

  let result: { ok?: boolean; error?: string };
  if (intent === "create") {
    result = await saveSchedule(user, null, form);
  } else if (intent === "update") {
    if (!isUuid(id))
      return { ok: false, error: t("pages.schedules.notFound") };
    result = await saveSchedule(user, id, form);
  } else if (intent === "delete") {
    if (!isUuid(id) || !(await deleteSchedule(user, id)))
      return { ok: false, error: t("pages.schedules.notFound") };
    result = { ok: true };
  } else {
    return { ok: false, error: t("pages.schedules.unknownAction") };
  }

  if (!result.ok) return { ...result, intent };
  try {
    await refreshCronJobs();
    return { ok: true, intent };
  } catch (error) {
    appLogger.error(
      "Failed to synchronize Cron jobs after schedule change",
      error,
    );
    return {
      ok: true,
      intent,
      message:
        t("pages.schedules.cronReloadFailedAfterSave"),
    };
  }
}

export default function SchedulesRoute({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "timezone"
              ? loaderData.timezones
              : field.key === "targetsJson"
                ? loaderData.targetOptions
                : field.options,
        })),
      }}
    />
  );
}
