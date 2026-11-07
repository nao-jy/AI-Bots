import { useEffect } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { TrashIcon } from "@phosphor-icons/react";
import { useFetcher } from "react-router";
import { t, tMessage, type TranslationKey } from "~/i18n";
import type { EntityRecord } from "../../types/entities";

type Role = "viewer" | "editor" | "manager";
type Principal = {
  id: string;
  type: "user" | "group";
  name: string;
  email: string;
};
type Grant = {
  principalId: string;
  type: "user" | "group";
  name: string;
  email: string;
  role: Role;
};
type GrantList = {
  resourceId: string;
  principals: Principal[];
  grants: Grant[];
};
type MutationResult = { ok?: boolean; error?: string };

const roleOptionKeys = [
  { value: "viewer", label: "components.resourceGrants.viewer" },
  { value: "editor", label: "components.resourceGrants.editor" },
  { value: "manager", label: "components.resourceGrants.manager" },
];

function isGrantList(value: unknown): value is GrantList {
  return Boolean(
    value &&
    typeof value === "object" &&
    "principals" in value &&
    "grants" in value,
  );
}

export function ResourceGrantsDialog({
  record,
  onClose,
}: {
  record: EntityRecord | null;
  onClose: () => void;
}) {
  const resourceId = record?.id ?? "";
  const resourceName = String(
    record?.name ?? record?.targetLabel ?? record?.id ?? "",
  );
  const listFetcher = useFetcher<GrantList>();
  const mutationFetcher = useFetcher<MutationResult>();
  const listData =
    isGrantList(listFetcher.data) && listFetcher.data.resourceId === resourceId
      ? listFetcher.data
      : null;
  const roleOptions = roleOptionKeys.map(({ value, label }) => ({
    value,
    label: t(label as TranslationKey),
  }));

  useEffect(() => {
    if (!record) return;
    listFetcher.load(
      `/api/resource-grants?resourceId=${encodeURIComponent(record.id)}`,
    );
  }, [record?.id]);

  useEffect(() => {
    const result = mutationFetcher.data;
    if (!result || mutationFetcher.state !== "idle") return;
    if (result.error) return;
    if (result.ok)
      listFetcher.load(
        `/api/resource-grants?resourceId=${encodeURIComponent(resourceId)}`,
      );
  }, [mutationFetcher.data, mutationFetcher.state, resourceId]);

  const alreadyGranted = new Set(
    listData?.grants.map((grant) => grant.principalId) ?? [],
  );
  const availablePrincipals = (listData?.principals ?? [])
    .filter((principal) => !alreadyGranted.has(principal.id))
    .map((principal) => ({
      value: principal.id,
      label:
        principal.type === "group"
          ? `${principal.name} · ${t("components.resourceGrants.group")}`
          : `${principal.name} (${principal.email})`,
    }));

  return (
    <Modal
      opened={record !== null}
      onClose={onClose}
      title={t("components.resourceGrants.title", { 0: resourceName })}
      size="lg"
      centered
    >
      {mutationFetcher.data?.error && (
        <Alert color="red" mb="md">
          {tMessage(mutationFetcher.data.error)}
        </Alert>
      )}
      {listFetcher.state === "idle" && listFetcher.data && !listData && (
        <Alert color="red" mb="md">
          {t("components.resourceGrants.loadFailed")}
        </Alert>
      )}
      {listFetcher.state !== "idle" && !listData ? (
        <Text c="dimmed">{t("components.resourceGrants.loading")}</Text>
      ) : listData ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t("components.resourceGrants.description")}
          </Text>
          {listData.grants.length > 0 ? (
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    {t("components.resourceGrants.principal")}
                  </Table.Th>
                  <Table.Th>{t("components.resourceGrants.role")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listData.grants.map((grant) => (
                  <Table.Tr key={`${grant.type}:${grant.principalId}`}>
                    <Table.Td>
                      <Group gap="xs">
                        <span>{grant.name}</span>
                        <Badge
                          size="xs"
                          variant="light"
                          color={grant.type === "group" ? "violet" : "blue"}
                        >
                          {t(
                            grant.type === "group"
                              ? "components.resourceGrants.group"
                              : "components.resourceGrants.user",
                          )}
                        </Badge>
                        {grant.email && (
                          <Text size="xs" c="dimmed">
                            {grant.email}
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <mutationFetcher.Form
                        method="post"
                        action="/api/resource-grants"
                      >
                        <input
                          type="hidden"
                          name="resourceId"
                          value={resourceId}
                        />
                        <input
                          type="hidden"
                          name="principalId"
                          value={grant.principalId}
                        />
                        <Group wrap="nowrap">
                          <Select
                            key={grant.role}
                            aria-label={t("components.resourceGrants.roleFor", {
                              0: grant.name,
                            })}
                            name="role"
                            data={roleOptions}
                            defaultValue={grant.role}
                            allowDeselect={false}
                            size="xs"
                            w={150}
                          />
                          <Button
                            type="submit"
                            size="xs"
                            variant="light"
                            loading={mutationFetcher.state !== "idle"}
                          >
                            {t("components.resourceGrants.save")}
                          </Button>
                        </Group>
                      </mutationFetcher.Form>
                    </Table.Td>
                    <Table.Td align="right">
                      <mutationFetcher.Form
                        method="post"
                        action="/api/resource-grants"
                      >
                        <input
                          type="hidden"
                          name="resourceId"
                          value={resourceId}
                        />
                        <input
                          type="hidden"
                          name="principalId"
                          value={grant.principalId}
                        />
                        <input type="hidden" name="role" value="" />
                        <Tooltip label={t("components.resourceGrants.remove")}>
                          <ActionIcon
                            type="submit"
                            variant="subtle"
                            color="red"
                            aria-label={t("components.resourceGrants.remove")}
                          >
                            <TrashIcon size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </mutationFetcher.Form>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              {t("components.resourceGrants.empty")}
            </Text>
          )}

          {availablePrincipals.length > 0 ? (
            <mutationFetcher.Form method="post" action="/api/resource-grants">
              <input type="hidden" name="resourceId" value={resourceId} />
              <Group align="flex-end">
                <Select
                  name="principalId"
                  label={t("components.resourceGrants.addPrincipal")}
                  placeholder={t("components.resourceGrants.selectPrincipal")}
                  data={availablePrincipals}
                  searchable
                  required
                  style={{ flex: 1 }}
                />
                <Select
                  name="role"
                  label={t("components.resourceGrants.role")}
                  data={roleOptions}
                  defaultValue="viewer"
                  allowDeselect={false}
                  w={150}
                />
                <Button
                  type="submit"
                  loading={mutationFetcher.state !== "idle"}
                >
                  {t("components.resourceGrants.grant")}
                </Button>
              </Group>
            </mutationFetcher.Form>
          ) : (
            <Text size="sm" c="dimmed">
              {t("components.resourceGrants.noPrincipalsAvailable")}
            </Text>
          )}
        </Stack>
      ) : null}
    </Modal>
  );
}
