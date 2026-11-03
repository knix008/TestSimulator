/**
 * Every terminal tab of the bottom panel is one TerminalSession here, keyed by the tab's
 * id. A tab started with a shell of its own keeps that shell; the others follow
 * Preferences › Terminal shell and restart when it changes. A session outlives its
 * socket (the panel may be hidden and shown again) and is only ended by close().
 */
import type { WebSocket } from "ws";
import { installedShells, resolveShell } from "./shells.js";
import { TerminalSession } from "./terminalSession.js";

/** The id a socket without one gets: what the single terminal of earlier builds used. */
export const DEFAULT_TERMINAL_ID = "main";
const MAX_TERMINALS = 32;

export function terminalId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : DEFAULT_TERMINAL_ID;
}

type Entry = { session: TerminalSession; shellId: string };

export class TerminalHub {
  private readonly sessions = new Map<string, Entry>();

  constructor(private readonly deps: {
    /** The shell from the settings (Preferences › Terminal shell). */
    defaultShell: () => string;
    settings: () => Record<string, unknown>;
    cwd: () => string;
  }) {}

  /** Connects a socket to tab `id`, starting its shell (`shellId`, or the default) once. */
  attach(id: string, shellId: string, socket: WebSocket): void {
    let entry = this.sessions.get(id);
    if (!entry) {
      if (this.sessions.size >= MAX_TERMINALS) {
        socket.close(1013, "too many terminals");
        return;
      }
      const chosen = shellId.trim();
      const session = new TerminalSession({
        shell: () => resolveShell(installedShells(), chosen || this.deps.defaultShell()),
        settings: this.deps.settings,
        cwd: this.deps.cwd,
      });
      entry = { session, shellId: chosen };
      this.sessions.set(id, entry);
    }
    // A tab is closed from its own socket too: {"type":"close"}.
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      try {
        if ((JSON.parse(String(data)) as { type?: string }).type === "close") this.close(id);
      } catch {
        /* input and resize messages are the session's */
      }
    });
    entry.session.attach(socket);
  }

  /** Ends tab `id`: its shell is killed and its output forgotten. */
  close(id: string): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    this.sessions.delete(id);
    entry.session.close();
    return true;
  }

  /** The tabs that follow the default shell start it again (the setting changed). */
  restartDefault(): void {
    for (const entry of this.sessions.values()) {
      if (!entry.shellId) entry.session.restart();
    }
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  ids(): string[] {
    return [...this.sessions.keys()];
  }
}
