/**
 * The terminal's prompt, drawn by the prompt engine (core/promptCore.js) inside a real
 * shell running under node-pty.
 *
 * Each hooked shell asks the core for its prompt before every command line: its prompt
 * function sends one small HTTP request to a loopback server the terminal session owns
 * (`GET /prompt/<token>`, with the folder, exit code and duration in headers) and prints
 * the answer itself. The shell — and under Windows ConPTY's screen buffer — therefore
 * knows the prompt's real width, so line editing, history recall and redraws stay
 * aligned. (A marker the core replaced in the output stream would look the same at first,
 * but ConPTY would think the cursor sat at column 0 and repaint over the prompt.)
 *
 *   PowerShell / pwsh   `function global:prompt`, passed in MGM_PROMPT_HOOK and run with
 *                       Invoke-Expression; System.Net.WebClient. Not -EncodedCommand:
 *                       security software blocks an encoded PowerShell started by an
 *                       unknown program ("Cannot create process, error code: 5"), and not
 *                       a .ps1 file, which the execution policy may refuse.
 *   bash / Git Bash     a generated --rcfile: the user's own startup files, then
 *                       PROMPT_COMMAND fetches PS1 over bash's /dev/tcp (no curl needed)
 *   zsh                 a generated ZDOTDIR/.zshrc: the user's .zshrc, then precmd via ztcp
 *   cmd                 PROMPT cannot run code, so it gets the prompt rendered once at
 *                       start with $P for the folder (no git status, no exit code)
 *   WSL, anything else  its own prompt (WSL's loopback is not this machine's)
 *
 * If the core cannot be reached the hooks fall back to a plain prompt, never an error.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { renderPromptAnsi } from "./promptCore.js";
import { promptFromSettings, promptThemeOf } from "./promptSettings.js";
import { gitStatus, promptState, refreshGitStatus } from "./promptState.js";
import type { InstalledShell } from "./shells.js";

export type ShellKind = "powershell" | "cmd" | "bash" | "zsh" | "wsl" | "other";

export function shellKind(command: string): ShellKind {
  const base = path.basename(command).toLowerCase().replace(/\.exe$/, "");
  if (base === "pwsh" || base === "powershell") return "powershell";
  if (base === "cmd") return "cmd";
  if (base === "bash" || base === "sh" && process.platform === "win32") return "bash";
  if (base === "zsh") return "zsh";
  if (base === "wsl") return "wsl";
  return "other";
}

/** The name the prompt's "shell" segment shows. */
export function shellName(command: string): string {
  const base = path.basename(command).replace(/\.exe$/i, "");
  return base.toLowerCase();
}

/* ------------------------------------------------------------ escaping */

const SGR = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** bash PS1: non-printing runs in \001…\002, backslashes doubled (promptvars is off). */
export function escapeForBash(ansi: string): string {
  return ansi.replace(/\\/g, "\\\\").replace(SGR, (sequence) => `\x01${sequence}\x02`);
}

/** zsh PROMPT: non-printing runs in %{…%}, percent signs doubled. */
export function escapeForZsh(ansi: string): string {
  return ansi.replace(/%/g, "%%").replace(SGR, (sequence) => `%{${sequence}%}`);
}

/** cmd PROMPT: every character cmd treats specially becomes its $-code. */
export function escapeForCmd(ansi: string): string {
  const codes: Record<string, string> = {
    "$": "$$", "\x1b": "$E", "\n": "$_", "|": "$B", "<": "$L", ">": "$G", "&": "$A", "(": "$C", ")": "$F", "=": "$Q",
  };
  return [...ansi].map((char) => codes[char] ?? char).join("");
}

