import type { Route } from "./+types/rate-limits";
import {
  EntityPageView,
  type EntityPageDefinition,
} from "../components/entity-page-view";
import {
  deleteRateLimit,
  listRateLimits,
  saveRateLimit,
} from "../.server/repository/entities";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "レートリミット",
  description:
    "利用量×係数の合計が上限以上になると、設定したメッセージを返します。スレッド単位で集計するか、全スレッドを横断して集計するか選択できます。",
  icon: "rate_limits",
  columns: [
    { key: "scopeLabel", label: "対象" },
    { key: "perThreadLabel", label: "集計範囲" },
    { key: "limit", label: "上限" },
    { key: "resetOnCron", label: "リセットCron" },
    { key: "limitExceededMessage", label: "上限超過時のメッセージ" },
  ],
  fields: [
    {
      key: "scope",
      label: "対象",
      type: "select",
      options: [],
      placeholder: "対象を選択",
      required: true,
    },
    {
      key: "perThread",
      label: "集計範囲",
      type: "select",
      options: [
        { value: "true", label: "スレッドごと" },
        { value: "false", label: "全スレッド横断" },
      ],
      required: true,
    },
    {
      key: "limit",
      label: "上限値",
      type: "number",
      placeholder: "例: 100000",
      required: true,
    },
    {
      key: "coefficients",
      label: "利用量の係数",
      type: "key-value",
      valueType: "json-scalar",
      wide: true,
      help: {
        text: "利用項目ごとの係数を設定します（例: inputTokens=1, outputTokens=1）。利用項目は inputTokens、outputTokens、inputDetails.noCacheTokens、inputDetails.cacheReadTokens、inputDetails.cacheWriteTokens、outputDetails.textTokens、outputDetails.reasoningTokens です。",
      },
    },
    {
      key: "resetOnCron",
      label: "リセットCron（UTC）",
      type: "cron",
      required: true,
      timezoneDescription: "レートリミットは、このCron式の実行時刻（UTC）にリセットされます。",
    },
    {
      key: "limitExceededMessage",
      label: "上限超過時のメッセージ",
      type: "textarea",
      required: true,
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: `レートリミット | ${APP_NAME}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return listRateLimits(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteRateLimit(user, id))
      ? { ok: true }
      : { ok: false, error: "レートリミットが見つかりません。" };
  if (intent === "create") return saveRateLimit(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveRateLimit(user, id, form)
      : { ok: false, error: "レートリミットが見つかりません。" };
  return { ok: false, error: "操作を判定できませんでした。" };
}

export default function RateLimits({ loaderData }: Route.ComponentProps) {
  return (
    <EntityPageView
      page={{
        ...page,
        records: loaderData.records,
        fields: page.fields.map((field) => ({
          ...field,
          options:
            field.key === "scope" ? loaderData.targetOptions : field.options,
        })),
      }}
    />
  );
}
