import { useCallback, useEffect, useRef } from "react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon as FitAddonType } from "@xterm/addon-fit";

interface TerminalProps {
  sessionId: string;
  disableStdin?: boolean;
  onOutput?: (text: string) => void;
  onExit?: (code: number) => void;
}

export function Terminal({ sessionId, disableStdin = false, onOutput, onExit }: TerminalProps) {
  const fitTargetRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddonType | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const initializedRef = useRef(false);
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const initTerminal = useCallback(async () => {
    if (!fitTargetRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");
    await import("@xterm/xterm/css/xterm.css");

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;

    const term = new Terminal({
      cursorBlink: !disableStdin,
      cursorStyle: disableStdin ? "underline" : "bar",
      disableStdin,
      fontSize: 14,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: {
        background: "#0d0d0d",
        foreground: "#c8c8d8",
        cursor: disableStdin ? "#0d0d0d" : "#ffffff",
        cursorAccent: "#0d0d0d",
        selectionBackground: "rgba(255,255,255,0.2)",
        black: "#1a1a2e",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#4fd1c5",
        white: "#c8c8d8",
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(fitTargetRef.current);
    termRef.current = term;

    const syncFit = () => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    };
    syncFit();
    requestAnimationFrame(() => {
      syncFit();
      setTimeout(syncFit, 0);
    });

    // WebSocket
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/ws?session_id=${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let dumpReceived = false;

    const sendResize = () => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch { /* ignore */ }
    };

    ws.onopen = () => sendResize();

    const decoder = new TextDecoder();
    const emitOutput = (bytes: Uint8Array) => {
      if (onOutputRef.current) {
        onOutputRef.current(decoder.decode(bytes, { stream: true }));
      }
    };

    ws.onmessage = (ev) => {
      const data = ev.data;
      if (data instanceof ArrayBuffer) {
        if (!dumpReceived) { term.reset(); dumpReceived = true; requestAnimationFrame(() => sendResize()); }
        const arr = new Uint8Array(data);
        term.write(arr);
        emitOutput(arr);
        return;
      }
      if (data instanceof Blob) {
        data.arrayBuffer().then((buf) => {
          if (!dumpReceived) { term.reset(); dumpReceived = true; requestAnimationFrame(() => sendResize()); }
          const arr = new Uint8Array(buf);
          term.write(arr);
          emitOutput(arr);
        });
        return;
      }
      if (typeof data === "string") {
        // Check for exit message from server
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "exit" && typeof parsed.code === "number") {
            if (onExitRef.current) onExitRef.current(parsed.code);
            return;
          }
        } catch { /* not JSON, treat as terminal data */ }
        if (!dumpReceived) { term.reset(); dumpReceived = true; }
        term.write(data);
        if (onOutputRef.current) onOutputRef.current(data);
      }
    };

    ws.onclose = () => term.writeln("\r\n\x1b[90m[Installation process ended]\x1b[0m");
    ws.onerror = () => term.writeln("\r\n\x1b[31m[WebSocket error]\x1b[0m");

    // Terminal input → PTY (only if stdin enabled)
    let dispose: { dispose: () => void } | null = null;
    if (!disableStdin) {
      dispose = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
    }

    // Resize
    const fitAndResize = () => sendResize();
    window.addEventListener("resize", fitAndResize);
    const ro = new ResizeObserver(fitAndResize);
    ro.observe(fitTargetRef.current);

    cleanupRef.current = () => {
      dispose?.dispose();
      window.removeEventListener("resize", fitAndResize);
      ro.disconnect();
      ws.close();
    };
  }, [sessionId, disableStdin]);

  useEffect(() => {
    initTerminal();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      initializedRef.current = false;
    };
  }, [initTerminal]);

  return (
    <div className="h-full w-full bg-[#0d0d0d] p-1">
      <div ref={fitTargetRef} className="h-full w-full" />
    </div>
  );
}
