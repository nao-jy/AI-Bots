import {
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useState } from "react";

type CronMode =
  | "every-minute"
  | "every-n-minutes"
  | "every-n-seconds"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "advanced";

const fixedModes: { label: string; value: CronMode }[] = [
  { label: "毎日", value: "daily" },
  { label: "毎週", value: "weekly" },
  { label: "毎月", value: "monthly" },
  { label: "詳細設定", value: "advanced" },
];

type ScheduleType = "interval" | "calendar";
type IntervalUnit = "second" | "minute" | "hour";

const intervalUnits: {
  label: string;
  value: IntervalUnit;
  max: number;
}[] = [
  { label: "秒", value: "second", max: 59 },
  { label: "分", value: "minute", max: 59 },
  { label: "時間", value: "hour", max: 23 },
];

const weekdays = [
  { label: "日曜日", value: "0" },
  { label: "月曜日", value: "1" },
  { label: "火曜日", value: "2" },
  { label: "水曜日", value: "3" },
  { label: "木曜日", value: "4" },
  { label: "金曜日", value: "5" },
  { label: "土曜日", value: "6" },
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
      minuteStep: 5,
      minute: 0,
      hour: 9,
      weekday: "1",
      monthday: 1,
    };
  }
  const fields = expression.split(/\s+/);
  if (
    fields.length === 6 &&
    /^\*\/\d+$/.test(fields[0] ?? "") &&
    fields.slice(1).every((field) => field === "*")
  ) {
    return {
      mode: "every-n-seconds" as CronMode,
      fields,
      minuteStep: Number(fields[0]?.slice(2)),
      minute: 0,
      hour: 9,
      weekday: "1",
      monthday: 1,
    };
  }
  if (fields.length !== 5) {
    return {
      mode: "advanced" as CronMode,
      fields: ["*", "*", "*", "*", "*"],
      minuteStep: 5,
      minute: 0,
      hour: 9,
      weekday: "1",
      monthday: 1,
    };
  }
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
  if (minuteField && hourField && dayField && monthField && weekdayField) {
    if (
      minuteField === "*" &&
      hourField === "*" &&
      dayField === "*" &&
      monthField === "*" &&
      weekdayField === "*"
    )
      return {
        mode: "every-minute" as CronMode,
        fields,
        minuteStep: 5,
        minute: 0,
        hour: 9,
        weekday: "1",
        monthday: 1,
      };
    const minuteStep = minuteField.match(/^\*\/(\d+)$/);
    if (
      minuteStep &&
      hourField === "*" &&
      dayField === "*" &&
      monthField === "*" &&
      weekdayField === "*"
    )
      return {
        mode: "every-n-minutes" as CronMode,
        fields,
        minuteStep: Number(minuteStep[1]),
        minute: 0,
        hour: 9,
        weekday: "1",
        monthday: 1,
      };
    if (
      /^\d+$/.test(minuteField) &&
      hourField === "*" &&
      dayField === "*" &&
      monthField === "*" &&
      weekdayField === "*"
    )
      return {
        mode: "hourly" as CronMode,
        fields,
        minuteStep: 5,
        minute: Number(minuteField),
        hour: 9,
        weekday: "1",
        monthday: 1,
      };
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
        minuteStep: 5,
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
        minuteStep: 5,
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
        minuteStep: 5,
        minute: Number(minuteField),
        hour: Number(hourField),
        weekday: "1",
        monthday: Number(dayField),
      };
  }
  return {
    mode: "advanced" as CronMode,
    fields,
    minuteStep: 5,
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
  const { fields, minute, hour, weekday, monthday, minuteStep } = values;
  switch (mode) {
    case "every-minute":
      return "* * * * *";
    case "every-n-minutes":
      return `*/${minuteStep} * * * *`;
    case "every-n-seconds":
      return `*/${minuteStep} * * * * *`;
    case "hourly":
      return `${minute} * * * *`;
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
  const labels = isSixFields
    ? ["秒", "分", "時", "日", "月", "曜日"]
    : ["分", "時", "日", "月", "曜日"];
  const maximums = isSixFields ? [59, 59, 23, 31, 12, 7] : [59, 23, 31, 12, 7];
  const minimums = isSixFields ? [0, 0, 0, 1, 1, 0] : [0, 0, 1, 1, 0];
  const weekdayIndex = isSixFields ? 5 : 4;
  return (
    <Group grow align="flex-end">
      {labels.map((label, index) => {
        const options = [
          { label: "毎" + label, value: "*" },
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
              ? "日曜日"
              : weekdays.find((day) => day.value === existing)?.label;
          options.push({
            label:
              weekdayName && weekdayValue !== null
                ? `${weekdayName}（${existing}）`
                : `${existing}（現在の値）`,
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
}: {
  name: string;
  label: string;
  initialValue: unknown;
}) {
  const [values, setValues] = useState(() => parseInitial(initialValue));
  const [mode, setMode] = useState<CronMode>(values.mode);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    values.mode === "every-n-seconds"
      ? "second"
      : values.mode === "hourly"
        ? "hour"
        : "minute",
  );
  const [intervalAmount, setIntervalAmount] = useState(() =>
    String(
      values.mode === "every-minute"
        ? 1
        : values.mode === "every-n-seconds" ||
            values.mode === "every-n-minutes"
          ? values.minuteStep
          : 1,
    ),
  );
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    ["every-minute", "every-n-minutes", "every-n-seconds", "hourly"].includes(
      values.mode,
    )
      ? "interval"
      : "calendar",
  );
  const selectedInterval = intervalUnits.find(
    (unit) => unit.value === intervalUnit,
  )!;
  const parsedIntervalAmount = Number(intervalAmount);
  const safeIntervalAmount =
    Number.isInteger(parsedIntervalAmount) && parsedIntervalAmount > 0
      ? Math.min(parsedIntervalAmount, selectedInterval.max)
      : 1;
  const expression =
    scheduleType === "interval"
      ? intervalUnit === "second"
        ? `*/${safeIntervalAmount} * * * * *`
        : intervalUnit === "minute"
          ? `*/${safeIntervalAmount} * * * *`
          : `${values.minute} */${safeIntervalAmount} * * *`
      : expressionFor(mode, values);

  function setTime(part: "minute" | "hour" | "monthday", value: number) {
    setValues((current) => ({ ...current, [part]: value }));
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <input type="hidden" name={name} value={expression} />
      <SegmentedControl
        fullWidth
        data={[
          { label: "一定間隔で実行", value: "interval" },
          { label: "決まった日時に実行", value: "calendar" },
        ]}
        value={scheduleType}
        onChange={(value) => {
          const nextType = value as ScheduleType;
          setScheduleType(nextType);
          setMode(nextType === "interval" ? "every-n-minutes" : "daily");
        }}
      />
      {scheduleType === "interval" ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            指定した間隔ごとに繰り返し実行します。
          </Text>
          <Group grow align="flex-end">
            <NumberInput
              label="間隔"
              value={intervalAmount}
              min={1}
              max={selectedInterval.max}
              allowDecimal={false}
              allowNegative={false}
              clampBehavior="strict"
              onChange={(value) => {
                setIntervalAmount(String(value));
              }}
            />
            <Select
              label="単位"
              data={intervalUnits.map(({ label: unitLabel, value }) => ({
                label: unitLabel,
                value,
              }))}
              value={intervalUnit}
              onChange={(value) => {
                const nextUnit = intervalUnits.find(
                  (unit) => unit.value === value,
                );
                if (!nextUnit) return;
                setIntervalUnit(nextUnit.value);
                setIntervalAmount((current) => {
                  const amount = Number(current);
                  return String(
                    Number.isInteger(amount) && amount > 0
                      ? Math.min(amount, nextUnit.max)
                      : 1,
                  );
                });
              }}
            />
          </Group>
        </Stack>
      ) : (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            毎日・毎週・毎月など、決まった日時に実行します。
          </Text>
          <Select
            label="実行するタイミング"
            data={fixedModes}
            value={
              fixedModes.some((item) => item.value === mode) ? mode : "daily"
            }
            onChange={(value) => {
              if (fixedModes.some((item) => item.value === value))
                setMode(value as CronMode);
            }}
          />
        </Stack>
      )}
      {scheduleType === "calendar" &&
        ["daily", "weekly", "monthly"].includes(mode) && (
          <Group grow>
            <Select
              label="分"
              data={choices(59)}
              value={String(values.minute)}
              onChange={(value) => value && setTime("minute", Number(value))}
              searchable
            />
            {mode !== "hourly" && (
              <Select
                label="時"
                data={choices(23)}
                value={String(values.hour)}
                onChange={(value) => value && setTime("hour", Number(value))}
                searchable
              />
            )}
            {mode === "weekly" && (
              <Select
                label="曜日"
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
                label="日"
                data={choices(31, 1)}
                value={String(values.monthday)}
                onChange={(value) =>
                  value && setTime("monthday", Number(value))
                }
                searchable
              />
            )}
          </Group>
        )}
      {scheduleType === "calendar" && mode === "advanced" && (
        <AdvancedCronFields
          values={values}
          onChange={(fields) =>
            setValues((current) => ({ ...current, fields }))
          }
        />
      )}
      <Text size="xs" c="dimmed">
        実行時刻は「タイムゾーン」欄で選択した地域の時刻です。
      </Text>
    </Stack>
  );
}
