import type { Route } from "./+types/sandbox-terminal";
import { requireUser } from "../.server/auth";
import {
  closeSandboxTerminal,
  hasOwnedSandboxTerminal,
  resizeSandboxTerminal,
  sendSandboxTerminalInput,
  subscribeSandboxTerminal,
} from "../.server/features/toolsets/sandboxes/terminal-sessions";
import { appLogger } from "~/.server/logger/app-logger";

const encoder = new TextEncoder();

function encodeEvent(event: {
  offset: number;
  data: Buffer;
  closed?: boolean;
}) {
  if (event.closed) return encoder.encode("event: exit\ndata: {}\n\n");
  return encoder.encode(
    `id: ${event.offset + event.data.byteLength}\ndata: ${JSON.stringify({
      data: event.data.toString("base64"),
    })}\n\n`,
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const terminalId = params.terminalId;
  if (!terminalId || !hasOwnedSandboxTerminal(user.id, terminalId))
    return new Response("シェルセッションが見つかりません。", { status: 404 });

  const headerOffset = Number(request.headers.get("Last-Event-ID") ?? "0");
  const lastEventId =
    Number.isSafeInteger(headerOffset) && headerOffset >= 0 ? headerOffset : 0;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;

  function stop() {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
    request.signal.removeEventListener("abort", stop);
    try {
      streamController?.close();
    } catch (error) {
      appLogger.debug("Terminal SSE stream already closed", {
        error,
        terminalId,
      });
    }
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      unsubscribe = subscribeSandboxTerminal(
        user.id,
        terminalId,
        lastEventId,
        (event) => {
          if (closed) return;
          if (event.closed) {
            controller.enqueue(encodeEvent(event));
            stop();
            return;
          }
          controller.enqueue(encodeEvent(event));
        },
      );
      if (!unsubscribe) {
        stop();
        return;
      }
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 20_000);
      request.signal.addEventListener("abort", stop, { once: true });
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const terminalId = params.terminalId;
  if (!terminalId)
    return Response.json(
      { ok: false, error: "シェルセッションが見つかりません。" },
      { status: 404 },
    );

  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");
  try {
    if (intent === "input") {
      await sendSandboxTerminalInput(
        user.id,
        terminalId,
        String(form.get("data") ?? ""),
      );
      return Response.json({ ok: true });
    }
    if (intent === "resize") {
      await resizeSandboxTerminal(user.id, terminalId, {
        cols: Number(form.get("cols")),
        rows: Number(form.get("rows")),
      });
      return Response.json({ ok: true });
    }
    if (intent === "close") {
      await closeSandboxTerminal(user.id, terminalId);
      return Response.json({ ok: true });
    }
    return Response.json(
      { ok: false, error: "操作を判定できませんでした。" },
      { status: 400 },
    );
  } catch (error) {
    appLogger.error("Sandbox terminal operation failed", {
      error,
      terminalId,
      intent,
    });
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "シェル操作に失敗しました。",
      },
      { status: 400 },
    );
  }
}
