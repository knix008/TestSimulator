// Drives terminals with a stand-in WebSocket: what the Prompt and Terminal tests use to
// see real shells run without a browser.
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import type { TerminalHub } from "../../core/terminalHub.js";
import { TerminalSession } from "../../core/terminalSession.js";
import type { InstalledShell } from "../../core/shells.js";

/** A WebSocket as far as TerminalSession and TerminalHub use one. */
export class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  output = "";

  send(data: Buffer | string): void {
    if (typeof data === "string") return;
    const text = data.toString("utf8");
    this.output += text;
    // Answer what a terminal is asked (xterm does in the app): ConPTY and some shells
    // wait for the device attributes and the cursor position before going on.
    if (text.includes("\x1b[c")) this.reply("\x1b[?1;2c");
    if (text.includes("\x1b[6n")) this.reply("\x1b[1;1R");
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  /** Sends a JSON message as the browser would. */
  message(value: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(value)), false);
  }

  type(text: string): void {
    this.message({ type: "input", data: text });
  }

  private reply(text: string): void {
    setTimeout(() => this.type(text), 0);
  }

  async waitFor(test: (output: string) => boolean, ms = 20000): Promise<string> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (test(this.output)) return this.output;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out; output so far:\n${JSON.stringify(this.output.slice(-1500))}`);
  }
}

export type ShellRun = {
  output: () => string;
  type: (text: string) => void;
  waitFor: (test: (output: string) => boolean, ms?: number) => Promise<string>;
  close: () => void;
};

export function runShell(shell: InstalledShell, cwd: string, settings: () => Record<string, unknown>): ShellRun {
  const socket = new FakeSocket();
  const session = new TerminalSession({ shell: () => shell, cwd: () => cwd, settings });
  session.attach(socket as unknown as WebSocket);
  socket.message({ type: "resize", cols: 160, rows: 30 });
  return {
    output: () => socket.output,
    type: (text) => socket.type(text),
    waitFor: (test, ms) => socket.waitFor(test, ms),
    close: () => session.close(),
  };
}

/** Opens tab `id` of `hub` on a fresh stand-in socket. */
export function attachTab(hub: TerminalHub, id: string, shellId = ""): FakeSocket {
  const socket = new FakeSocket();
  hub.attach(id, shellId, socket as unknown as WebSocket);
  socket.message({ type: "resize", cols: 160, rows: 30 });
  return socket;
}
