import { useState } from "react";
import type { Route } from "./+types/schedules";
import { requireUser } from "../.server/auth";
import { logger } from "../.server/logger";
import {
  deleteSchedule,
  listSchedules,
  saveSchedule,
} from "../.server/repository/schedules";
import { refreshCronJobs } from "../.server/scheduler";
import { APP_NAME } from "~/const";
import { SchedulesPage } from "../components/schedules-page";

export function meta() {
  return [{ title: `スケジュール | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return listSchedules(user);
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
    logger.error("Failed to synchronize Cron jobs after schedule change", error);
    return {
      ok: true,
      intent,
      message:
        "DBには保存しましたがCronの再読み込みに失敗しました。サーバーログを確認してください。",
    };
  }
}

export default function SchedulesRoute({ loaderData }: Route.ComponentProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorOpened, setEditorOpened] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function closeEditor() {
    setEditorOpened(false);
    setSelectedId(null);
  }

  return (
    <SchedulesPage
      records={loaderData.records}
      targetOptions={loaderData.targetOptions}
      selectedId={selectedId}
      editorOpened={editorOpened}
      deleteId={deleteId}
      onCreate={() => {
        setSelectedId(null);
        setEditorOpened(true);
      }}
      onEdit={(id) => {
        setSelectedId(id);
        setEditorOpened(true);
      }}
      onDelete={setDeleteId}
      onCloseEditor={closeEditor}
      onCloseDelete={() => setDeleteId(null)}
    />
  );
}
