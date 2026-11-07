import { isUuid } from "../.server/utils";
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
import { entityListPage } from "../.server/repository/list-pages";

const page: Omit<EntityPageDefinition, "records"> = {
  title: "pages.rateLimits.title",
  description:
    "pages.rateLimits.description",
  icon: "rate_limits",
  tableFeatures: { resourceGrants: true },
  columns: [
    { key: "name", label: "pages.rateLimits.nameLabel" },
    { key: "criteriaLabel", label: "pages.rateLimits.targetTypeLabel" },
    { key: "targetLabel", label: "pages.rateLimits.targetLabel" },
    { key: "perThreadLabel", label: "pages.rateLimits.aggregationScopeLabel" },
    { key: "limit", label: "pages.rateLimits.limitLabel" },
    { key: "resetOnCron", label: "pages.rateLimits.resetCronLabel" },
    { key: "timezone", label: "pages.rateLimits.timezoneLabel" },
    { key: "limitExceededMessage", label: "pages.rateLimits.exceededMessageLabel" },
  ],
  fields: [
    {
      key: "name",
      label: "pages.rateLimits.nameLabel",
      required: true,
    },
    {
      key: "criteria",
      label: "pages.rateLimits.targetTypeLabel",
      type: "dependent-select",
      options: [],
      dependentKey: "criteriaId",
      dependentLabel: "pages.rateLimits.targetLabel",
      dependentOptions: {},
      placeholder: "pages.rateLimits.targetTypePlaceholder",
      required: true,
      wide: true,
    },
    {
      key: "perThread",
      label: "pages.rateLimits.aggregationScopeLabel",
      type: "select",
      options: [
        { value: "true", label: "pages.rateLimits.perThreadOption" },
        { value: "false", label: "pages.rateLimits.allThreadsOption" },
      ],
      required: true,
    },
    {
      key: "limit",
      label: "pages.rateLimits.limitValueLabel",
      type: "number",
      placeholder: "pages.rateLimits.limitValuePlaceholder",
      required: true,
    },
    {
      key: "coefficients",
      label: "pages.rateLimits.usageWeightsLabel",
      type: "metric-coefficients",
      options: [
        { value: "inputTokens", label: "pages.rateLimits.inputTokensOption" },
        { value: "outputTokens", label: "pages.rateLimits.outputTokensOption" },
        {
          value: "inputDetails.noCacheTokens",
          label: "pages.rateLimits.inputUncachedTokensOption",
        },
        {
          value: "inputDetails.cacheReadTokens",
          label: "pages.rateLimits.inputCacheReadTokensOption",
        },
        {
          value: "inputDetails.cacheWriteTokens",
          label: "pages.rateLimits.inputCacheWriteTokensOption",
        },
        { value: "outputDetails.textTokens", label: "pages.rateLimits.outputTextTokensOption" },
        { value: "outputDetails.reasoningTokens", label: "pages.rateLimits.outputReasoningTokensOption" },
      ],
      wide: true,
      help: {
        text: "pages.rateLimits.usageWeightsHelp",
      },
    },
    {
      key: "resetOnCron",
      label: "pages.rateLimits.resetCronLabel",
      type: "cron",
      required: true,
      timezoneDescription: "pages.rateLimits.resetCronHelp",
      wide: true,
    },
    {
      key: "timezone",
      label: "pages.rateLimits.timezoneLabel",
      type: "select",
      options: [],
      placeholder: "pages.rateLimits.timezonePlaceholder",
      defaultValue: "Asia/Tokyo",
      required: true,
    },
    {
      key: "limitExceededMessage",
      label: "pages.rateLimits.exceededMessageLabel",
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
  const user = await requireUser(request);
  const pagination = await entityListPage(user, "rate-limits", request);
  const [rateLimits, timezones] = await Promise.all([
    listRateLimits(user, pagination.ids),
    Promise.resolve([
      "UTC",
      ...Intl.supportedValuesOf("timeZone").filter(
        (timezone) => timezone !== "UTC",
      ),
    ]),
  ]);
  return { ...rateLimits, timezones, pagination };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (intent === "delete")
    return isUuid(id) && (await deleteRateLimit(user, id))
      ? { ok: true }
      : { ok: false, error: t("pages.rateLimits.notFound") };
  if (intent === "create") return saveRateLimit(user, null, form);
  if (intent === "update")
    return isUuid(id)
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
        pagination: loaderData.pagination,
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