/** Git Bash reports /c/Users/…, Cygwin /cygdrive/c/Users/…; git and the path segment want C:\Users\…. */
export function nativePath(cwd: string): string {
  if (process.platform !== "win32") return cwd;
  const msys = /^(?:\/cygdrive)?\/([a-zA-Z])(?:\/(.*))?$/.exec(cwd);
  if (msys) return `${msys[1].toUpperCase()}:\\${(msys[2] ?? "").replace(/\//g, "\\")}`;
  if (/^[a-zA-Z]:\//.test(cwd)) return cwd.replace(/\//g, "\\");
  return cwd;
}

/* ------------------------------------------------------- the prompt server */

export type PromptRequest = { cwd: string; rc: number; ms: number; shell: string; kind: ShellKind };

/** Renders one prompt for a shell from the current settings (waits briefly for git). */
export async function renderShellPrompt(settings: Record<string, unknown>, request: PromptRequest): Promise<string> {
  const { config, gitMode } = promptFromSettings(settings);
  const cwd = nativePath(request.cwd) || os.homedir();
  if (gitMode !== "off") {
    const known = gitStatus(cwd) as { pending?: boolean };
    // A folder seen for the first time: wait a moment for git rather than draw without it.
    if (known.pending) await Promise.race([refreshGitStatus(path.resolve(cwd)), new Promise((resolve) => setTimeout(resolve, 700))]);
  }
  const state = promptState({ cwd, rc: request.rc, ms: request.ms, shell: request.shell, gitMode });
  const ansi = renderPromptAnsi(config, state, promptThemeOf(settings.theme)) as string;
  if (request.kind === "bash") return escapeForBash(ansi);
  if (request.kind === "zsh") return escapeForZsh(ansi);
  return ansi;
}

/** The cmd PROMPT string: the prompt rendered once, the folder left to cmd ($P). */
export function cmdPromptString(settings: Record<string, unknown>): string {
  const { config } = promptFromSettings(settings);
  const marker = "\uE0FF";
  const state = promptState({ cwd: marker, shell: "cmd", gitMode: "off" });
  const ansi = renderPromptAnsi(config, { ...state, home: "\uE0FE", git: { repo: false } }, promptThemeOf(settings.theme)) as string;
  if (!ansi.includes(marker)) return escapeForCmd(ansi);
  return escapeForCmd(ansi).split(marker).join("$P");
}

export class PromptServer {
  private server: http.Server | null = null;
  private starting: Promise<number> | null = null;
  private port = 0;
  readonly token = crypto.randomBytes(12).toString("hex");
  private folder = "";

  constructor(private readonly settings: () => Record<string, unknown>) {}

  /** Listens on a free loopback port (once) and answers with the port. */
  start(): Promise<number> {
    if (this.starting) return this.starting;
    this.starting = new Promise<number>((resolve, reject) => {
      const server = http.createServer((req, res) => void this.answer(req, res));
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        this.port = typeof address === "object" && address ? address.port : 0;
        this.server = server;
        server.unref();
        resolve(this.port);
      });
    });
    return this.starting;
  }

  close(): void {
    this.server?.close();
    this.server = null;
    this.starting = null;
    if (this.folder) fs.rmSync(this.folder, { recursive: true, force: true });
    this.folder = "";
  }

  private async answer(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const header = (name: string) => {
      const value = req.headers[name];
      const text = Array.isArray(value) ? value[0] : value ?? "";
      // Header bytes arrive as latin1; folders are UTF-8.
      return Buffer.from(text, "latin1").toString("utf8");
    };
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== `/prompt/${this.token}`) {
      res.writeHead(404).end();
      return;
    }
    const kind = (url.searchParams.get("kind") || header("x-kind") || "powershell") as ShellKind;
    try {
      const text = await renderShellPrompt(this.settings(), {
        cwd: url.searchParams.get("cwd") ?? header("x-cwd"),
        rc: Number(url.searchParams.get("rc") ?? header("x-rc")) || 0,
        ms: Number(url.searchParams.get("ms") ?? header("x-ms")) || 0,
        shell: url.searchParams.get("shell") ?? (header("x-shell") || "shell"),
        kind,
      });
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" }).end(text);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" }).end(String(error));
    }
  }

  /** Scratch folder for generated startup files (removed by close()). */
  private scratch(): string {
    if (!this.folder) {
      this.folder = fs.mkdtempSync(path.join(os.tmpdir(), "mygitmaster-prompt-"));
    }
    return this.folder;
  }

  /**
   * How to start `shell` so that it asks for its prompt: the arguments and extra
   * environment. Shells that cannot be hooked come back unchanged.
   */
  async hook(shell: InstalledShell): Promise<{ args: string[]; env: Record<string, string> }> {
    const kind = shellKind(shell.command);
    const name = shellName(shell.command);
    if (kind === "cmd") return { args: shell.args, env: { PROMPT: cmdPromptString(this.settings()) } };
    if (kind !== "powershell" && kind !== "bash" && kind !== "zsh") return { args: shell.args, env: {} };
    const port = await this.start();
    const env = { MGM_PROMPT_PORT: String(port), MGM_PROMPT_TOKEN: this.token, MGM_PROMPT_SHELL: name };
    if (kind === "powershell") {
      const script = powershellHook(`http://127.0.0.1:${port}/prompt/${this.token}`, name);
      return { args: ["-NoLogo", "-NoExit", "-Command", "Invoke-Expression $env:MGM_PROMPT_HOOK"], env: { ...env, MGM_PROMPT_HOOK: script } };
    }
    if (kind === "bash") {
      const rcfile = path.join(this.scratch(), "bashrc");
      fs.writeFileSync(rcfile, bashHook());
      const login = shell.args.includes("--login") || shell.args.includes("-l");
      return { args: ["--rcfile", toShellPath(rcfile), "-i"], env: { ...env, MGM_PROMPT_LOGIN: login ? "1" : "" } };
    }
    const zdotdir = path.join(this.scratch(), "zsh");
    fs.mkdirSync(zdotdir, { recursive: true });
    fs.writeFileSync(path.join(zdotdir, ".zshrc"), zshHook());
    return { args: shell.args, env: { ...env, ZDOTDIR: zdotdir, MGM_PROMPT_ZDOTDIR: process.env.ZDOTDIR || os.homedir() } };
  }
}

