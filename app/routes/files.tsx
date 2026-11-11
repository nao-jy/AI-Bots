import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDrivesIcon,
  HouseIcon,
} from "@phosphor-icons/react";
import { useFetcher, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Route } from "./+types/files";
import { requireAdmin } from "../.server/auth";
import { listServiceApis } from "../.server/repository/service-apis";
import { getBrowserFileSystem } from "../.server/features/filesystem/browser";
import type { DirectoryEntry } from "../.server/features/filesystem/api";
import { appLogger } from "../.server/logger/app-logger";
import {
  nameOf,
  sortDirectoryEntries,
  type SortKey,
} from "../features/files/sort";
import "./files.css";

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const apis = (await listServiceApis(user)).filesystems;
  const url = new URL(request.url);
  const requested = url.searchParams.get("api");
  const apiId = requested ?? apis[0]?.id ?? "";
  const path = url.searchParams.get("path") ?? "";
  if (requested && !apis.some((api) => api.id === requested))
    throw new Response("Not Found", { status: 404 });
  if (!apiId)
    return {
      apis,
      apiId,
      path: "",
      entries: [] as DirectoryEntry[],
      error: false,
    };
  if (
    path &&
    (!path.endsWith("/") ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((part) => part === "." || part === ".."))
  )
    throw new Response("Invalid path", { status: 400 });
  try {
    const entries = await (
      await getBrowserFileSystem(user, apiId)
    ).listDirectory(path);
    return { apis, apiId, path, entries, error: false };
  } catch (error) {
    if (error instanceof Response) throw error;
    appLogger.error("Filesystem directory listing failed", { apiId, error });
    return { apis, apiId, path, entries: [] as DirectoryEntry[], error: true };
  }
}

