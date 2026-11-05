import { t } from "~/i18n";
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
  title: t("pages.rateLimits.title"),
  description:
    t("pages.rateLimits.description"),
  icon: "rate_limits",
  columns: [
    { key: "criteriaLabel", label: t("pages.rateLimits.targetTypeLabel") },
    { key: "targetLabel", label: t("pages.rateLimits.targetLabel") },
    { key: "perThreadLabel", label: t("pages.rateLimits.aggregationScopeLabel") },
    { key: "limit", label: t("pages.rateLimits.limitLabel") },
    { key: "resetOnCron", label: t("pages.rateLimits.resetCronLabel") },
    { key: "timezone", label: t("pages.rateLimits.timezoneLabel") },
    { key: "limitExceededMessage", label: t("pages.rateLimits.exceededMessageLabel") },
  ],
  fields: [
    {
      key: "criteria",
      label: t("pages.rateLimits.targetTypeLabel"),
      type: "dependent-select",
      options: [],
      dependentKey: "criteriaId",
      dependentLabel: t("pages.rateLimits.targetLabel"),
      dependentOptions: {},
      placeholder: t("pages.rateLimits.targetTypePlaceholder"),
      required: true,
      wide: true,
    },
    {
      key: "perThread",
      label: t("pages.rateLimits.aggregationScopeLabel"),
      type: "select",
      options: [
        { value: "true", label: t("pages.rateLimits.perThreadOption") },
        { value: "false", label: t("pages.rateLimits.allThreadsOption") },
      ],
      required: true,
    },
    {
      key: "limit",
      label: t("pages.rateLimits.limitValueLabel"),
      type: "number",
      placeholder: t("pages.rateLimits.limitValuePlaceholder"),
      required: true,
    },
    {
      key: "coefficients",
      label: t("pages.rateLimits.usageWeightsLabel"),
      type: "metric-coefficients",
      options: [
        { value: "inputTokens", label: t("pages.rateLimits.inputTokensOption") },
        { value: "outputTokens", label: t("pages.rateLimits.outputTokensOption") },
        {
          value: "inputDetails.noCacheTokens",
          label: t("pages.rateLimits.inputUncachedTokensOption"),
        },
        {
          value: "inputDetails.cacheReadTokens",
          label: t("pages.rateLimits.inputCacheReadTokensOption"),
        },
        {
          value: "inputDetails.cacheWriteTokens",
          label: t("pages.rateLimits.inputCacheWriteTokensOption"),
        },
        { value: "outputDetails.textTokens", label: t("pages.rateLimits.outputTextTokensOption") },
        { value: "outputDetails.reasoningTokens", label: t("pages.rateLimits.outputReasoningTokensOption") },
      ],
      wide: true,
      help: {
        text: t("pages.rateLimits.usageWeightsHelp"),
      },
    },
    {
      key: "resetOnCron",
      label: t("pages.rateLimits.resetCronLabel"),
      type: "cron",
      required: true,
      timezoneDescription: t("pages.rateLimits.resetCronHelp"),
      wide: true,
    },
    {
      key: "timezone",
      label: t("pages.rateLimits.timezoneLabel"),
      type: "select",
      options: [],
      placeholder: t("pages.rateLimits.timezonePlaceholder"),
      defaultValue: "Asia/Tokyo",
      required: true,
    },
    {
      key: "limitExceededMessage",
      label: t("pages.rateLimits.exceededMessageLabel"),
      type: "textarea",
      required: true,
      wide: true,
    },
  ],
};

export function meta() {
  return [{ title: t("pages.rateLimits.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [rateLimits, timezones] = await Promise.all([
    listRateLimits(await requireUser(request)),
    Promise.resolve([
      "UTC",
      ...Intl.supportedValuesOf("timeZone").filter(
        (timezone) => timezone !== "UTC",
      ),
    ]),
  ]);
  return { ...rateLimits, timezones };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = Number(form.get("id"));
  if (intent === "delete")
    return Number.isInteger(id) && (await deleteRateLimit(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.rateLimits.notFound") };
  if (intent === "create") return saveRateLimit(user, null, form);
  if (intent === "update")
    return Number.isInteger(id)
      ? saveRateLimit(user, id, form)
      : { ok: false, error: t("pages.rateLimits.notFound") };
  return { ok: false, error: t("pages.rateLimits.unknownAction") };
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
            field.key === "criteria"
              ? loaderData.criteriaOptions
              : field.key === "timezone"
                ? loaderData.timezones
                : field.options,
          dependentOptions:
            field.key === "criteria"
              ? loaderData.dependentOptions
              : field.dependentOptions,
        })),
      }}
    />
  );
}
