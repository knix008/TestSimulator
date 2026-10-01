import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import type { IPty } from "node-pty";
import { WebSocket } from "ws";
import type { InstalledShell } from "./shells.js";

const nodeRequire = createRequire(import.meta.url);
const MAX_BUFFER = 200_000;

type PtyModule = {
  spawn: (file: string, args: string[] | string, options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
    useConptyDll?: boolean;
  }) => IPty;
};

export class TerminalSession {
  private pty: IPty | null = null;
  private socket: WebSocket | null = null;
  private buffer = "";
  private runningId = "";
  private replaying = false;

  constructor(private readonly deps: {
    shell: () => InstalledShell | null;
    cwd: () => string;
  }) {}

  attach(socket: WebSocket): void {
    if (this.socket && this.socket !== socket) this.socket.close();
    this.socket = socket;
    this.replaying = true;
    this.ensure();
    if (this.buffer) this.sendBinary(this.buffer);
    this.replaying = false;
    socket.on("message", (data, isBinary) => {
      const text = rawText(data).slice(0, 65536);
      if (!text) return;
      if (isBinary) {
        this.pty?.write(text);
        return;
      }
      let message: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        message = JSON.parse(text) as { type?: string; data?: string; cols?: number; rows?: number };
      } catch {
        return;
      }
      if (message.type === "input" && typeof message.data === "string") this.pty?.write(message.data.slice(0, 65536));
      if (message.type === "resize") {
        const cols = Math.floor(Number(message.cols));
        const rows = Math.floor(Number(message.rows));
        if (cols >= 2 && cols <= 500 && rows >= 1 && rows <= 200) {
          try {
            this.pty?.resize(cols, rows);
          } catch {
            /* the shell may already have exited */
          }
        }
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
    });
  }

  restart(): void {
    this.killPty();
    this.buffer = "";
    this.sendControl({ type: "reset" });
    if (this.socket) this.ensure();
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
    this.killPty();
  }

  private ensure(): void {
    const shell = this.deps.shell();
    if (!shell) return;
    if (this.pty && this.runningId === shell.id) return;
    this.killPty();
    let spawned: IPty;
    try {
      const pty = nodeRequire("node-pty") as PtyModule;
      spawned = pty.spawn(shell.command, shell.args, {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: usableDirectory(this.deps.cwd()),
        env: shellEnv(),
        useConptyDll: process.platform === "win32",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendBinary(`\r\n${message}\r\n`);
      return;
    }
    this.pty = spawned;
    this.runningId = shell.id;
    spawned.onData((data) => {
      if (this.pty !== spawned) return;
      this.buffer = (this.buffer + data).slice(-MAX_BUFFER);
      if (!this.replaying) this.sendBinary(data);
    });
    spawned.onExit(() => {
      if (this.pty !== spawned) return;
      this.pty = null;
      this.runningId = "";
      this.sendControl({ type: "exit" });
    });
  }

  private killPty(): void {
    const current = this.pty;
    this.pty = null;
    this.runningId = "";
    if (!current) return;
    try {
      current.kill();
    } catch {
      /* already exited */
    }
  }

  private sendBinary(data: string): void {
    if (!data || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(Buffer.from(data, "utf8"));
  }

  private sendControl(message: { type: string }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}

function rawText(data: Buffer | ArrayBuffer | Buffer[] | string): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return Buffer.from(data).toString("utf8");
}

function usableDirectory(target: string): string {
  try {
    if (target && fs.statSync(target).isDirectory()) return target;
  } catch {
    /* use the home directory */
  }
  return os.homedir();
}

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  env.TERM = "xterm-256color";
  return env;
}
