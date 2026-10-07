/**
 * The terminal, the second tab of the bottom panel.
 *
 * Several shell sessions as tabs, each a line-oriented console: the shell's output
 * (`core/terminal.ts`, pulled through a long poll) ending with a prompt the panel draws
 * itself, where the command is typed — history with up and down, Tab completion, Ctrl+C
 * to interrupt, Ctrl+L to clear. A line that was typed stays in the transcript with the
 * prompt it was typed at, so scrolling back shows what the directory and the repository
 * looked like at the time. While a command runs there is no prompt, and what is typed
 * goes to that command's standard input.
 *
 * The prompt comes from the theme in the settings (Settings › Prompt — `core/prompt.ts`,
 * drawn by `Prompt.tsx`): by default a coloured segment for the directory and, inside a
 * repository, the branch coloured by the state of the working tree.
 *
 * The open tabs live in a module-level store rather than in this component, because the
 * panel is unmounted whenever the user closes it and the shells go on running: reopening
 * the panel has to find the same sessions, with their transcripts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { normalizePrompt, type GitSummary, type PromptConfig, type PromptState } from "../core/prompt.js";
import type { AppSettings, TerminalCr, TerminalEol } from "../core/settings.js";
import { api, type GitStatus, type TerminalInfo } from "./api.js";
import { AnsiText } from "./ansi.js";
import * as host from "./host.js";
import { Icon } from "./icons.js";
import { Prompt } from "./Prompt.js";
import { columns, mergeOutput } from "./termtext.js";
import { useApp } from "./state.js";

/** The long poll: the server answers as soon as something happens, or after this. */
const WAIT_MS = 1500;
/** How long the prompt waits for a fresh git status before showing the last known one. */
const STATUS_WAIT_MS = 700;
const MAX_LINES = 3000;

/**
 * The transcript is a list of entries: a run of shell output, or a line that was typed at
 * a prompt — kept with the prompt of that moment so it is redrawn exactly as it was.
 */
type Entry =
  | { kind: "out"; text: string }
  | { kind: "cmd"; line: string; cwd: string; git: GitSummary | null; rc: number; ms: number; at: number };

type Tab = TerminalInfo & { title: string; buffer: Entry[]; seq: number };

/* ------------------------------------------------------------------ *
 * The open terminals, kept outside React
 * ------------------------------------------------------------------ */

type StoreState = { tabs: Tab[]; activeId: number | null };

const listeners = new Set<() => void>();
let state: StoreState = { tabs: [], activeId: null };

const publish = (next: StoreState) => {
  state = next;
  for (const listener of listeners) listener();
};

export const terminals = {
  get: (): StoreState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  add(info: TerminalInfo): void {
    const tab: Tab = { ...info, title: info.label, buffer: [], seq: 0 };
    publish({ tabs: [...state.tabs, tab], activeId: info.id });
  },
  activate(id: number): void {
    publish({ ...state, activeId: id });
  },
  remove(id: number): void {
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const activeId = state.activeId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeId;
    publish({ tabs, activeId });
  },
};

function useTerminals(): StoreState {
  const [snapshot, setSnapshot] = useState(terminals.get);
  useEffect(() => terminals.subscribe(() => setSnapshot(terminals.get())), []);
  return snapshot;
}

/* ------------------------------------------------------------------ *
 * The transcript
 * ------------------------------------------------------------------ */

function lineCount(entries: Entry[]): number {
  let count = 0;
  for (const entry of entries) count += entry.kind === "cmd" ? 1 : (entry.text.match(/\n/g) || []).length;
  return count;
}

/** Keeps the transcript to MAX_LINES, dropping whole lines from the front. */
function trimEntries(entries: Entry[]): Entry[] {
  let count = lineCount(entries);
  let list = entries;
  while (count > MAX_LINES && list.length) {
    const first = list[0];
    if (first.kind === "cmd") {
      list = list.slice(1);
      count--;
      continue;
    }
    const drop = Math.min(count - MAX_LINES, (first.text.match(/\n/g) || []).length);
    if (drop === 0) {
      list = list.slice(1);
      continue;
    }
    let seen = 0;
    let at = -1;
    while (seen < drop) {
      at = first.text.indexOf("\n", at + 1);
      seen++;
    }
    const rest = first.text.slice(at + 1);
    list = rest ? [{ kind: "out", text: rest }, ...list.slice(1)] : list.slice(1);
    count -= drop;
  }
  return list;
}

