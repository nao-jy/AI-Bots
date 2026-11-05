import { t } from "~/i18n";
import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { EntityOption } from "../../types/entities";

type Target = { chatbotAdapterId: number; threadId: string };

function parseTargets(value: unknown): Target[] {
  if (typeof value !== "string") return [{ chatbotAdapterId: 0, threadId: "" }];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [{ chatbotAdapterId: 0, threadId: "" }];
    const targets = parsed.filter(
      (target): target is Target =>
        target &&
        typeof target === "object" &&
        "chatbotAdapterId" in target &&
        typeof target.chatbotAdapterId === "number" &&
        "threadId" in target &&
        typeof target.threadId === "string",
    );
    return targets.length ? targets : [{ chatbotAdapterId: 0, threadId: "" }];
  } catch {
    return [{ chatbotAdapterId: 0, threadId: "" }];
  }
}

export function ScheduleTargetsEditor({
  name,
  label,
  options,
  initialValue,
}: {
  name: string;
  label: string;
  options: string[] | EntityOption[];
  initialValue: unknown;
}) {
  const [targets, setTargets] = useState(() => parseTargets(initialValue));
  const targetOptions = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <input type="hidden" name={name} value={JSON.stringify(targets)} />
      {targets.map((target, index) => (
        <Group key={index} align="flex-end" wrap="nowrap">
          <Select
            label={index === 0 ? t("components.entityPage.scheduleTargetsEditor.targetTypeLabel") : undefined}
            placeholder={t("components.entityPage.scheduleTargetsEditor.targetPlaceholder")}
            data={targetOptions}
            value={
              target.chatbotAdapterId ? String(target.chatbotAdapterId) : null
            }
            onChange={(value) =>
              setTargets((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        chatbotAdapterId: value ? Number(value) : 0,
                      }
                    : item,
                ),
              )
            }
            searchable
            style={{ flex: 1 }}
            required
          />
          <TextInput
            label={index === 0 ? t("components.entityPage.scheduleTargetsEditor.threadIdLabel") : undefined}
            placeholder={t("components.entityPage.scheduleTargetsEditor.threadIdPlaceholder")}
            description={
              index === 0
                ? t("components.entityPage.scheduleTargetsEditor.threadIdHelp")
                : undefined
            }
            value={target.threadId}
            onChange={(event) => {
              const threadId = event.currentTarget.value;
              setTargets((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, threadId } : item,
                ),
              );
            }}
            style={{ flex: 1 }}
            required
          />
          <Button
            type="button"
            variant="subtle"
            color="red"
            aria-label={t("components.entityPage.scheduleTargetsEditor.removeTargetAriaLabel", { 0: index + 1 })}
            onClick={() =>
              setTargets((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          >
            <TrashIcon size={16} aria-hidden="true" />
          </Button>
        </Group>
      ))}
      <Button
        type="button"
        variant="light"
        size="xs"
        w="fit-content"
        leftSection={<PlusIcon size={14} aria-hidden="true" />}
        onClick={() =>
          setTargets((current) => [
            ...current,
            { chatbotAdapterId: 0, threadId: "" },
          ])
        }
      >
        {t("components.entityPage.scheduleTargetsEditor.addTarget")}</Button>
      {targetOptions.length === 0 && (
        <Text size="xs" c="dimmed">
          {t("components.entityPage.scheduleTargetsEditor.noTargetsAvailable")}</Text>
      )}
    </Stack>
  );
}
