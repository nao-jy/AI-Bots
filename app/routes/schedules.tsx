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
  title: "スケジュール",
  description: "Cron式に従って指定したスレッドでボットを実行します。",
  icon: "schedules",
  columns: [
    { key: "name", label: "スケジュール名" },
    { key: "cronParam", label: "実行頻度" },
    { key: "timezone", label: "タイムゾーン" },
    { key: "targets", label: "送信先" },
    { key: "updated", label: "作成日" },
  ],
  fields: [
    {
      key: "name",
      label: "スケジュール名",
      placeholder: "例：平日の朝会",
      required: true,
    },
    {
      key: "prompt",
      label: "プロンプト",
      type: "textarea",
      wide: true,
      placeholder: "定期実行時にボットへ入力する内容",
      required: true,
    },
    {
      key: "cronParam",
      label: "実行頻度",
      type: "cron",
      wide: true,
    },
    {
      key: "timezone",
      label: "タイムゾーン",
      type: "select",
      options: [],
      placeholder: "タイムゾーンを選択",
      defaultValue: "Asia/Tokyo",
      required: true,
    },
    {
      key: "targetsJson",
      label: "送信先",
      type: "schedule-targets",
      options: [],
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `スケジュール | ${APP_NAME}` }];
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
  const id = Number(form.get("id"));

  let result: { ok?: boolean; error?: string };
  if (intent === "create") {
    result = await saveSchedule(user, null, form);
  } else if (intent === "update") {
    if (!Number.isInteger(id) || id < 1)
      return { ok: false, error: "スケジュールが見つかりません。" };
    result = await saveSchedule(user, id, form);
  } else if (intent === "delete") {
    if (!Number.isInteger(id) || id < 1 || !(await deleteSchedule(user, id)))
      return { ok: false, error: "スケジュールが見つかりません。" };
    result = { ok: true };
  } else {
    return { ok: false, error: "操作を判定できませんでした。" };
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
        "DBには保存しましたがCronの再読み込みに失敗しました。サーバーログを確認してください。",
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
