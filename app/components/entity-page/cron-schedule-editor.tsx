import { t } from "~/i18n";
import { Group, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";

type CronMode = "daily" | "weekly" | "monthly" | "advanced";

const modes: { label: string; value: CronMode }[] = [
  {
    label: t("components.entityPage.cronScheduleEditor.daily"),
    value: "daily",
  },
  {
    label: t("components.entityPage.cronScheduleEditor.weekly"),
    value: "weekly",
  },
  {
    label: t("components.entityPage.cronScheduleEditor.monthly"),
    value: "monthly",
  },
  {
    label: t("components.entityPage.cronScheduleEditor.advanced"),
    value: "advanced",
  },
];

const weekdays = [
  { label: t("components.entityPage.cronScheduleEditor.sunday"), value: "0" },
  { label: t("components.entityPage.cronScheduleEditor.monday"), value: "1" },
  { label: t("components.entityPage.cronScheduleEditor.tuesday"), value: "2" },
  {
    label: t("components.entityPage.cronScheduleEditor.wednesday"),
    value: "3",
  },
  { label: t("components.entityPage.cronScheduleEditor.thursday"), value: "4" },
  { label: t("components.entityPage.cronScheduleEditor.friday"), value: "5" },
  { label: t("components.entityPage.cronScheduleEditor.saturday"), value: "6" },
];

function choices(max: number, min = 0) {
  return Array.from({ length: max - min + 1 }, (_, index) => {
    const value = String(index + min);
    return { label: value, value };
  });
}

function parseInitial(value: unknown) {
  const expression = typeof value === "string" ? value.trim() : "";
  if (!expression) {
    return {
      mode: "daily" as CronMode,
      fields: ["0", "9", "*", "*", "*"],
      minute: 0,
      hour: 9,
      weekday: "1",
      monthday: 1,
    };
  }
  const fields = expression.split(/\s+/);
  if (fields.length !== 5) {
    return {
      mode: "advanced" as CronMode,
      fields,
      minute: 0,
      hour: 9,
      weekday: "1",
      monthday: 1,
    };
  }
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
  if (minuteField && hourField && dayField && monthField && weekdayField) {
    if (
      /^\d+$/.test(minuteField) &&
      /^\d+$/.test(hourField) &&
      dayField === "*" &&
      monthField === "*" &&
      weekdayField === "*"
    )
      return {
        mode: "daily" as CronMode,
        fields,
        minute: Number(minuteField),
        hour: Number(hourField),
        weekday: "1",
        monthday: 1,
      };
    if (
      /^\d+$/.test(minuteField) &&
      /^\d+$/.test(hourField) &&
      dayField === "*" &&
      monthField === "*" &&
      /^\d+$/.test(weekdayField)
    )
      return {
        mode: "weekly" as CronMode,
        fields,
        minute: Number(minuteField),
        hour: Number(hourField),
        weekday: weekdayField,
        monthday: 1,
      };
    if (
      /^\d+$/.test(minuteField) &&
      /^\d+$/.test(hourField) &&
      /^\d+$/.test(dayField) &&
      monthField === "*" &&
      weekdayField === "*"
    )
      return {
        mode: "monthly" as CronMode,
        fields,
        minute: Number(minuteField),
        hour: Number(hourField),
        weekday: "1",
        monthday: Number(dayField),
      };
  }
  return {
    mode: "advanced" as CronMode,
    fields,
    minute: 0,
    hour: 9,
    weekday: "1",
    monthday: 1,
  };
}

function expressionFor(
  mode: CronMode,
  values: ReturnType<typeof parseInitial>,
) {
  const { fields, minute, hour, weekday, monthday } = values;
  switch (mode) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${weekday}`;
    case "monthly":
      return `${minute} ${hour} ${monthday} * *`;
    case "advanced":
      return fields.join(" ");
  }
}

function AdvancedCronFields({
  values,
  onChange,
}: {
  values: ReturnType<typeof parseInitial>;
  onChange: (fields: string[]) => void;
}) {
  const isSixFields = values.fields.length === 6;
  const displayFields = isSixFields
    ? [
        {
          index: 4,
          label: t("components.entityPage.cronScheduleEditor.monthUnit"),
        },
        {
          index: 3,
          label: t("components.entityPage.cronScheduleEditor.dayUnit"),
        },
        {
          index: 5,
          label: t("components.entityPage.cronScheduleEditor.weekdayUnit"),
        },
        {
          index: 2,
          label: t("components.entityPage.cronScheduleEditor.hourUnit"),
        },
        {
          index: 1,
          label: t("components.entityPage.cronScheduleEditor.minuteUnit"),
        },
        {
          index: 0,
          label: t("components.entityPage.cronScheduleEditor.secondUnit"),
        },
      ]
    : [
        {
          index: 3,
          label: t("components.entityPage.cronScheduleEditor.monthUnit"),
        },
        {
          index: 2,
          label: t("components.entityPage.cronScheduleEditor.dayUnit"),
        },
        {
          index: 4,
          label: t("components.entityPage.cronScheduleEditor.weekdayUnit"),
        },
        {
          index: 1,
          label: t("components.entityPage.cronScheduleEditor.hourUnit"),
        },
        {
          index: 0,
          label: t("components.entityPage.cronScheduleEditor.minuteUnit"),
        },
      ];
  const maximums = isSixFields ? [59, 59, 23, 31, 12, 7] : [59, 23, 31, 12, 7];
  const minimums = isSixFields ? [0, 0, 0, 1, 1, 0] : [0, 0, 1, 1, 0];
  const weekdayIndex = isSixFields ? 5 : 4;
  return (
    <Group grow align="flex-end">
      {displayFields.map(({ index, label }) => {
        const options = [
          ...(index === (isSixFields ? 1 : 0)
            ? []
            : [
                {
                  label:
                    t("components.entityPage.cronScheduleEditor.everyPrefix") +
                    label,
                  value: "*",
                },
              ]),
          ...(index === weekdayIndex
            ? weekdays
            : choices(maximums[index]!, minimums[index]!)),
        ];
        const existing = values.fields[index] ?? "*";
        if (!options.some((option) => option.value === existing)) {
          const weekdayValue =
            index === weekdayIndex && /^\d+$/.test(existing)
              ? Number(existing)
              : null;
          const weekdayName =
            weekdayValue === 7
              ? t("components.entityPage.cronScheduleEditor.sunday")
              : weekdays.find((day) => day.value === existing)?.label;
          options.push({
            label:
              weekdayName && weekdayValue !== null
                ? `${weekdayName}（${existing}）`
                : t("components.entityPage.cronScheduleEditor.currentValue", {
                    0: existing,
                  }),
            value: existing,
          });
        }
        return (
          <Select
            key={label}
            label={label}
            data={options}
            value={existing}
            onChange={(value) => {
              if (!value) return;
              onChange(
                values.fields.map((field, fieldIndex) =>
                  fieldIndex === index ? value : field,
                ),
              );
            }}
            searchable
          />
        );
      })}
    </Group>
  );
}

export function CronScheduleEditor({
  name,
  label,
  initialValue,
  timezoneDescription = t(
    "components.entityPage.cronScheduleEditor.timezoneHelp",
  ),
}: {
  name: string;
  label: string;
  initialValue: unknown;
  timezoneDescription?: string;
}) {
  const [values, setValues] = useState(() => parseInitial(initialValue));
  const [mode, setMode] = useState<CronMode>(values.mode);
  const expression = expressionFor(mode, values);

  function setTime(part: "minute" | "hour" | "monthday", value: number) {
    setValues((current) => ({ ...current, [part]: value }));
  }

  return (
    <Stack gap="xs">
      <input type="hidden" name={name} value={expression} />
      <Select
        label={label}
        data={modes}
        value={mode}
        onChange={(value) => {
          if (modes.some((item) => item.value === value))
            setMode(value as CronMode);
        }}
      />
      {["daily", "weekly", "monthly"].includes(mode) && (
        <Group grow>
          {mode === "weekly" && (
            <Select
              label={t("components.entityPage.cronScheduleEditor.weekdayUnit")}
              data={weekdays}
              value={values.weekday}
              onChange={(value) =>
                value &&
                setValues((current) => ({ ...current, weekday: value }))
              }
            />
          )}
          {mode === "monthly" && (
            <Select
              label={t("components.entityPage.cronScheduleEditor.dayUnit")}
              data={choices(31, 1)}
              value={String(values.monthday)}
              onChange={(value) => value && setTime("monthday", Number(value))}
              searchable
            />
          )}
          <Select
            label={t("components.entityPage.cronScheduleEditor.hourUnit")}
            data={choices(23)}
            value={String(values.hour)}
            onChange={(value) => value && setTime("hour", Number(value))}
            searchable
          />
          <Select
            label={t("components.entityPage.cronScheduleEditor.minuteUnit")}
            data={choices(59)}
            value={String(values.minute)}
            onChange={(value) => value && setTime("minute", Number(value))}
            searchable
          />
        </Group>
      )}
      {mode === "advanced" && (
        <AdvancedCronFields
          values={values}
          onChange={(fields) =>
            setValues((current) => ({ ...current, fields }))
          }
        />
      )}
      <Text size="xs" c="dimmed">
        {timezoneDescription}
      </Text>
    </Stack>
  );
}
