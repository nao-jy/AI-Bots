import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  useFetcher,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import type { Route } from "./+types/service-apis";
import { requireAdmin } from "../.server/auth";
import { getAppSettings } from "../.server/repository/app-settings";
import {
  deleteServiceApi,
  listServiceApis,
  loadFileSystemContextSchema,
  saveServiceApi,
  saveTemporaryFileApi,
  testServiceApi,
} from "../.server/repository/service-apis";
import { ServiceApiForm } from "~/components/service-api-form";
import { APP_NAME } from "~/const";
import { t } from "~/i18n";
import "./service-apis.css";

type Kind = "sandbox" | "filesystem";
type Api = { id: string; name: string; endpoint: string };

export function meta() {
  return [{ title: t("pages.serviceApis.documentTitle", { 0: APP_NAME }) }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const [serviceApis, settings] = await Promise.all([
    listServiceApis(user),
    getAppSettings(user.organizationId),
  ]);
  return {
    serviceApis,
    temporaryFileSystemApiId: settings.temporaryFileSystemApiId,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  switch (form.get("_intent")) {
    case "test-api":
      return testServiceApi(user, form);
    case "load-filesystem-schema":
      return loadFileSystemContextSchema(user, form);
    case "save-temporary-api":
      return saveTemporaryFileApi(user, form);
    case "save-api":
      return saveServiceApi(user, form);
    case "delete-api":
      return deleteServiceApi(user, form);
    default:
      return { error: "Invalid action" };
  }
}

export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    ["test-api", "load-filesystem-schema"].includes(
      String(formData?.get("_intent")),
    )
  )
    return false;
  return defaultShouldRevalidate;
}

