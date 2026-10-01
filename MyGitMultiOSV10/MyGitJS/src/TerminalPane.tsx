import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

export function TerminalPane(props: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitRef = useRef<() => void>(() => undefined);
  const startRef = useRef<() => void>(() => undefined);
  const active = useRef(props.active);
  active.current = props.active;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "Consolas, \"Cascadia Mono\", \"Malgun Gothic\", monospace",
      fontSize: 13,
      scrollback: 2000,
      theme: readTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    term.current = terminal;

    let socket: WebSocket | null = null;
    let retry = 0;
    let disposed = false;

    const send = (message: unknown) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const fitNow = () => {
      if (!active.current || element.clientWidth < 2 || element.clientHeight < 2) return;
      fit.fit();
      const row = element.querySelector(".xterm-rows > div") as HTMLElement | null;
      const cellHeight = row?.getBoundingClientRect().height ?? 0;
      if (cellHeight > 0) {
        const style = getComputedStyle(element);
        const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const rows = Math.max(1, Math.floor((element.clientHeight - padY) / cellHeight));
        if (rows !== terminal.rows) terminal.resize(terminal.cols, rows);
      }
      send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    };
    fitRef.current = fitNow;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const next = new WebSocket(`${protocol}://${window.location.host}/api/terminal`);
      socket = next;
      next.binaryType = "arraybuffer";
      next.onopen = () => {
        terminal.reset();
        terminal.options.theme = readTheme();
        fitNow();
      };
      next.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data) as { type?: string };
            if (message.type === "reset") terminal.reset();
          } catch {
            terminal.write(event.data);
          }
          return;
        }
        terminal.write(new Uint8Array(event.data));
      };
      next.onclose = () => {
        if (socket === next) socket = null;
        if (!disposed) retry = window.setTimeout(connect, 1000);
      };
    };

    const observer = new ResizeObserver(() => fitNow());
    observer.observe(element);
    const onTheme = () => {
      if (!active.current) return;
      terminal.options.theme = readTheme();
    };
    document.documentElement.addEventListener("mygit-theme", onTheme);
    terminal.onData((data) => send({ type: "input", data }));
    startRef.current = () => {
      if (socket || disposed) return;
      connect();
    };

    return () => {
      disposed = true;
      window.clearTimeout(retry);
      observer.disconnect();
      document.documentElement.removeEventListener("mygit-theme", onTheme);
      socket?.close();
      term.current = null;
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    if (!props.active) return;
    if (term.current) term.current.options.theme = readTheme();
    startRef.current();
    fitRef.current();
    term.current?.focus();
  }, [props.active]);

  return <div className="terminal-host" ref={host} hidden={!props.active} />;
}

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: value("--panel", "#ffffff"),
    foreground: value("--ink", "#1f2328"),
    cursor: value("--accent", "#2563eb"),
    selectionBackground: value("--selected", "#e8efff"),
  };
}
