import { useMemo } from "react";
import { Alert, Button, Group, Select, Table, Text } from "@mantine/core";
import { Form, useFetcher } from "react-router";
import { t, tMessage } from "~/i18n";
import type { EntityOption } from "../../types/entities";

type Member = { id: string; name: string; email: string };

function parseMembers(value: string | number | undefined): Member[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Member =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.email === "string",
    );
  } catch {
    return [];
  }
}

export function GroupMembersDetails({
  groupId,
  groupName,
  membersValue,
  memberOptions,
}: {
  groupId: string;
  groupName: string;
  membersValue: string | number | undefined;
  memberOptions: EntityOption[];
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const members = parseMembers(membersValue);
  const memberIds = useMemo(
    () => new Set(members.map((member) => member.id)),
    [membersValue],
  );
  const availableOptions = memberOptions.filter(
    (option) => !memberIds.has(option.value),
  );

  return (
    <div className="group-members-details">
      <div className="entity-details-title">
        <strong>{t("pages.groups.members")}</strong>
        <small>{t("pages.groups.memberCount", { 0: members.length })}</small>
      </div>
      {fetcher.data?.error && (
        <Alert color="red" mb="sm">
          {tMessage(fetcher.data.error)}
        </Alert>
      )}
      {members.length > 0 ? (
        <Table verticalSpacing="xs" mb="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("pages.groups.memberName")}</Table.Th>
              <Table.Th>{t("pages.groups.memberEmail")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((member) => (
              <Table.Tr key={member.id}>
                <Table.Td>{member.name}</Table.Td>
                <Table.Td>{member.email}</Table.Td>
                <Table.Td align="right">
                  <fetcher.Form method="post" action="/groups">
                    <input type="hidden" name="_intent" value="membership" />
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <input type="hidden" name="isMember" value="false" />
                    <Button
                      type="submit"
                      size="xs"
                      variant="subtle"
                      color="red"
                      loading={fetcher.state !== "idle"}
                    >
                      {t("pages.groups.removeMember")}
                    </Button>
                  </fetcher.Form>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" size="sm" mb="md">
          {t("pages.groups.emptyMembers")}
        </Text>
      )}

      {availableOptions.length > 0 ? (
        <fetcher.Form method="post" action="/groups">
          <input type="hidden" name="_intent" value="membership" />
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="isMember" value="true" />
          <Group align="flex-end">
            <Select
              key={`${groupId}:${members.map((member) => member.id).join(",")}`}
              name="memberId"
              label={t("pages.groups.addMember")}
              placeholder={t("pages.groups.selectMember")}
              data={availableOptions.map(({ value, label }) => ({
                value,
                label: tMessage(label),
              }))}
              searchable
              required
              style={{ flex: 1 }}
            />
            <Button
              type="submit"
              variant="light"
              loading={fetcher.state !== "idle"}
            >
              {t("pages.groups.addMember")}
            </Button>
          </Group>
        </fetcher.Form>
      ) : (
        <Text c="dimmed" size="sm">
          {t("pages.groups.allUsersAdded")}
        </Text>
      )}
    </div>
  );
}