export default function ServiceApis({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>(
    params.get("tab") === "filesystem" ? "filesystem" : "sandbox",
  );
  const [editor, setEditor] = useState<{ kind: Kind; api?: Api } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Kind; api: Api } | null>(
    null,
  );
  const [showDeleteResult, setShowDeleteResult] = useState(false);
  const deleteFetcher = useFetcher<typeof action>();
  const temporaryFetcher = useFetcher<typeof action>();
  useEffect(() => {
    if (
      deleteFetcher.state === "idle" &&
      deleteFetcher.data &&
      "ok" in deleteFetcher.data &&
      deleteFetcher.data.ok
    )
      setDeleting(null);
  }, [deleteFetcher.state, deleteFetcher.data]);
  const apis =
    kind === "sandbox"
      ? loaderData.serviceApis.sandboxes
      : loaderData.serviceApis.filesystems;

  return (
    <div className="entity-page service-apis-page">
      <div className="page-heading">
        <div>
          <Title order={1}>{t("pages.serviceApis.title")}</Title>
          <Text>{t("pages.serviceApis.description")}</Text>
        </div>
        <Button
          className="primary-button"
          leftSection={<PlusIcon size={16} weight="bold" />}
          onClick={() => setEditor({ kind })}
        >
          {t("pages.serviceApis.add")}
        </Button>
      </div>
      <section className="entity-panel">
        <div className="entity-toolbar">
          <Tabs
            value={kind}
            onChange={(value) => {
              if (value === "sandbox" || value === "filesystem") setKind(value);
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="sandbox">Sandbox API</Tabs.Tab>
              <Tabs.Tab value="filesystem">Filesystem API</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <span className="record-count">
            {apis.length} {t("components.entityPage.table.countUnit")}
          </span>
        </div>
        <div className="table-wrap">
          <Table
            className="entity-table"
            verticalSpacing="md"
            horizontalSpacing="md"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("pages.settings.apiNameLabel")}</Table.Th>
                <Table.Th>{t("pages.settings.apiEndpointLabel")}</Table.Th>
                <Table.Th className="actions-header">
                  {t("components.entityPage.table.actionsLabel")}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {apis.map((api) => (
                <Table.Tr key={api.id}>
                  <Table.Td>
                    <div className="entity-name-cell">
                      <span className="entity-symbol">
                        <PlugsConnectedIcon size={16} aria-hidden="true" />
                      </span>
                      <strong>{api.name}</strong>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <span className="mono">{api.endpoint}</span>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={0} justify="flex-end" wrap="nowrap">
                      {kind === "filesystem" && (
                        <Tooltip label={t("navigation.files")}>
                          <ActionIcon
                            component="a"
                            href={`/files?api=${encodeURIComponent(api.id)}`}
                            variant="subtle"
                            color="gray"
                            aria-label={`${api.name}: ${t("navigation.files")}`}
                          >
                            <FolderOpenIcon size={16} aria-hidden="true" />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip
                        label={t("components.entityPage.entityRow.editRecord", {
                          0: api.name,
                        })}
                      >
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t(
                            "components.entityPage.entityRow.editRecord",
                            { 0: api.name },
                          )}
                          onClick={() => setEditor({ kind, api })}
                        >
                          <PencilSimpleIcon size={16} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip
                        label={t(
                          "components.entityPage.entityRow.deleteRecord",
                          { 0: api.name },
                        )}
                      >
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t(
                            "components.entityPage.entityRow.deleteRecord",
                            { 0: api.name },
                          )}
                          onClick={() => {
                            setShowDeleteResult(false);
                            setDeleting({ kind, api });
                          }}
                        >
                          <TrashIcon size={16} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {apis.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <div className="empty-state">
                      <MagnifyingGlassIcon size={22} aria-hidden="true" />
                      <strong>{t("pages.serviceApis.empty")}</strong>
                    </div>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      </section>
      {kind === "filesystem" && (
        <section
          className="entity-panel"
          style={{ marginTop: 16, maxWidth: 680 }}
        >
          <div className="section-heading">
            <div>
              <div className="section-title-row">
                <h2>{t("pages.settings.temporaryApiLabel")}</h2>
              </div>
              <div className="section-description">
                {t("pages.serviceApis.temporaryHelp")}
              </div>
            </div>
          </div>
          <temporaryFetcher.Form
            method="post"
            className="service-apis-temporary-form"
          >
            <input type="hidden" name="_intent" value="save-temporary-api" />
            <Select
              key={loaderData.temporaryFileSystemApiId ?? "none"}
              name="temporaryFileSystemApiId"
              aria-label={t("pages.settings.temporaryApiLabel")}
              data={loaderData.serviceApis.filesystems.map((api) => ({
                value: api.id,
                label: api.name,
              }))}
              defaultValue={loaderData.temporaryFileSystemApiId || null}
              clearable
            />
            {temporaryFetcher.data &&
              "error" in temporaryFetcher.data &&
              temporaryFetcher.data.error && (
                <Alert color="red" mt="sm" role="alert">
                  {temporaryFetcher.data.error}
                </Alert>
              )}
            {temporaryFetcher.data &&
              "ok" in temporaryFetcher.data &&
              temporaryFetcher.data.ok && (
                <Alert color="green" mt="sm" role="status">
                  {t("pages.serviceApis.temporarySaved")}
                </Alert>
              )}
            <Button
              type="submit"
              mt="sm"
              className="primary-button small"
              loading={temporaryFetcher.state !== "idle"}
            >
              {t("pages.settings.save")}
            </Button>
          </temporaryFetcher.Form>
        </section>
      )}
      <Modal
        opened={!!editor}
        onClose={() => setEditor(null)}
        title={
          <Title order={3}>
            {editor
              ? t(
                  editor.api
                    ? "pages.serviceApis.editTitle"
                    : "pages.serviceApis.createTitle",
                  {
                    0:
                      editor.kind === "sandbox"
                        ? "Sandbox API"
                        : "Filesystem API",
                  },
                )
              : ""}
          </Title>
        }
        centered
        size="lg"
        radius="lg"
        classNames={{
          title: "editor-modal-title",
          content: "editor-modal-content",
        }}
      >
        {editor && (
          <ServiceApiForm
            key={`${editor.kind}-${editor.api?.id ?? "new"}`}
            kind={editor.kind}
            api={editor.api}
            onSaved={() => setEditor(null)}
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>
      <Modal
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("pages.serviceApis.deleteTitle")}
        centered
        radius="lg"
      >
        {deleting && (
          <deleteFetcher.Form
            method="post"
            onSubmit={() => setShowDeleteResult(true)}
          >
            <input type="hidden" name="_intent" value="delete-api" />
            <input type="hidden" name="kind" value={deleting.kind} />
            <input type="hidden" name="id" value={deleting.api.id} />
            <Stack gap="md">
              <Text>
                {t("pages.serviceApis.deleteConfirm", { 0: deleting.api.name })}
              </Text>
              {showDeleteResult &&
                deleteFetcher.data &&
                "error" in deleteFetcher.data &&
                deleteFetcher.data.error && (
                  <Alert color="red" role="alert">
                    {deleteFetcher.data.error}
                  </Alert>
                )}
              <Group justify="flex-end">
                <Button
                  variant="default"
                  type="button"
                  onClick={() => setDeleting(null)}
                >
                  {t("pages.serviceApis.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="red"
                  loading={deleteFetcher.state !== "idle"}
                >
                  {t("pages.settings.deleteApi")}
                </Button>
              </Group>
            </Stack>
          </deleteFetcher.Form>
        )}
      </Modal>
    </div>
  );
}