function formatSize(size: number | null) {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = size / 1024,
    index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024;
    index++;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[index]}`;
}

export default function Files({ loaderData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const [, setParams] = useSearchParams();
  const preview = useFetcher<{
    kind: "text" | "binary" | "large" | "error";
    text?: string;
  }>();
  const [selected, setSelected] = useState<DirectoryEntry | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "name",
    descending: false,
  });
  const { apiId, path, entries, apis } = loaderData;
  useEffect(() => {
    setSelected(null);
  }, [apiId, path]);
  const sorted = useMemo(
    () => sortDirectoryEntries(entries, sort, i18n.language),
    [entries, sort, i18n.language],
  );
  const navigate = (nextApi: string, nextPath = "") => {
    setSelected(null);
    setParams(
      nextApi ? { api: nextApi, ...(nextPath ? { path: nextPath } : {}) } : {},
    );
  };
  const contentUrl = (file: string, download = false) =>
    `/api/admin/files/content?${new URLSearchParams({ api: apiId, path: file, ...(download ? { download: "1" } : {}) })}`;
  const select = (entry: DirectoryEntry) => {
    setSelected(entry);
    if (entry.type === "file") preview.load(contentUrl(entry.path));
  };
  const open = (entry: DirectoryEntry) => {
    if (entry.type === "directory") navigate(apiId, entry.path);
    else select(entry);
  };
  const sortBy = (key: SortKey) =>
    setSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : false,
    }));
  const crumbs = path.split("/").filter(Boolean);
  const activeApi = apis.find((api) => api.id === apiId);
  return (
    <div className="files-page">
      <header className="files-header">
        <div>
          <Text className="files-eyebrow">{t("fileBrowser.adminLabel")}</Text>
          <h1>{t("fileBrowser.title")}</h1>
          <Text c="dimmed" size="sm">
            {t("fileBrowser.description")}
          </Text>
        </div>
        <Badge
          variant="light"
          color="violet"
          size="lg"
          leftSection={<HardDrivesIcon size={15} />}
        >
          {t("fileBrowser.readOnly")}
        </Badge>
      </header>
      <Paper className="files-panel" radius="lg" withBorder>
        <div className="files-toolbar">
          <div className="files-source">
            <ThemeIcon variant="light" color="violet" size="lg" radius="md">
              <HardDrivesIcon size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" fw={600}>
                {t("fileBrowser.source")}
              </Text>
              <Select
                aria-label={t("fileBrowser.source")}
                data={apis.map((api) => ({ value: api.id, label: api.name }))}
                value={apiId || null}
                onChange={(v) => navigate(v ?? "")}
                placeholder={t("fileBrowser.selectSource")}
                allowDeselect={false}
                variant="unstyled"
                className="files-select"
              />
            </div>
          </div>
          <Text size="xs" c="dimmed">
            {t("fileBrowser.hint")}
          </Text>
        </div>
        {apis.length === 0 ? (
          <Center className="files-empty">
            <Stack align="center" gap="xs">
              <FolderOpenIcon size={42} color="var(--mantine-color-violet-4)" />
              <Text fw={600}>{t("fileBrowser.noSources")}</Text>
              <Text size="sm" c="dimmed">
                {t("fileBrowser.noSourcesHelp")}
              </Text>
              <Button component="a" href="/settings" variant="light" mt="sm">
                {t("fileBrowser.openSettings")}
              </Button>
            </Stack>
          </Center>
        ) : (
          <>
            <div className="files-path">
              <UnstyledButton
                onClick={() => navigate(apiId)}
                className="files-crumb"
              >
                <HouseIcon size={15} />
                {activeApi?.name}
              </UnstyledButton>
              {crumbs.map((crumb, index) => (
                <span key={index} className="files-crumb-wrap">
                  <span>/</span>
                  <UnstyledButton
                    className="files-crumb"
                    onClick={() =>
                      navigate(
                        apiId,
                        crumbs.slice(0, index + 1).join("/") + "/",
                      )
                    }
                  >
                    {crumb}
                  </UnstyledButton>
                </span>
              ))}
            </div>
            {loaderData.error ? (
              <Alert color="red" m="md">
                {t("fileBrowser.listError")}
              </Alert>
            ) : (
              <div className="files-content">
                <div className="files-list">
                  <ScrollArea>
                    <Table
                      className="files-table"
                      highlightOnHover
                      verticalSpacing="sm"
                    >
                      <Table.Thead>
                        <Table.Tr>
                          {(
                            [
                              ["name", "fileBrowser.name"],
                              ["size", "fileBrowser.size"],
                              ["updatedAt", "fileBrowser.modified"],
                            ] as const
                          ).map(([key, label]) => (
                            <Table.Th
                              key={key}
                              aria-sort={
                                sort.key === key
                                  ? sort.descending
                                    ? "descending"
                                    : "ascending"
                                  : "none"
                              }
                            >
                              <UnstyledButton
                                className="files-sort"
                                onClick={() => sortBy(key)}
                              >
                                {t(label)}{" "}
                                {sort.key === key &&
                                  (sort.descending ? (
                                    <CaretDownIcon size={13} />
                                  ) : (
                                    <CaretUpIcon size={13} />
                                  ))}
                              </UnstyledButton>
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {sorted.map((entry) => (
                          <Table.Tr
                            key={entry.path}
                            className={
                              selected?.path === entry.path
                                ? "files-row files-row-selected"
                                : "files-row"
                            }
                            onClick={() => select(entry)}
                            onDoubleClick={() => open(entry)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                open(entry);
                              }
                            }}
                            tabIndex={0}
                            aria-label={nameOf(entry)}
                          >
                            <Table.Td>
                              <Group gap="sm" wrap="nowrap">
                                <ThemeIcon
                                  size="md"
                                  radius="md"
                                  variant="light"
                                  color={
                                    entry.type === "directory"
                                      ? "violet"
                                      : "gray"
                                  }
                                >
                                  {entry.type === "directory" ? (
                                    <FolderIcon size={17} weight="fill" />
                                  ) : (
                                    <FileIcon size={17} />
                                  )}
                                </ThemeIcon>
                                <Text size="sm" fw={500} truncate>
                                  {nameOf(entry)}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {formatSize(entry.size)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {entry.updatedAt
                                  ? new Intl.DateTimeFormat(i18n.language, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(entry.updatedAt))
                                  : "—"}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                  {sorted.length === 0 && (
                    <Center className="files-empty">
                      <Stack align="center" gap="xs">
                        <FolderOpenIcon
                          size={38}
                          color="var(--mantine-color-gray-4)"
                        />
                        <Text fw={600}>{t("fileBrowser.empty")}</Text>
                        <Text size="sm" c="dimmed">
                          {t("fileBrowser.emptyHelp")}
                        </Text>
                      </Stack>
                    </Center>
                  )}
                  <div className="files-count">
                    {t("fileBrowser.itemCount", { count: sorted.length })}
                  </div>
                </div>
                <aside className="files-preview">
                  {selected ? (
                    <Stack gap="md">
                      <Group wrap="nowrap">
                        <ThemeIcon
                          size="xl"
                          radius="md"
                          variant="light"
                          color={
                            selected.type === "directory" ? "violet" : "gray"
                          }
                        >
                          {selected.type === "directory" ? (
                            <FolderIcon size={24} weight="fill" />
                          ) : (
                            <FileIcon size={24} />
                          )}
                        </ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                          <Text
                            fw={600}
                            size="sm"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {nameOf(selected)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {t(
                              selected.type === "directory"
                                ? "fileBrowser.folder"
                                : "fileBrowser.file",
                            )}
                          </Text>
                        </Box>
                      </Group>
                      {selected.type === "directory" ? (
                        <Button variant="light" onClick={() => open(selected)}>
                          {t("fileBrowser.openFolder")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            component="a"
                            href={contentUrl(selected.path, true)}
                            variant="light"
                            leftSection={<DownloadSimpleIcon size={16} />}
                          >
                            {t("fileBrowser.download")}
                          </Button>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            {t("fileBrowser.preview")}
                          </Text>
                          {preview.state !== "idle" ? (
                            <Center p="lg">
                              <Loader size="sm" />
                            </Center>
                          ) : preview.data?.kind === "text" ? (
                            <pre className="files-preview-text">
                              {preview.data.text || t("fileBrowser.emptyFile")}
                            </pre>
                          ) : (
                            <Text size="sm" c="dimmed">
                              {t(
                                preview.data?.kind === "large"
                                  ? "fileBrowser.tooLarge"
                                  : preview.data?.kind === "error"
                                    ? "fileBrowser.previewError"
                                    : "fileBrowser.binary",
                              )}
                            </Text>
                          )}
                        </>
                      )}
                    </Stack>
                  ) : (
                    <Center className="files-preview-empty">
                      <Stack align="center" gap="xs">
                        <FileIcon
                          size={32}
                          color="var(--mantine-color-gray-4)"
                        />
                        <Text size="sm" fw={600}>
                          {t("fileBrowser.nothingSelected")}
                        </Text>
                        <Text size="xs" c="dimmed" ta="center">
                          {t("fileBrowser.selectHint")}
                        </Text>
                      </Stack>
                    </Center>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </Paper>
    </div>
  );
}
