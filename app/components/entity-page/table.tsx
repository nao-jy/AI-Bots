import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import "@xterm/xterm/css/xterm.css";
import {
  ActionIcon,
  Badge,
  CopyButton,
  Group,
  Select,
  Switch,
  Table,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CopySimpleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { EntityRecord, PublicIdSlot } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { SectionIcon } from "./section-icon";

export function EntityTable({
  page,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
  onStatusChange: (record: EntityRecord, enabled: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [shellOpen, setShellOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const shellInstances =
    page.icon === "sandboxes"
      ? page.records.flatMap((record) =>
          parsePersistentInstances(record.instances).map((instance) => ({
            ...instance,
            sandboxId: record.id,
            sandboxName: String(record.name ?? "名称未設定"),
          })),
        )
      : [];
  const visibleRecords = page.records.filter((record) =>
    Object.entries(record)
      .filter(([key]) => key !== "instances")
      .map(([, value]) => value)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <>
      <section className="entity-panel">
        <div className="entity-toolbar">
          <TextInput
            className="search-field"
            placeholder={`${page.title}を検索...`}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            leftSection={<MagnifyingGlassIcon size={16} aria-hidden="true" />}
            aria-label={`${page.title}を検索`}
          />
          <span className="record-count">{page.records.length} 件</span>
        </div>

        <div className="table-wrap">
          <Table
            className="entity-table"
            verticalSpacing="md"
            horizontalSpacing="md"
          >
            <Table.Thead>
              <Table.Tr>
                {page.columns.map((column) => (
                  <Table.Th key={column.key}>{column.label}</Table.Th>
                ))}
                <Table.Th className="actions-header">操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleRecords.map((record) => (
                <EntityRow
                  key={record.id}
                  page={page}
                  record={record}
                  onEdit={() => onEdit(record)}
                  onDelete={() => onDelete(record)}
                  onStatusChange={(enabled) =>
                    onStatusChange(record, enabled)
                  }
                  onOpenShell={() => {
                    if (
                      shellOpen &&
                      shellInstances.some(
                        (instance) =>
                          instance.sandboxId === record.id &&
                          instance.instanceId === selectedInstanceId,
                      )
                    ) {
                      setShellOpen(false);
                      return;
                    }
                    const firstInstance = parsePersistentInstances(
                      record.instances,
                    )[0];
                    setSelectedInstanceId(firstInstance?.instanceId ?? null);
                    setShellOpen(true);
                  }}
                  shellOpen={
                    shellOpen &&
                    shellInstances.some(
                      (instance) =>
                        instance.sandboxId === record.id &&
                        instance.instanceId === selectedInstanceId,
                    )
                  }
                />
              ))}
              {visibleRecords.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={page.columns.length + 1}>
                    <div className="empty-state">
                      <MagnifyingGlassIcon size={22} aria-hidden="true" />
                      <strong>該当するデータがありません</strong>
                      <small>
                        検索条件を変えるか、新しく作成してください。
                      </small>
                    </div>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
        <div className="table-footer">
          <span>
            {visibleRecords.length} 件中{" "}
            <strong>1–{visibleRecords.length}</strong> 件を表示
          </span>
        </div>
      </section>
      {page.icon === "sandboxes" && shellOpen && (
        <SandboxShell
          instances={shellInstances}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={setSelectedInstanceId}
          onClose={() => setShellOpen(false)}
        />
      )}
    </>
  );
}

function EntityRow({
  page,
  record,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenShell,
  shellOpen,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (enabled: boolean) => void;
  onOpenShell: () => void;
  shellOpen: boolean;
}) {
  const fetcher = useFetcher();
  const cannotDelete = record.id === page.protectedRecordId;
  const recordName = record[page.columns[0].key];
  const supportsPublicIdRegeneration =
    page.icon === "bots" || page.icon === "adapters";
  const supportsExpansion = supportsPublicIdRegeneration;
  const [expanded, setExpanded] = useState(false);
  const publicIds = parsePublicIds(record.publicIds);
  const webhookEndpoints =
    page.icon === "bots" ? parseWebhookEndpoints(record.webhooks) : [];

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <div className="entity-name-cell">
            {(supportsExpansion || page.icon === "sandboxes") && (
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={
                  page.icon === "sandboxes"
                    ? `${recordName}のシェルを${shellOpen ? "閉じる" : "開く"}`
                    : `${recordName}のパブリックIDを${expanded ? "閉じる" : "表示"}`
                }
                aria-expanded={page.icon === "sandboxes" ? shellOpen : expanded}
                onClick={
                  page.icon === "sandboxes"
                    ? onOpenShell
                    : () => setExpanded((current) => !current)
                }
              >
                {page.icon === "sandboxes" ? (
                  <TerminalWindowIcon size={16} aria-hidden="true" />
                ) : expanded ? (
                  <CaretDownIcon size={16} aria-hidden="true" />
                ) : (
                  <CaretRightIcon size={16} aria-hidden="true" />
                )}
              </ActionIcon>
            )}
            <span className={`entity-symbol ${page.icon}`}>
              <SectionIcon section={page.icon} size={17} />
            </span>
            <div>
              <strong>{recordName ?? "名称未設定"}</strong>
              {(page.icon === "bots" || page.icon === "mcp") && (
                <small>{record.description ?? record.endpoint ?? ""}</small>
              )}
            </div>
          </div>
        </Table.Td>
        {page.columns.slice(1).map((column) => (
          <Table.Td key={column.key}>
            <EntityCell
              page={page}
              record={record}
              columnKey={column.key}
              value={record[column.key]}
              onStatusChange={onStatusChange}
            />
          </Table.Td>
        ))}
        <Table.Td>
          <Group gap={5} justify="flex-end">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={`${recordName}を編集`}
              onClick={onEdit}
            >
              <PencilSimpleIcon size={16} aria-hidden="true" />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={
                cannotDelete
                  ? "自分のアカウントは削除できません"
                  : `${recordName}を削除`
              }
              title={
                cannotDelete ? "自分のアカウントは削除できません" : undefined
              }
              disabled={cannotDelete}
              onClick={onDelete}
            >
              <TrashIcon size={16} aria-hidden="true" />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
      {supportsPublicIdRegeneration && expanded && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
            <div className="entity-details">
              <strong className="entity-details-title">パブリックID</strong>
              <div className="public-id-grid">
                {(["first", "second"] as const).map((slot, index) => {
                  const publicId = publicIds.find(
                    (item) => item.slot === slot,
                  )?.id;
                  return (
                    <div className="public-id-card" key={slot}>
                      <div className="public-id-label">{index + 1}つ目</div>
                      <div className="public-id-value">
                        <code>{publicId ?? "未発行"}</code>
                        {publicId && (
                          <CopyButton value={publicId} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip
                                label={copied ? "コピーしました" : "IDをコピー"}
                              >
                                <ActionIcon
                                  variant="subtle"
                                  color={copied ? "teal" : "gray"}
                                  aria-label={`${index + 1}つ目のパブリックIDをコピー`}
                                  onClick={copy}
                                >
                                  {copied ? (
                                    <CheckIcon size={15} />
                                  ) : (
                                    <CopySimpleIcon size={15} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        )}
                      </div>
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="_intent"
                          value="regenerate-public-ids"
                        />
                        <input type="hidden" name="id" value={record.id} />
                        <input type="hidden" name="slot" value={slot} />
                        <button
                          className="public-id-regenerate"
                          type="submit"
                          disabled={fetcher.state !== "idle"}
                          onClick={(event) => {
                            if (
                              !window.confirm(
                                `${index + 1}つ目のパブリックIDを再生成すると、このIDを使うWebhook URLは使えなくなります。続けますか？`,
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <ArrowsClockwiseIcon size={15} aria-hidden="true" />
                          {index + 1}つ目を再生成
                        </button>
                      </fetcher.Form>
                    </div>
                  );
                })}
              </div>
              {fetcher.data?.error && (
                <span className="public-id-error" role="alert">
                  {fetcher.data.error}
                </span>
              )}
              {page.icon === "bots" && (
                <div className="webhook-details">
                  <strong className="entity-details-title">Webhook URL</strong>
                  {webhookEndpoints.length > 0 ? (
                    <div className="webhook-endpoints">
                      {webhookEndpoints.map(({ adapterName, url }) => (
                        <div
                          className="webhook-endpoint"
                          key={`${adapterName}-${url}`}
                        >
                          <span className="webhook-adapter-name">
                            {adapterName}
                          </span>
                          <code>{url}</code>
                          <CopyButton value={url} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip
                                label={
                                  copied ? "コピーしました" : "URLをコピー"
                                }
                              >
                                <ActionIcon
                                  variant="subtle"
                                  color={copied ? "teal" : "gray"}
                                  aria-label={`${adapterName} の Webhook URL をコピー`}
                                  onClick={copy}
                                >
                                  {copied ? (
                                    <CheckIcon size={15} />
                                  ) : (
                                    <CopySimpleIcon size={15} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="table-text">Webhook URLはありません</span>
                  )}
                </div>
              )}
            </div>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

type PersistentInstance = {
  instanceId: string;
  scopeLabel: string;
};
type SandboxShellInstance = PersistentInstance & {
  sandboxId: number;
  sandboxName: string;
};
type TerminalStartResponse = {
  ok: boolean;
  terminalId?: string;
  instanceId?: string;
  error?: string;
};

function parsePersistentInstances(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PersistentInstance =>
        item &&
        typeof item === "object" &&
        typeof item.instanceId === "string" &&
        typeof item.scopeLabel === "string",
    );
  } catch {
    return [];
  }
}

function SandboxShell({
  instances,
  selectedInstanceId,
  onSelectInstance,
  onClose,
}: {
  instances: SandboxShellInstance[];
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string | null) => void;
  onClose: () => void;
}) {
  const [height, setHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const terminalFetcher = useFetcher<TerminalStartResponse>();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const resizeStart = useRef<{ pointerY: number; height: number } | null>(null);
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddon = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const pendingInput = useRef("");
  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedInstance = instances.find(
    (instance) => instance.instanceId === selectedInstanceId,
  );
  const selectedSandboxNameRef = useRef(selectedInstance?.sandboxName ?? "");
  const instancesRef = useRef(instances);

  terminalIdRef.current = terminalId;
  selectedSandboxNameRef.current = selectedInstance?.sandboxName ?? "";
  instancesRef.current = instances;

  async function postTerminalAction(
    id: string,
    intent: "input" | "resize" | "close",
    fields: Record<string, string> = {},
  ) {
    const form = new FormData();
    form.set("_intent", intent);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const response = await fetch(`/api/sandbox-terminals/${id}`, {
      method: "POST",
      body: form,
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const error =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : `シェル操作に失敗しました (HTTP ${response.status})`;
      throw new Error(error);
    }
  }

  function reportTerminalError(error: unknown) {
    const message =
      error instanceof Error ? error.message : "シェル操作に失敗しました。";
    setTerminalError(message);
    terminal.current?.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
  }

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataSubscription: { dispose: () => void } | null = null;
    let resizeSubscription: { dispose: () => void } | null = null;
    let activeTerminal: import("@xterm/xterm").Terminal | null = null;
    let activeFitAddon: import("@xterm/addon-fit").FitAddon | null = null;

    async function initializeTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !terminalHost.current) return;

      const instanceTerminal = new Terminal({
        allowProposedApi: false,
        convertEol: false,
        cursorBlink: true,
        fontFamily:
          '"Cascadia Code", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.35,
        scrollback: 2_000,
        theme: {
          background: "#111116",
          foreground: "#e8e7ed",
          cursor: "#c5b5ff",
          selectionBackground: "#7560b880",
          black: "#282733",
          red: "#ff8080",
          green: "#80d9a8",
          yellow: "#f3c477",
          blue: "#8bb8ff",
          magenta: "#c4a4ff",
          cyan: "#74d8d1",
          white: "#e8e7ed",
          brightBlack: "#777585",
          brightRed: "#ff9a9a",
          brightGreen: "#9ce9bd",
          brightYellow: "#ffd78a",
          brightBlue: "#a7c8ff",
          brightMagenta: "#d6bdff",
          brightCyan: "#8ce8e1",
          brightWhite: "#ffffff",
        },
        screenReaderMode: true,
      });
      const fit = new FitAddon();
      instanceTerminal.loadAddon(fit);
      instanceTerminal.open(terminalHost.current);
      fit.fit();
      terminal.current = instanceTerminal;
      fitAddon.current = fit;
      activeTerminal = instanceTerminal;
      activeFitAddon = fit;
      resizeObserver = new ResizeObserver(() => fit.fit());
      resizeObserver.observe(terminalHost.current);

      function handleData(data: string) {
        const activeTerminalId = terminalIdRef.current;
        if (!activeTerminalId) return;
        pendingInput.current += data;
        if (inputTimer.current) clearTimeout(inputTimer.current);
        inputTimer.current = setTimeout(() => {
          const input = pendingInput.current;
          pendingInput.current = "";
          inputTimer.current = null;
          void postTerminalAction(activeTerminalId, "input", { data: input }).catch(
            reportTerminalError,
          );
        }, 12);
      }

      dataSubscription = instanceTerminal.onData(handleData);
      resizeSubscription = instanceTerminal.onResize(({ cols, rows }) => {
        const activeTerminalId = terminalIdRef.current;
        if (activeTerminalId) {
          void postTerminalAction(activeTerminalId, "resize", {
            cols: String(cols),
            rows: String(rows),
          }).catch(reportTerminalError);
        }
      });
      instanceTerminal.write(
        "\x1b[90mSandbox terminal · interactive PTY\x1b[0m\r\n",
      );
      if (selectedInstanceId) {
        instanceTerminal.write(
          `\x1b[90mConnecting to ${selectedSandboxNameRef.current} (${selectedInstanceId})…\x1b[0m\r\n`,
        );
      } else {
        instanceTerminal.write(
          "\x1b[90mSelect an instance to start a shell session.\x1b[0m\r\n",
        );
      }
      setTerminalReady(true);
    }

    void initializeTerminal().catch((error: unknown) => {
      if (!disposed) {
        setTerminalError(
          error instanceof Error
            ? error.message
            : "端末を初期化できませんでした。",
        );
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      dataSubscription?.dispose();
      resizeSubscription?.dispose();
      if (inputTimer.current) clearTimeout(inputTimer.current);
      activeTerminal?.dispose();
      setTerminalReady(false);
      if (terminal.current === activeTerminal) terminal.current = null;
      if (fitAddon.current === activeFitAddon) fitAddon.current = null;
    };
  }, []);

  useEffect(() => {
    const activeTerminal = terminal.current;
    setTerminalId(null);
    terminalIdRef.current = null;
    setTerminalError(null);
    if (!activeTerminal) return;
    activeTerminal.write("\x1b[2J\x1b[H");
    if (selectedInstanceId) {
      activeTerminal.write(
        `\x1b[90mConnecting to ${selectedSandboxNameRef.current} (${selectedInstanceId})…\x1b[0m\r\n`,
      );
    } else {
      activeTerminal.write(
        "\x1b[90mSelect an instance to start a shell session.\x1b[0m\r\n",
      );
    }
    fitAddon.current?.fit();
  }, [selectedInstanceId]);

  useEffect(() => {
    if (!terminalReady) return;
    if (!selectedInstanceId) {
      setTerminalId(null);
      terminalIdRef.current = null;
      return;
    }

    const instance = instancesRef.current.find(
      (candidate) => candidate.instanceId === selectedInstanceId,
    );
    if (!instance) return;
    setTerminalId(null);
    terminalIdRef.current = null;
    terminalFetcher.submit(
      {
        _intent: "start-terminal",
        id: String(instance.sandboxId),
        instanceId: instance.instanceId,
        cols: String(terminal.current?.cols ?? 80),
        rows: String(terminal.current?.rows ?? 24),
      },
      { method: "post", action: "/sandboxes" },
    );
  }, [selectedInstanceId, terminalReady]);

  useEffect(() => {
    const response = terminalFetcher.data;
    if (
      terminalFetcher.state !== "idle" ||
      !response ||
      response.instanceId !== selectedInstanceId
    ) {
      return;
    }
    if (!response.ok || !response.terminalId) {
      setTerminalError(response.error ?? "シェルを開始できませんでした。");
      return;
    }
    setTerminalId(response.terminalId);
    terminalIdRef.current = response.terminalId;
  }, [selectedInstanceId, terminalFetcher.data, terminalFetcher.state]);

  useEffect(() => {
    if (!terminalId) return;
    const activeTerminal = terminal.current;
    if (!activeTerminal) return;

    const source = new EventSource(
      `/api/sandbox-terminals/${terminalId}`,
    );
    let hasReportedDisconnect = false;
    source.onmessage = (event) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        if (
          !payload ||
          typeof payload !== "object" ||
          !("data" in payload) ||
          typeof payload.data !== "string"
        ) {
          throw new Error("端末出力の形式が不正です。");
        }
        const decoded = atob(payload.data);
        const bytes = Uint8Array.from(decoded, (character) =>
          character.charCodeAt(0),
        );
        activeTerminal.write(bytes);
        hasReportedDisconnect = false;
      } catch (error) {
        reportTerminalError(error);
      }
    };
    source.addEventListener("exit", () => {
      activeTerminal.write("\r\n\x1b[90mPTY session closed.\x1b[0m\r\n");
      source.close();
    });
    source.onerror = () => {
      if (hasReportedDisconnect) return;
      hasReportedDisconnect = true;
      activeTerminal.write(
        "\r\n\x1b[33mTerminal connection interrupted; reconnecting…\x1b[0m\r\n",
      );
    };

    return () => {
      source.close();
      const pending = pendingInput.current;
      pendingInput.current = "";
      if (inputTimer.current) clearTimeout(inputTimer.current);
      inputTimer.current = null;
      const closeSession = pending
        ? postTerminalAction(terminalId, "input", { data: pending })
        : Promise.resolve();
      void closeSession
        .then(() => postTerminalAction(terminalId, "close"))
        .catch(reportTerminalError);
    };
  }, [terminalId]);

  useEffect(() => {
    if (!isResizing) return;
    function resize(event: PointerEvent) {
      const start = resizeStart.current;
      if (!start) return;
      const maxHeight = Math.min(window.innerHeight * 0.75, 720);
      setHeight(
        Math.max(180, Math.min(maxHeight, start.height + start.pointerY - event.clientY)),
      );
    }
    function stopResize() {
      resizeStart.current = null;
      setIsResizing(false);
    }
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };
  }, [isResizing]);

  return (
    <section className="sandbox-shell-dock" style={{ height }}>
      <div
        className="sandbox-shell-resize"
        role="separator"
        aria-label="シェル領域の高さを変更"
        aria-orientation="horizontal"
        aria-valuenow={height}
        aria-valuemin={180}
        aria-valuemax={Math.min(
          typeof window === "undefined" ? 720 : window.innerHeight * 0.75,
          720,
        )}
        tabIndex={0}
        onPointerDown={(event) => {
          resizeStart.current = { pointerY: event.clientY, height };
          setIsResizing(true);
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            setHeight((current) => Math.min(current + 24, 720));
            event.preventDefault();
          } else if (event.key === "ArrowDown") {
            setHeight((current) => Math.max(current - 24, 180));
            event.preventDefault();
          }
        }}
      />
      <div className="sandbox-shell-toolbar">
        <strong>
          <TerminalWindowIcon size={16} aria-hidden="true" /> シェル
        </strong>
        <Select
          aria-label="実行するインスタンス"
          placeholder="シェルを選択"
          data={instances.map((instance) => ({
            value: instance.instanceId,
            label: `${instance.sandboxName} · ${instance.scopeLabel} · ${instance.instanceId}`,
          }))}
          value={selectedInstanceId}
          onChange={onSelectInstance}
          searchable
          nothingFoundMessage="該当するインスタンスがありません"
          disabled={
            terminalFetcher.state !== "idle"
          }
          className="sandbox-shell-instance-select"
        />
        <button
          type="button"
          className="sandbox-shell-close"
          onClick={onClose}
          aria-label="シェルを閉じる"
        >
          ×
        </button>
      </div>
      <p className="sandbox-shell-warning">
        シェル実行中はすべてのドメインへの通信が許可されます。
        {(terminalFetcher.state !== "idle" || terminalId) && (
          <span className="sandbox-shell-running" role="status">
            ● {terminalId ? "接続中" : "起動中"}
          </span>
        )}
      </p>
      {terminalError && (
        <p className="sandbox-shell-error" role="alert">
          端末を読み込めませんでした: {terminalError}
        </p>
      )}
      <div
        className="sandbox-shell-terminal"
        ref={terminalHost}
        aria-label="サンドボックスシェル端末"
        onClick={() => terminal.current?.focus()}
      />
    </section>
  );
}

function parsePublicIds(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { slot: PublicIdSlot; id: string } =>
        item &&
        typeof item === "object" &&
        (item.slot === "first" || item.slot === "second") &&
        typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

function parseWebhookEndpoints(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { adapterName: string; url: string } =>
        item &&
        typeof item === "object" &&
        typeof item.adapterName === "string" &&
        typeof item.url === "string",
    );
  } catch {
    return [];
  }
}

function EntityCell({
  page,
  record,
  columnKey,
  value,
  onStatusChange,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  columnKey: string;
  value: string | number;
  onStatusChange: (enabled: boolean) => void;
}) {
  if (columnKey === "webhooks" && page.icon === "bots") {
    const endpoints = parseWebhookEndpoints(value);
    if (endpoints.length === 0) return <span className="table-text">—</span>;
    return <span className="table-text">{endpoints.length} 件</span>;
  }

  if (columnKey === "status" && page.icon === "bots")
    return (
      <Group gap="xs">
        <Switch
          checked={String(value) === "稼働中"}
          onChange={(event) => onStatusChange(event.currentTarget.checked)}
          aria-label={`${record[page.columns[0].key]}の稼働状態を変更`}
        />
        <span className="table-text">{value}</span>
      </Group>
    );
  if (columnKey === "status") return <Status value={String(value ?? "")} />;
  if (columnKey === "provider") {
    const provider = String(value ?? "");
    return (
      <span className="provider-pill">
        <span className="provider-dot">{provider.slice(0, 1)}</span>
        {provider}
      </span>
    );
  }

  return (
    <span className={columnKey === "endpoint" ? "mono" : "table-text"}>
      {value || "—"}
    </span>
  );
}

function Status({ value }: { value: string }) {
  const active = ["稼働中", "接続済み", "接続先登録済み", "有効"].includes(
    value,
  );
  const pending = ["招待中", "未接続", "接続先未設定"].includes(value);

  return (
    <Badge
      className={`status-badge ${active ? "success" : pending ? "pending" : "muted"}`}
      variant="light"
      radius="sm"
      leftSection={<span className="status-dot" />}
    >
      {value}
    </Badge>
  );
}