function appendText(entries: Entry[], text: string, mode: TerminalCr): Entry[] {
  if (!text) return entries;
  const last = entries[entries.length - 1];
  const next: Entry[] = last && last.kind === "out"
    ? [...entries.slice(0, -1), { kind: "out", text: mergeOutput(last.text, text, mode) }]
    : [...entries, { kind: "out", text: mergeOutput("", text, mode) }];
  return trimEntries(next);
}

/** A CR left pending when a prompt follows: nothing comes after it, so it is dropped. */
function settle(entries: Entry[]): Entry[] {
  const last = entries[entries.length - 1];
  return last && last.kind === "out" && last.text.endsWith("\r")
    ? [...entries.slice(0, -1), { kind: "out", text: last.text.slice(0, -1) }]
    : entries;
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

export type TerminalEnv = { home: string; user: string; host: string; platform: string };

const asSummary = (git: GitStatus | null): GitSummary | null => (git ? (git as GitSummary) : null);

function gitStateName(git: GitSummary | null): string {
  if (!git || !git.repo) return "none";
  if (git.conflicts) return "conflict";
  if (git.staged) return "staged";
  if (git.changed) return "modified";
  if (git.ahead) return "ahead";
  if (git.behind) return "behind";
  return "uptodate";
}

function TermPrompt({ config, env, shell, cwd, git, rc, ms, at, stale = false }: {
  config: PromptConfig;
  env: TerminalEnv;
  shell: string;
  cwd: string;
  git: GitSummary | null;
  rc: number;
  ms: number;
  at?: number;
  stale?: boolean;
}) {
  const { t } = useApp();
  const name = gitStateName(git);
  const tip = git && git.repo
    ? `${git.branch || "(detached)"}${git.upstream ? ` → ${git.upstream}` : ""}`
      + ` — ${t(`terminal.gs.${name}` as "terminal.gs.none")}\n`
      + `${git.ahead ?? 0} ${t("terminal.gitAhead")} · ${git.behind ?? 0} ${t("terminal.gitBehind")}`
      + `${git.conflicts ? ` · ${t("terminal.gitConflicts", git.conflicts)}` : ""}`
      + ` · ${t("terminal.gitChanges", git.staged ?? 0, git.changed ?? 0, git.untracked ?? 0)}`
    : `${cwd}\n${t("terminal.noGit")}`;
  const promptState = useMemo<PromptState>(() => ({
    cwd,
    git,
    rc: rc || 0,
    ms: ms || 0,
    now: at ? new Date(at) : new Date(),
    home: env.home,
    user: env.user,
    host: env.host,
    platform: env.platform,
    shell,
    root: false,
  }), [cwd, git, rc, ms, at, env, shell]);
  return <Prompt config={config} state={promptState} stale={stale} title={tip} />;
}

/* ------------------------------------------------------------------ *
 * One session
 * ------------------------------------------------------------------ */

function TerminalView({ tab, active, onExit, prompt, env, termEol, termCr, termColor }: {
  tab: Tab;
  active: boolean;
  onExit: (id: number) => void;
  prompt: PromptConfig;
  env: TerminalEnv;
  termEol: TerminalEol;
  termCr: TerminalCr;
  termColor: boolean;
}) {
  const { t } = useApp();
  const [entries, setEntries] = useState<Entry[]>(() => tab.buffer);
  const [git, setGit] = useState<GitSummary | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ list: string[]; index: number; draft: string }>({ list: [], index: -1, draft: "" });
  const outRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(tab.seq);
  const cwdRef = useRef(tab.cwd);
  const gitRef = useRef<GitSummary | null>(null);
  const [cwd, setCwd] = useState(tab.cwd);
  const [idle, setIdle] = useState(true);
  const idleRef = useRef(true);
  /** A command went to the shell since the last status; set even when it printed nothing. */
  const commandSent = useRef(false);
  /** That command — `undefined` means "none", so a fresh status is read. */
  const lastCommand = useRef<string | undefined>(undefined);
  const crRef = useRef(termCr);
  crRef.current = termCr;
  const eolRef = useRef(termEol);
  eolRef.current = termEol;
  // The status of the last command and how long it ran: the prompt's own segments.
  const [rc, setRc] = useState(0);
  const [ms, setMs] = useState(0);
  const rcRef = useRef(0);
  const msRef = useRef(0);
  const startedRef = useRef(0);

  /*
   * The git status of the current directory. The prompt is drawn once, with the fresh
   * state: while the status is being read — after every command, and on a directory
   * change — the prompt line stays invisible, so it never appears in one colour and then
   * jumps to another. A big repository can take a while, so after STATUS_WAIT_MS the
   * prompt is shown with the last known state and recoloured when the answer arrives. An
   * answer to an older request is ignored.
   */
  const [gitReady, setGitReady] = useState(false);
  const [gitStale, setGitStale] = useState(false);
  const gitSeq = useRef(0);
  const gitCwd = useRef<string | null>(null);
  const gitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshGit = useCallback(() => {
    const mine = ++gitSeq.current;
    const dir = cwdRef.current;
    setGitReady(false);
    setGitStale(false);
    clearTimeout(gitTimer.current);
    if (gitCwd.current === dir) {
      gitTimer.current = setTimeout(() => {
        if (mine !== gitSeq.current) return;
        setGitStale(true);
        setGitReady(true);
      }, STATUS_WAIT_MS);
    }
    const done = (status: GitSummary | null) => {
      if (mine !== gitSeq.current) return;
      clearTimeout(gitTimer.current);
      gitRef.current = status;
      gitCwd.current = dir;
      setGit(status);
      setGitReady(true);
      setGitStale(false);
    };
    // The command that just ran goes along: after a read-only one the answer is cached.
    api.termGit(dir, lastCommand.current).then((status) => done(asSummary(status))).catch(() => done(null));
    lastCommand.current = undefined;
  }, []);

  const append = useCallback((text: string) => {
    setEntries((previous) => appendText(previous, text, crRef.current));
  }, []);

  /** A line typed at the prompt, or fed to the command that is running. */
  const echo = useCallback((line: string) => {
    if (idleRef.current) {
      setEntries((previous) => trimEntries([...settle(previous), {
        kind: "cmd",
        line,
        cwd: cwdRef.current,
        git: gitRef.current,
        rc: rcRef.current,
        ms: msRef.current,
        at: Date.now(),
      }]));
    } else {
      append(`${line}\n`);
    }
  }, [append]);

  // Read the output while the tab is visible: a long poll, answered the moment there is
  // output, the prompt comes back or the shell exits.
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    let lastIdle = idleRef.current;
    const idleChanged = (next: boolean) => {
      const changed = next !== lastIdle;
      lastIdle = next;
      return changed;
    };
    const loop = async () => {
      while (!stop) {
        try {
          const answer = await api.termRead(tab.id, {
            since: seqRef.current,
            idle: idleRef.current,
            wait: WAIT_MS,
          });
          if (stop) return;
          if (!answer) {
            onExit(tab.id);
            return;
          }
          if (answer.chunks.length) {
            seqRef.current = answer.seq;
            append(answer.chunks.map((chunk) => chunk.text).join(""));
          }
          const idleNow = answer.idle !== false;
          const cwdChanged = answer.cwd !== cwdRef.current;
          if (cwdChanged) {
            cwdRef.current = answer.cwd;
            setCwd(answer.cwd);
          }
          if (idleNow !== idleRef.current) {
            idleRef.current = idleNow;
            setIdle(idleNow);
            if (idleNow && startedRef.current) {
              const took = Date.now() - startedRef.current;
              startedRef.current = 0;
              msRef.current = took;
              setMs(took);
            }
          }
          if (typeof answer.rc === "number" && answer.rc !== rcRef.current) {
            rcRef.current = answer.rc;
            setRc(answer.rc);
          }
          // The status is re-read when a command has finished — the shell is idle again
          // after one was sent, and a fast command without output never shows as busy, so
          // the sent flag is what counts — or when the directory changed.
          const changed = idleChanged(idleNow);
          if (cwdChanged || (idleNow && (changed || commandSent.current))) {
            commandSent.current = false;
            refreshGit();
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    };
    void loop();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab.id]);

  useEffect(() => refreshGit(), [refreshGit]);
  useEffect(() => {
    tab.buffer = entries;
    tab.seq = seqRef.current;
  }, [entries, tab]);
  useEffect(() => {
    const element = outRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, input, idle, gitReady]);
  useEffect(() => {
    if (active && inputRef.current) inputRef.current.focus();
  }, [active]);
  useEffect(() => () => clearTimeout(gitTimer.current), []);

  const run = async (line: string) => {
    const wasIdle = idleRef.current;
    const command = wasIdle ? line.trim() : line;
    echo(line);
    if (wasIdle) {
      startedRef.current = Date.now();
      if (!command) {
        await api.termRun(tab.id, "").catch(() => {});
        return;
      }
      setHistory((current) => ({
        list: [...current.list.filter((item) => item !== command), command].slice(-200),
        index: -1,
        draft: "",
      }));
      // `clear` is the panel's own: there is no screen for the shell to clear.
      if (command === "clear" || command === "cls") {
        setEntries([]);
        await api.termRun(tab.id, "").catch(() => {});
        return;
      }
      commandSent.current = true;
      lastCommand.current = command;
    }
    try {
      await api.termRun(tab.id, command, eolRef.current);
    } catch (error) {
      append(`\n[${error instanceof Error ? error.message : String(error)}]\n`);
    }
  };

  /*
   * Tab: complete the word at the cursor. A single candidate is inserted — with a space
   * after a file or a command, nothing after a directory so the next Tab goes on inside
   * it — several share their common prefix, and when that adds nothing the candidates are
   * listed under the prompt, the way a shell lists them.
   */
  const complete = async () => {
    const element = inputRef.current;
    const line = input;
    const cursor = element ? element.selectionStart ?? line.length : line.length;
    let answer;
    try {
      answer = await api.termComplete(tab.id, line, cursor);
    } catch {
      return;
    }
    if (!answer || answer.items.length === 0) return;
    const tail = line.slice(cursor);
    const put = (text: string, done: boolean) => {
      const quote = answer.quoted || /\s/.test(text);
      const replacement = (quote ? '"' : "") + text + (done && quote ? '"' : "") + (done ? " " : "");
      const next = line.slice(0, answer.start) + replacement + tail;
      setInput(next);
      const at = next.length - tail.length;
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(at, at));
    };
    if (answer.items.length === 1) {
      put(answer.items[0].text, !answer.items[0].dir);
      return;
    }
    if (answer.lcp.length > answer.word.length) {
      put(answer.lcp, false);
      return;
    }
    const out = outRef.current;
    let width = 80;
    if (out) {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        context.font = getComputedStyle(out).font;
        const cell = context.measureText("MMMMMMMMMM").width / 10 || 8;
        width = Math.max(20, Math.floor((out.clientWidth - 24) / cell));
      }
    }
    echo(line);
    append(`${columns(answer.items.map((item) => item.text), width)}\n`);
  };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const value = input;
      setInput("");
      void run(value);
    } else if (event.key === "Tab") {
      event.preventDefault();
      void complete();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistory((current) => {
        if (!current.list.length) return current;
        const index = current.index < 0 ? current.list.length - 1 : Math.max(0, current.index - 1);
        setInput(current.list[index]);
        return { ...current, index, draft: current.index < 0 ? input : current.draft };
      });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHistory((current) => {
        if (current.index < 0) return current;
        const index = current.index + 1;
        if (index >= current.list.length) {
          setInput(current.draft);
          return { ...current, index: -1, draft: "" };
        }
        setInput(current.list[index]);
        return { ...current, index };
      });
    } else if (event.key === "c" && event.ctrlKey && !input) {
      event.preventDefault();
      api.termWrite(tab.id, "\x03").catch(() => {});
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setEntries([]);
    } else if (event.key === "Escape") {
      setInput("");
    }
  };

  /** A pasted block runs every complete line; the rest stays typed. */
  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.includes("\n")) return;
    event.preventDefault();
    const element = inputRef.current;
    const before = input.slice(0, element ? element.selectionStart ?? input.length : input.length);
    const after = input.slice(element ? element.selectionEnd ?? input.length : input.length);
    const parts = (before + text.replace(/\r/g, "") + after).split("\n");
    const rest = parts.pop() ?? "";
    void (async () => {
      for (const part of parts) await run(part);
      setInput(rest);
    })();
  };

  // The transcript only re-renders when it changes, not on every keystroke.
  const transcript = useMemo(() => entries.map((entry, index) => (entry.kind === "cmd"
    ? (
      <React.Fragment key={index}>
        <TermPrompt
          config={prompt}
          env={env}
          shell={tab.shell}
          cwd={entry.cwd}
          git={entry.git}
          rc={entry.rc}
          ms={entry.ms}
          at={entry.at}
        />
        {entry.line}
        {"\n"}
      </React.Fragment>
    )
    // A CR still pending is not drawn: the next chunk decides what it means.
    : <React.Fragment key={index}><AnsiText text={entry.text.replace(/\r$/, "")} color={termColor} /></React.Fragment>
  )), [entries, prompt, env, tab.shell, termColor]);

  return (
    <div className={`term-view${active ? "" : " hidden"}`} data-terminal={tab.id}>
      <pre
        className="term-out"
        ref={outRef}
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
      >
        {transcript}
        <span className={`term-live${idle && !gitReady ? " pending" : ""}`}>
          {idle && gitReady ? (
            <TermPrompt
              config={prompt}
              env={env}
              shell={tab.shell}
              cwd={cwd}
              git={git}
              rc={rc}
              ms={ms}
              stale={gitStale}
            />
          ) : null}
          <span className="term-inline" data-value={input}>
            <input
              ref={inputRef}
              value={input}
              title={t("terminal.placeholder")}
              aria-label={t("terminal.placeholder")}
              data-field="terminalInput"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
            />
          </span>
        </span>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The panel's terminal tab
 * ------------------------------------------------------------------ */

/**
 * Where a new terminal starts: the directory in the settings if one is set, otherwise the
 * folder of whatever is open. An empty answer leaves the choice to the server, which uses
 * the home directory — as it also does for a path that is no longer there.
 */
function startDirectory(app: ReturnType<typeof useApp>): string {
  if (app.settings.termCwd) return app.settings.termCwd;
  const tab = app.active;
  if (!tab) return "";
  const parent = (target: string | null | undefined) =>
    (target ? target.replace(/[\\/][^\\/]*$/, "") || target : "");
  if (tab.kind === "directory") return tab.result.left;
  if (tab.kind === "compare") return parent(tab.summary.left.path ?? tab.summary.right.path);
  if (tab.kind === "merge") return parent(tab.info.mergedPath);
  return tab.repository.path;
}

/**
 * The open terminals, as tabs in the bottom panel's own strip.
 *
 * There is no tab called "terminal" in front of them: turning the terminal on opens one
 * and its shell's name is the tab, so clicking a name both brings the terminal forward
 * and selects that session. Closing the last one turns the terminal off, because a
 * terminal with no name would have no tab to come back to.
 */
export function TerminalTabs({ inFront }: { inFront: boolean }) {
  const app = useApp();
  const { t, settings } = app;
  const { tabs, activeId } = useTerminals();

  const select = (id: number) => {
    terminals.activate(id);
    if (!inFront) void app.updateSettings({ bottomPanel: "terminal" });
  };

  const close = (id: number) => {
    closeTerminal(id);
    // The tab was the terminal; with none left there is nothing for the panel to show.
    if (terminals.get().tabs.length === 0) void app.updateSettings({ showTerminalPanel: false });
  };

  return (
    <>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={inFront && tab.id === activeId}
          className={`panel-tab term-tab${inFront && tab.id === activeId ? " active" : ""}`}
          title={tab.cwd}
          data-panel-tab={`terminal:${tab.id}`}
          data-terminal-tab={tab.id}
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              close(tab.id);
            } else {
              select(tab.id);
            }
          }}
        >
          <Icon name="terminal" size={14} />
          <span className="ellipsis">{tab.title}</span>
          <button
            type="button"
            className="tab-close"
            title={t("dlg.close")}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              close(tab.id);
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <TerminalOpener />
    </>
  );
}

