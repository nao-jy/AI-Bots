import { t, tMessage } from "~/i18n";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import "@xterm/xterm/css/xterm.css";
import { Select } from "@mantine/core";
import { TerminalWindowIcon } from "@phosphor-icons/react";

export type PersistentInstance = {
  instanceId: string;
  scopeLabel: string;
};
export type SandboxShellInstance = PersistentInstance & {
  sandboxId: string;
  sandboxName: string;
};
type TerminalStartResponse = {
  ok: boolean;
  terminalId?: string;
  instanceId?: string;
  error?: string;
};

export function parsePersistentInstances(value: string | number | undefined) {
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

export function SandboxShell({
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
          ? tMessage(result.error)
          : t(
              "components.entityPage.sandboxShell.shellActionFailedWithStatus",
              { 0: response.status },
            );
      throw new Error(error);
    }
  }

  function reportTerminalError(error: unknown) {
    const message = tMessage(
      error instanceof Error
        ? error.message
        : t("components.entityPage.sandboxShell.shellActionFailed"),
    );
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
          void postTerminalAction(activeTerminalId, "input", {
            data: input,
          }).catch(reportTerminalError);
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
        `\x1b[90m${t("components.entityPage.sandboxShell.terminalDescription")}\x1b[0m\r\n`,
      );
      if (selectedInstanceId) {
        instanceTerminal.write(
          `\x1b[90m${t("components.entityPage.sandboxShell.connecting", { 0: selectedSandboxNameRef.current, 1: selectedInstanceId })}\x1b[0m\r\n`,
        );
      } else {
        instanceTerminal.write(
          `\x1b[90m${t("components.entityPage.sandboxShell.selectInstancePrompt")}\x1b[0m\r\n`,
        );
      }
      setTerminalReady(true);
    }

    void initializeTerminal().catch((error: unknown) => {
      if (!disposed) {
        setTerminalError(
          error instanceof Error
            ? tMessage(error.message)
            : t(
                "components.entityPage.sandboxShell.terminalInitializationFailed",
              ),
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
        `\x1b[90m${t("components.entityPage.sandboxShell.connecting", { 0: selectedSandboxNameRef.current, 1: selectedInstanceId })}\x1b[0m\r\n`,
      );
    } else {
      activeTerminal.write(
        `\x1b[90m${t("components.entityPage.sandboxShell.selectInstancePrompt")}\x1b[0m\r\n`,
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
      setTerminalError(
        response.error
          ? tMessage(response.error)
          : t("components.entityPage.sandboxShell.shellStartFailed"),
      );
      return;
    }
    setTerminalId(response.terminalId);
    terminalIdRef.current = response.terminalId;
  }, [selectedInstanceId, terminalFetcher.data, terminalFetcher.state]);

  useEffect(() => {
    if (!terminalId) return;
    const activeTerminal = terminal.current;
    if (!activeTerminal) return;

    const source = new EventSource(`/api/sandbox-terminals/${terminalId}`);
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
          throw new Error(
            t("components.entityPage.sandboxShell.invalidTerminalOutput"),
          );
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
        Math.max(
          180,
          Math.min(maxHeight, start.height + start.pointerY - event.clientY),
        ),
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
        aria-label={t("components.entityPage.sandboxShell.resizeShellRegion")}
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
          <TerminalWindowIcon size={16} aria-hidden="true" />{" "}
          {t("components.entityPage.sandboxShell.shellSuffix")}
        </strong>
        <Select
          aria-label={t("components.entityPage.sandboxShell.instanceLabel")}
          placeholder={t("components.entityPage.sandboxShell.selectShell")}
          data={instances.map((instance) => ({
            value: instance.instanceId,
            label: `${instance.sandboxName} · ${tMessage(instance.scopeLabel)} · ${instance.instanceId}`,
          }))}
          value={selectedInstanceId}
          onChange={onSelectInstance}
          searchable
          nothingFoundMessage={t(
            "components.entityPage.sandboxShell.noInstancesFound",
          )}
          disabled={terminalFetcher.state !== "idle"}
          className="sandbox-shell-instance-select"
        />
        <button
          type="button"
          className="sandbox-shell-close"
          onClick={onClose}
          aria-label={t("components.entityPage.sandboxShell.closeShell")}
        >
          {t("components.entityPage.sandboxShell.closeSymbol")}
        </button>
      </div>
      <p className="sandbox-shell-warning">
        {t("components.entityPage.sandboxShell.networkAccessNotice")}
        {(terminalFetcher.state !== "idle" || terminalId) && (
          <span className="sandbox-shell-running" role="status">
            {t("components.entityPage.sandboxShell.connectedStatusSymbol")}
            {terminalId
              ? t("components.entityPage.sandboxShell.connectedStatus")
              : t("components.entityPage.sandboxShell.startingStatus")}
          </span>
        )}
      </p>
      {terminalError && (
        <p className="sandbox-shell-error" role="alert">
          {t("components.entityPage.sandboxShell.terminalLoadFailedPrefix")}
          {tMessage(terminalError)}
        </p>
      )}
      <div
        className="sandbox-shell-terminal"
        ref={terminalHost}
        aria-label={t("components.entityPage.sandboxShell.terminalAriaLabel")}
        onClick={() => terminal.current?.focus()}
      />
    </section>
  );
}
