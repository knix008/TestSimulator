import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import type { IPty } from "node-pty";
import { WebSocket } from "ws";
import { PromptServer } from "./promptHook.js";
import type { InstalledShell } from "./shells.js";

const nodeRequire = createRequire(import.meta.url);
const MAX_BUFFER = 200_000;

/**
 * Questions a program asks the terminal (device attributes, cursor position, colours).
 * The terminal answers them as if typed, so they must reach it exactly once: they are
 * left out of the replay buffer, or a tab shown again would answer them again and the
 * shell would read "[>1;2c" on its command line.
 */
const QUERY = /\x1b\[[>=]?0?c|\x1b\[\??[56]n|\x1b\]1[0-2];\?(?:\x07|\x1b\\)/g;
/** The answers: DA (CSI ? … c), DA2/DA3 (CSI > … c, DCS ! | … ST), cursor position (CSI r;c R). */
const REPLY = /\x1b\[\?[\d;]*c|\x1b\[>[\d;]*c|\x1bP!\|[0-9A-Fa-f]*\x1b\\|\x1b\[\d+;\d+R|\x1b\[[0-3]n/g;

/** Output with the terminal queries removed (what a reattached terminal is replayed). */
export function withoutQueries(output: string): string {
  return output.replace(QUERY, "");
}

/** How many queries of each kind `output` asks. */
export function countQueries(output: string): { da: number; cpr: number } {
  let da = 0;
  let cpr = 0;
  for (const match of output.matchAll(QUERY)) {
    if (match[0].endsWith("c")) da++;
    else if (match[0].endsWith("n")) cpr++;
  }
  return { da, cpr };
}

/**
 * Typed input with the terminal's answers that nobody asked for removed; `pending` is
 * how many of each are still awaited (decremented as answers pass).
 */
export function filterReplies(input: string, pending: { da: number; cpr: number }): string {
  return input.replace(REPLY, (reply) => {
    const kind = reply.endsWith("R") || reply.endsWith("n") ? "cpr" : "da";
    if (pending[kind] > 0) {
      pending[kind]--;
      return reply;
    }
    return "";
  });
}

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
  /** Bumped by every spawn and kill, so a spawn that finishes late knows it is stale. */
  private generation = 0;
  private spawning = "";
  private size = { cols: 80, rows: 24 };
  /** Terminal queries the shell sent that the terminal has not answered yet. */
  private readonly pending = { da: 0, cpr: 0 };
  private readonly prompts: PromptServer | null;

  constructor(private readonly deps: {
    shell: () => InstalledShell | null;
    cwd: () => string;
    /** The saved settings; with it, shells draw the prompt from Preferences › Prompt. */
    settings?: () => Record<string, unknown>;
  }) {
    this.prompts = deps.settings ? new PromptServer(deps.settings) : null;
  }

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
        const typed = filterReplies(text, this.pending);
        if (typed) this.pty?.write(typed);
        return;
      }
      let message: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        message = JSON.parse(text) as { type?: string; data?: string; cols?: number; rows?: number };
      } catch {
        return;
      }
      if (message.type === "input" && typeof message.data === "string") {
        const typed = filterReplies(message.data.slice(0, 65536), this.pending);
        if (typed) this.pty?.write(typed);
      }
      if (message.type === "resize") {
        const cols = Math.floor(Number(message.cols));
        const rows = Math.floor(Number(message.rows));
        if (cols >= 2 && cols <= 500 && rows >= 1 && rows <= 200) {
          this.size = { cols, rows };
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
    this.prompts?.close();
  }

  private ensure(): void {
    const shell = this.deps.shell();
    if (!shell) return;
    if (this.pty && this.runningId === shell.id) return;
    if (this.spawning === shell.id) return;
    this.killPty();
    const ticket = this.generation;
    this.spawning = shell.id;
    // The prompt hook may first start its loopback server, so the spawn is async.
    const hooked = this.prompts
      ? this.prompts.hook(shell).catch(() => ({ args: shell.args, env: {} as Record<string, string> }))
      : Promise.resolve({ args: shell.args, env: {} as Record<string, string> });
    void hooked.then((start) => {
      if (this.spawning === shell.id) this.spawning = "";
      if (ticket !== this.generation) return;
      this.spawn(shell, start.args, start.env);
    });
  }

  private spawn(shell: InstalledShell, args: string[], extraEnv: Record<string, string>): void {
    let spawned: IPty;
    try {
      const pty = nodeRequire("node-pty") as PtyModule;
      spawned = pty.spawn(shell.command, args, {
        name: "xterm-256color",
        cols: this.size.cols,
        rows: this.size.rows,
        cwd: usableDirectory(this.deps.cwd()),
        env: { ...shellEnv(), ...extraEnv },
        useConptyDll: process.platform === "win32",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendBinary(`\r\n${message}\r\n`);
      return;
    }
    this.generation++;
    this.pty = spawned;
    this.runningId = shell.id;
    spawned.onData((data) => {
      if (this.pty !== spawned) return;
      const asked = countQueries(data);
      this.pending.da = Math.min(4, this.pending.da + asked.da);
      this.pending.cpr = Math.min(4, this.pending.cpr + asked.cpr);
      this.buffer = (this.buffer + withoutQueries(data)).slice(-MAX_BUFFER);
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
    this.generation++;
    this.spawning = "";
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