/** The "+" and the shell menu beside the terminal tabs, and the first terminal of all. */
function TerminalOpener() {
  const app = useApp();
  const { t, settings } = app;
  /** Only the shells the server could actually start; see `core/terminal.ts`. */
  const [listed, setListed] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    api.termShells().then(setListed).catch(() => setListed([]));
  }, []);

  const open = useCallback(async (shell?: string) => {
    // A shell picked from the menu is asked for by name and the server refuses it if it
    // is not installed. The *setting* is different: it may name a shell that was removed
    // since it was chosen, and that must not leave the panel unable to open anything, so
    // it is only used while it is still on the verified list.
    const preferred = settings.termShell && listed.some((item) => item.id === settings.termShell)
      ? settings.termShell
      : undefined;
    try {
      const info = await api.termCreate(startDirectory(app), shell || preferred);
      terminals.add(info);
      void app.updateSettings({ bottomPanel: "terminal" });
    } catch (error) {
      app.report(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, listed, settings.termShell, settings.termCwd]);

  // Turning the terminal on opens one, so the panel is never an empty box the user has to
  // click a second time. The guard is a ref rather than the dependency list because
  // StrictMode runs a mount effect twice, and twice here would be two shells; the store is
  // read live, so a session opened earlier counts.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current) return;
    autoOpened.current = true;
    if (terminals.get().tabs.length === 0) void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickShell = async (element: HTMLElement) => {
    const fresh = await api.termShells(true).catch(() => listed);
    setListed(fresh);
    const chosen = await host.openMenu(
      {
        menu: "terminal.shells",
        items: fresh.map((shell) => ({ id: `shell:${shell.id}`, label: shell.label, icon: "terminal" })),
        theme: settings.theme,
        customTheme: settings.customTheme,
        language: settings.language,
        fontFamily: settings.font.family,
        fontSize: 13,
      },
      host.anchorFor(element),
    );
    if (chosen?.startsWith("shell:")) void open(chosen.slice(6));
  };

  return (
    <>
      <button type="button" className="icon-button" data-command="terminal.new" title={t("terminal.new")}
        onClick={() => void open()}>
        <Icon name="plus" size={15} />
      </button>
      {listed.length > 0 ? (
        <button
          type="button"
          className="icon-button"
          data-command="terminal.newShell"
          title={t("terminal.newShell")}
          onClick={(event) => void pickShell(event.currentTarget)}
        >
          <Icon name="down" size={14} />
        </button>
      ) : null}
    </>
  );
}

/** What the panel's right-hand end shows while the terminal is the pane in front. */
export function TerminalTools() {
  const { t } = useApp();
  return (
    <>
      <span className="panel-spacer" />
      <button
        type="button"
        className="icon-button"
        data-command="terminal.settings"
        title={t("terminal.settings")}
        onClick={() => void host.openDialog("settings", { tab: "terminal" })}
      >
        <Icon name="settings" size={14} />
      </button>
    </>
  );
}

function closeTerminal(id: number): void {
  terminals.remove(id);
  api.termKill(id).catch(() => {});
}

export function TerminalBody({ settings, env }: {
  settings: AppSettings;
  env: TerminalEnv;
}) {
  const { t } = useApp();
  const { tabs, activeId } = useTerminals();
  const prompt = useMemo(() => normalizePrompt(settings.prompt), [settings.prompt]);

  if (tabs.length === 0) {
    return (
      <p className="panel-empty">
        <Icon name="terminal" size={22} />
        {t("terminal.empty")}
      </p>
    );
  }
  return (
    <>
      {tabs.map((tab) => (
        <TerminalView
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          onExit={(id) => terminals.remove(id)}
          prompt={prompt}
          env={env}
          termEol={settings.termEol}
          termCr={settings.termCr}
          termColor={settings.termColor}
        />
      ))}
    </>
  );
}
