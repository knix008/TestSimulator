// Test cases for the terminal tabs of the bottom panel; test/cases.ts runs them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { installedShells, type InstalledShell } from "../../core/shells.js";
import { TerminalHub, terminalId } from "../../core/terminalHub.js";
import { countQueries, filterReplies, TerminalSession, withoutQueries } from "../../core/terminalSession.js";
import { startServer } from "../../server/index.js";
import { translate } from "../../src/i18n.js";
import { closeTerminal, openTerminal, resetTerminalTabs, setShells, stepTerminal, tabTitle, terminalTabsState } from "../../src/terminalTabStore.js";
import { terminalStrings } from "../../src/strings/terminal.js";
import { attachTab, FakeSocket } from "./promptShell.js";
import { assert, type AddCase, type FeatureCtx } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A shell that runs `echo` the same way everywhere it is installed. */
function anyShell(): InstalledShell {
  const shell = installedShells().find((item) => /powershell|pwsh|cmd|bash|zsh/i.test(path.basename(item.command)));
  assert(shell, "no shell installed");
  return shell;
}

const count = (text: string, word: string) => text.split(word).length - 1;

export function terminalCases(ctx: FeatureCtx, add: AddCase): void {
  add("Terminal", "Two terminal tabs run their own shells side by side", async () => {
    const shell = anyShell();
    const hub = new TerminalHub({ defaultShell: () => shell.id, settings: () => ({}), cwd: () => ctx.repo });
    try {
      const one = attachTab(hub, "one");
      const two = attachTab(hub, "two");
      assert(hub.ids().join(",") === "one,two", hub.ids().join(","));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      one.type("echo MGM_TAB_ONE\r");
      two.type("echo MGM_TAB_TWO\r");
      await one.waitFor((out) => count(out, "MGM_TAB_ONE") >= 2);
      await two.waitFor((out) => count(out, "MGM_TAB_TWO") >= 2);
      assert(!one.output.includes("MGM_TAB_TWO") && !two.output.includes("MGM_TAB_ONE"), "each tab sees only its own shell");
    } finally {
      hub.closeAll();
    }
  });

  add("Terminal", "Closing a tab ends its shell and leaves the others running", async () => {
    const shell = anyShell();
    const hub = new TerminalHub({ defaultShell: () => shell.id, settings: () => ({}), cwd: () => ctx.repo });
    try {
      attachTab(hub, "a");
      const b = attachTab(hub, "b");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const a = new FakeSocket();
      // Closed from its own socket, as the tab's × does over HTTP.
      hub.attach("a", "", a as unknown as WebSocket);
      a.message({ type: "close" });
      assert(hub.ids().join(",") === "b", hub.ids().join(","));
      b.type("echo MGM_STILL_HERE\r");
      await b.waitFor((out) => count(out, "MGM_STILL_HERE") >= 2);
      assert(!hub.close("a"), "closing twice is harmless");
      assert(terminalId("../x") === "main" && terminalId("t1a") === "t1a", "ids are checked");
    } finally {
      hub.closeAll();
    }
  });

  add("Terminal", "The terminal socket is routed by tab id and a tab closes over HTTP", async () => {
    process.env.MGM_SETTINGS_DIR = path.join(ctx.home, "terminal-settings");
    const server = await startServer({ port: 0, host: "127.0.0.1" });
    const base = `127.0.0.1:${server.port}`;
    const open = (id: string) => new Promise<{ socket: WebSocket; output: () => string }>((resolve, reject) => {
      const socket = new WebSocket(`ws://${base}/api/terminal?id=${id}`);
      let output = "";
      socket.on("message", (data, isBinary) => {
        const text = String(data);
        if (!isBinary) return;
        output += text;
        if (text.includes("\x1b[c")) socket.send(JSON.stringify({ type: "input", data: "\x1b[?1;2c" }));
        if (text.includes("\x1b[6n")) socket.send(JSON.stringify({ type: "input", data: "\x1b[1;1R" }));
      });
      socket.once("open", () => resolve({ socket, output: () => output }));
      socket.once("error", reject);
    });
    const waitFor = async (test: () => boolean) => {
      const deadline = Date.now() + 20000;
      while (!test()) {
        if (Date.now() > deadline) throw new Error("timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    try {
      const first = await open("first");
      const second = await open("second");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      first.socket.send(JSON.stringify({ type: "input", data: "echo MGM_FIRST\r" }));
      second.socket.send(JSON.stringify({ type: "input", data: "echo MGM_SECOND\r" }));
      await waitFor(() => count(first.output(), "MGM_FIRST") >= 2 && count(second.output(), "MGM_SECOND") >= 2);
      assert(!first.output().includes("MGM_SECOND"), "the first tab did not get the second's output");
      const closed = await fetch(`http://${base}/api/terminal/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "first" }),
      }).then((response) => response.json()) as { closed: boolean };
      assert(closed.closed, JSON.stringify(closed));
      await waitFor(() => first.socket.readyState === WebSocket.CLOSED);
      second.socket.send(JSON.stringify({ type: "input", data: "echo MGM_SECOND_AGAIN\r" }));
      await waitFor(() => count(second.output(), "MGM_SECOND_AGAIN") >= 2);
      first.socket.close();
      second.socket.close();
    } finally {
      await server.close();
    }
  });

  add("Terminal", "Terminal queries are answered once: never replayed, stray answers dropped", async () => {
    // What ConPTY and shells ask, and what xterm answers as if typed.
    const output = "start\x1b[c\x1b[>c\x1b[6nPS C:\\> \x1b]11;?\x07";
    assert(withoutQueries(output) === "startPS C:\\> ", JSON.stringify(withoutQueries(output)));
    const asked = countQueries(output);
    assert(asked.da === 2 && asked.cpr === 1, JSON.stringify(asked));
    const pending = { da: 1, cpr: 0 };
    assert(filterReplies("\x1b[?1;2cls", pending) === "\x1b[?1;2cls" && pending.da === 0, "an answer that was asked for passes");
    assert(filterReplies("\x1b[>1;2c", pending) === "", "the reply the user saw as [>1;2c is dropped");
    assert(filterReplies("\x1b[>0;276;0cdir\r", pending) === "dir\r", "typing around it survives");
    assert(filterReplies("\x1b[12;40R", pending) === "", "an unasked cursor report is dropped");

    // A tab shown again gets the screen back without the questions in it.
    const shell = anyShell();
    const session = new TerminalSession({ shell: () => shell, cwd: () => ctx.repo });
    try {
      const first = new FakeSocket();
      session.attach(first as unknown as WebSocket);
      await first.waitFor((out) => out.length > 0 && !/^\s*$/.test(out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")), 20000);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const again = new FakeSocket();
      session.attach(again as unknown as WebSocket);
      assert(again.output.length > 0, "the screen is replayed");
      assert(!/\x1b\[[>=]?0?c|\x1b\[\??6n/.test(again.output), `no query in the replay: ${JSON.stringify(again.output.slice(0, 200))}`);
      // The new terminal answers nothing, and the shell must not see anything typed.
      again.type("\x1b[>1;2c");
      again.type("echo MGM_CLEAN\r");
      await again.waitFor((out) => count(out, "MGM_CLEAN") >= 2);
      assert(!again.output.includes("[>1;2c") && !again.output.includes(">1;2c"), JSON.stringify(again.output.slice(-400)));
    } finally {
      session.close();
    }
  });

  add("Terminal", "Terminal tabs are numbered per shell and step with < >", async () => {
    resetTerminalTabs();
    setShells([{ id: "ps", label: "PowerShell" }, { id: "cmd", label: "Command Prompt" }], "ps");
    const one = openTerminal();
    const two = openTerminal("ps");
    const three = openTerminal("cmd");
    assert(one.id === "main", "the first tab keeps the id of the old single terminal");
    assert(tabTitle(one, "") === "PowerShell 1" && tabTitle(two, "") === "PowerShell 2" && tabTitle(three, "") === "Command Prompt 1",
      [one, two, three].map((tab) => tabTitle(tab, "")).join(", "));
    assert(terminalTabsState().activeId === three.id, "a new tab is selected");
    stepTerminal(-1);
    assert(terminalTabsState().activeId === two.id, "< selects the previous tab");
    stepTerminal(5);
    assert(terminalTabsState().activeId === three.id, "> stops at the last tab");
    closeTerminal(two.id, false);
    const reopened = openTerminal("ps");
    assert(tabTitle(reopened, "") === "PowerShell 2", "a freed number is reused");
    // The strip itself (a browser component, so read rather than rendered here).
    const strip = fs.readFileSync(path.join(ROOT, "src", "TerminalTabs.tsx"), "utf8");
    for (const key of ["terminalPrevious", "terminalNext", "terminalNew", "terminalNewShell", "terminalClose"]) assert(strip.includes(`t("${key}")`), key);
    assert(/disabled={!scrolls || index <= 0}/.test(strip) && /disabled={!scrolls || index >= tabs.length - 1}/.test(strip), "< > only when the tabs overflow");
    assert(strip.includes("event.button === 1"), "middle-click closes");
    const css = fs.readFileSync(path.join(ROOT, "src", "terminalTabs.css"), "utf8");
    assert(/\.terminal-tab-strip\s*\{[^}]*overflow-x:\s*auto[^}]*white-space:\s*nowrap/s.test(css), "tabs stay on one line and scroll");
    resetTerminalTabs();
  });

  add("Terminal", "Terminal tab strings exist in Korean and English", async () => {
    const keys = Object.keys(terminalStrings.ko);
    assert(keys.length === Object.keys(terminalStrings.en).length, "same keys");
    for (const key of keys) assert(terminalStrings.en[key] && translate("ko", key) !== key && translate("en", key) !== key, key);
  });
}