/** Git Bash reads its --rcfile through MSYS, which takes C:/… but not C:\…. */
function toShellPath(file: string): string {
  return process.platform === "win32" ? file.replace(/\\/g, "/") : file;
}

/* ------------------------------------------------------------- hook scripts */

export function powershellHook(url: string, shell: string): string {
  return [
    `$global:__mgmPromptUrl = '${url.replace(/'/g, "''")}'`,
    "function global:prompt {",
    "  $ok = $?",
    "  $code = $global:LASTEXITCODE",
    "  $rc = if ($ok) { 0 } elseif ($code) { $code } else { 1 }",
    "  $ms = 0",
    "  $last = Get-History -Count 1",
    "  if ($last) { $ms = [int]($last.EndExecutionTime - $last.StartExecutionTime).TotalMilliseconds }",
    "  $cwd = $executionContext.SessionState.Path.CurrentLocation.ProviderPath",
    "  try {",
    "    $client = New-Object System.Net.WebClient",
    "    $client.Encoding = [System.Text.Encoding]::UTF8",
    `    $text = $client.DownloadString($global:__mgmPromptUrl + '?kind=powershell&shell=${shell}&rc=' + $rc + '&ms=' + $ms + '&cwd=' + [uri]::EscapeDataString($cwd))`,
    "    $global:LASTEXITCODE = $code",
    "    if ($text) { return $text }",
    "  } catch { }",
    "  $global:LASTEXITCODE = $code",
    "  \"PS $cwd> \"",
    "}",
  ].join("\n");
}

export function bashHook(): string {
  return [
    "# My Git Master: the user's own startup files, then the prompt from the app.",
    "if [ -n \"$MGM_PROMPT_LOGIN\" ]; then",
    "  [ -f /etc/profile ] && . /etc/profile",
    "  if [ -f ~/.bash_profile ]; then . ~/.bash_profile",
    "  elif [ -f ~/.bash_login ]; then . ~/.bash_login",
    "  elif [ -f ~/.profile ]; then . ~/.profile; fi",
    "else",
    "  [ -f /etc/bash.bashrc ] && . /etc/bash.bashrc",
    "  [ -f ~/.bashrc ] && . ~/.bashrc",
    "fi",
    "__mgm_prompt() {",
    "  local rc=${__mgm_rc:-0} reply",
    // In a group: `exec … 2>/dev/null` alone would silence the shell's stderr for good,
    // and bash draws its prompt and echo there.
    "  { exec 9<>\"/dev/tcp/127.0.0.1/$MGM_PROMPT_PORT\"; } 2>/dev/null || return 0",
    "  printf 'GET /prompt/%s?kind=bash HTTP/1.0\\r\\nX-Cwd: %s\\r\\nX-Rc: %s\\r\\nX-Shell: %s\\r\\n\\r\\n' \"$MGM_PROMPT_TOKEN\" \"$PWD\" \"$rc\" \"$MGM_PROMPT_SHELL\" >&9",
    "  IFS= read -r -d '' reply <&9",
    "  exec 9<&-",
    "  case \"$reply\" in",
    "    'HTTP/1.1 200'*|'HTTP/1.0 200'*) PS1=\"${reply#*$'\\r\\n\\r\\n'}\"; shopt -u promptvars 2>/dev/null ;;",
    "  esac",
    "}",
    "PROMPT_COMMAND=\"__mgm_rc=\\$?;${PROMPT_COMMAND:+$PROMPT_COMMAND;}__mgm_prompt\"",
    "",
  ].join("\n");
}

export function zshHook(): string {
  return [
    "# My Git Master: the user's own .zshrc, then the prompt from the app.",
    "ZDOTDIR=\"$MGM_PROMPT_ZDOTDIR\"",
    "[ -f \"$ZDOTDIR/.zshrc\" ] && . \"$ZDOTDIR/.zshrc\"",
    "zmodload zsh/net/tcp 2>/dev/null",
    "__mgm_prompt() {",
    "  local rc=$? reply fd",
    "  ztcp 127.0.0.1 $MGM_PROMPT_PORT 2>/dev/null || return 0",
    "  fd=$REPLY",
    "  print -rn -- \"GET /prompt/$MGM_PROMPT_TOKEN?kind=zsh HTTP/1.0\"$'\\r\\n'\"X-Cwd: $PWD\"$'\\r\\n'\"X-Rc: $rc\"$'\\r\\n'\"X-Shell: zsh\"$'\\r\\n\\r\\n' >&$fd",
    "  IFS= read -r -d '' -u $fd reply",
    "  ztcp -c $fd",
    "  [[ $reply == HTTP/1.?' 200'* ]] && PROMPT=\"${reply#*$'\\r\\n\\r\\n'}\"",
    "}",
    "autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __mgm_prompt",
    "",
  ].join("\n");
}
