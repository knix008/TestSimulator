/**
 * Terminal sessions for the bottom panel.
 *
 * One shell process per tab with piped stdio rather than a pseudo-terminal, so it
 * behaves like a line-oriented console: a command typed in the panel is written to the
 * shell's stdin, the output is buffered here and pulled by the UI (`term.read`, long
 * polled). The desktop build and the web build therefore get the same terminal, because
 * this runs behind the HTTP API like everything else.
 *
 * The shells are started so that they print neither a prompt nor an echo of the command
 * (cmd: `/D /Q` and a PROMPT made of a marker that is stripped, PowerShell: `-Command -`,
 * bash: `-s`): the panel draws the prompt itself, at the end of the output, and types the
 * command there.
 *
 * Every command is written to a small script file that the shell sources (`. file` /
 * `call file`), so the shell's stdin carries only that one short line — a program the
 * command starts which reads stdin (Read-Host, python, npm init) gets what the user
 * types next, not the following line. After the command a marker line
 * (`__MDM_CWD__:<dir>;<exit code>`) is printed, which tells the panel the shell's
 * current directory, the status of the command and that the shell is idle again; the
 * marker is stripped from the output. Sourcing keeps `cd`, variables and functions in
 * the shell, as if typed, and a syntax error is reported without killing the shell.
 *
 * Line endings: CRLF in the output is normalised to LF here; a lone CR (a progress bar
 * redrawing its line) is passed on as it is — the panel decides what to do with it.
 */
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import { ApiError } from "./errors.js";

type IconvEncoding = Parameters<typeof iconv.encode>[1];
const encodeWith = (text: string, encoding: string): Buffer => iconv.encode(text, encoding as IconvEncoding);

const MARK = "__MDM_CWD__:";
/** cmd's PROMPT: printed before every read, stripped here. */
const PROMPT_MARK = "__MDM_P__";
const MAX_CHUNKS = 4000;

export type ShellKind = "cmd" | "powershell" | "sh";

type ShellDef = {
  cmd: string;
  args?: string[];
  /** WSL needs the directory on the command line, so its arguments are built per launch. */
  makeArgs?: (cwd: string) => string[];
  ext: string;
  scriptEnc: string;
  /** PowerShell only reads a script file that starts with a BOM as UTF-8. */
  bom?: boolean;
  source: (file: string) => string;
  cwdLine: string;
  rcLine?: string;
  preLine?: string;
  /** cmd prints the marker from inside the script; the others append it to the stdin line. */
  markerInFile?: boolean;
  promptMark?: boolean;
  eol: string;
  encoding?: string;
  init?: string;
  kind: ShellKind;
  env?: Record<string, string>;
};

export type ShellSpec = ShellDef & { id: string; label: string };

export type GitStatus = {
  repo: boolean;
  root?: string;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  staged?: number;
  changed?: number;
  untracked?: number;
  conflicts?: number;
  stashes?: number;
  files?: { status: string; path: string }[];
  error?: string;
  cached?: boolean;
};

export type TerminalInfo = { id: number; shell: string; label: string; cwd: string };

export type TerminalRead = {
  id: number;
  chunks: { seq: number; text: string }[];
  seq: number;
  cwd: string;
  idle: boolean;
  exited: boolean;
  code: number | null;
  rc: number;
};

export type Completion = {
  start: number;
  quoted: boolean;
  word: string;
  lcp: string;
  items: { text: string; dir: boolean; cmd: boolean }[];
};

/**
 * Tab completion. The shells run without a terminal, so the panel completes by itself:
 * the first word of a command from these builtins plus the executables on PATH (scanned
 * once), every word from the files in the directory it names.
 */
const BUILTINS: Record<ShellKind, string[]> = {
  cmd: ["assoc", "call", "cd", "chdir", "cls", "color", "copy", "date", "del", "dir", "echo", "endlocal", "erase", "exit", "findstr", "for", "ftype", "goto", "if", "md", "mkdir", "mklink", "more", "move", "path", "pause", "popd", "prompt", "pushd", "rd", "rem", "ren", "rename", "rmdir", "robocopy", "set", "setlocal", "start", "time", "title", "tree", "type", "ver", "verify", "vol", "where", "xcopy"],
  powershell: ["Add-Content", "Clear-Host", "Compress-Archive", "ConvertFrom-Json", "ConvertTo-Json", "Copy-Item", "Expand-Archive", "ForEach-Object", "Get-Alias", "Get-ChildItem", "Get-Command", "Get-Content", "Get-Date", "Get-Help", "Get-Item", "Get-ItemProperty", "Get-Location", "Get-Member", "Get-Module", "Get-Process", "Get-Service", "Get-Variable", "Import-Module", "Invoke-Expression", "Invoke-RestMethod", "Invoke-WebRequest", "Join-Path", "Measure-Object", "Move-Item", "New-Item", "Out-File", "Out-String", "Pop-Location", "Push-Location", "Read-Host", "Remove-Item", "Rename-Item", "Resolve-Path", "Select-Object", "Select-String", "Set-Alias", "Set-Content", "Set-Location", "Set-Variable", "Sort-Object", "Split-Path", "Start-Process", "Stop-Process", "Test-Path", "Where-Object", "Write-Host", "Write-Output",
    "cat", "cd", "clear", "cls", "cp", "del", "dir", "echo", "exit", "foreach", "gc", "gci", "gcm", "gi", "gl", "gm", "iex", "irm", "iwr", "kill", "ls", "md", "measure", "mkdir", "mv", "ni", "ps", "pwd", "ri", "rm", "rmdir", "select", "sl", "sls", "sort", "type", "where"],
  sh: ["alias", "bg", "break", "builtin", "case", "cd", "command", "continue", "declare", "dirs", "do", "done", "echo", "elif", "else", "esac", "eval", "exec", "exit", "export", "fg", "fi", "for", "function", "getopts", "hash", "help", "history", "if", "jobs", "kill", "let", "local", "logout", "popd", "printf", "pushd", "pwd", "read", "readonly", "return", "set", "shift", "source", "test", "then", "time", "times", "trap", "type", "ulimit", "umask", "unalias", "unset", "until", "wait", "while"],
};

let pathCmds: string[] | null = null;
function pathCommands(): string[] {
  if (pathCmds) return pathCmds;
  const win = process.platform === "win32";
  const exts = win
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";").filter(Boolean)
    : null;
  const set = new Set<string>();
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (exts) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) set.add(entry.name.slice(0, -ext.length));
      } else {
        try {
          fs.accessSync(path.join(dir, entry.name), fs.constants.X_OK);
          set.add(entry.name);
        } catch {
          /* not executable */
        }
      }
    }
  }
  pathCmds = [...set];
  return pathCmds;
}

function isDir(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** The console's code page on Windows — what cmd and PowerShell write through a pipe. */
let codePage: string | null = null;
function consoleCodePage(): string {
  if (codePage) return codePage;
  codePage = "utf8";
  if (process.platform === "win32") {
    try {
      const out = execFileSync("cmd.exe", ["/c", "chcp"], { windowsHide: true, timeout: 3000 }).toString("latin1");
      const match = out.match(/(\d{3,5})/);
      const page = match ? Number(match[1]) : 0;
      if (page && page !== 65001 && iconv.encodingExists(`cp${page}`)) codePage = `cp${page}`;
    } catch {
      /* keep utf8 */
    }
  }
  return codePage;
}

/**
 * cmd and PowerShell write the console's code page (CP949 and friends), but programs
 * they run may write UTF-8 — node, python with PYTHONIOENCODING, the Cygwin / MSYS tools
 * on PATH. A chunk that is valid UTF-8 with multibyte characters is read as UTF-8,
 * anything else with the code page; a character split across chunks waits for its rest.
 * CP949 text is not valid UTF-8 in practice, so cmd's own output is safe.
 */
const utf8Strict = new TextDecoder("utf-8", { fatal: true });
function mixedDecoder(encoding: string): (buffer: Buffer) => string {
  const decoder = iconv.getDecoder(encoding as IconvEncoding);
  if (encoding === "utf8" || encoding === "utf-8") return (buffer) => decoder.write(buffer);
  let carry: Buffer | null = null;
  return (input) => {
    let buffer = input;
    if (carry) {
      buffer = Buffer.concat([carry, buffer]);
      carry = null;
    }
    let high = false;
    for (const byte of buffer) {
      if (byte >= 0x80) {
        high = true;
        break;
      }
    }
    if (!high) return decoder.write(buffer);
    // An unfinished UTF-8 sequence at the end: a lead byte within the last three bytes
    // with too few continuation bytes after it.
    let cut = 0;
    for (let i = 1; i <= Math.min(3, buffer.length); i++) {
      const byte = buffer[buffer.length - i];
      if ((byte & 0xc0) === 0x80) continue;
      const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
      if (need > i) cut = i;
      break;
    }
    const head = cut ? buffer.subarray(0, buffer.length - cut) : buffer;
    try {
      const text = utf8Strict.decode(head);
      if (cut) carry = Buffer.from(buffer.subarray(buffer.length - cut));
      return text;
    } catch {
      return decoder.write(buffer);
    }
  };
}

/*
 * The shells offered in the panel's shell menu.
 *
 * Programs see a pipe, not a terminal, so they print no colour on their own: the
 * environment asks the ones that have a switch for it, and a posix shell gets these
 * aliases (they expand inside the sourced script too). `dir` (ls -C -b) would print
 * non-ASCII names as octal escapes — it lists like ls instead.
 */
const POSIX_INIT = "shopt -s expand_aliases 2>/dev/null; if ls --color=always -d / >/dev/null 2>&1; then alias ls='ls --color=always'; alias dir='ls -C --color=always'; alias vdir='ls -l --color=always'; fi; alias grep='grep --color=always'; alias egrep='egrep --color=always'; alias fgrep='fgrep --color=always'; if diff --color=always /dev/null /dev/null >/dev/null 2>&1; then alias diff='diff --color=always'; fi; alias tree='tree -C'; alias ip='ip -c'";

/** Colour switches of common tools, for the ones that ignore FORCE_COLOR / CLICOLOR_FORCE. */
const COLOR_ENV: Record<string, string> = {
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  FORCE_COLOR: "1",
  CLICOLOR_FORCE: "1",
  CLICOLOR: "1",
  GIT_CONFIG_PARAMETERS: "'color.ui=always'",
  GIT_PAGER: "cat",
  PAGER: "cat",
  npm_config_color: "always",
  PY_COLORS: "1",
  CARGO_TERM_COLOR: "always",
  CMAKE_COLOR_DIAGNOSTICS: "ON",
  GCC_COLORS: "error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01",
  DOTNET_SYSTEM_CONSOLE_ALLOW_ANSI_COLOR_REDIRECTION: "1",
  GTEST_COLOR: "1",
  PYTEST_ADDOPTS: [process.env.PYTEST_ADDOPTS, "--color=yes"].filter(Boolean).join(" "),
};

/**
 * A UTF-8 locale for the posix shells: with LANG=ko_KR (no charset) Git Bash writes file
 * names in EUC-KR and the panel — reading UTF-8 — shows them broken; without any locale
 * `ls` prints them as "?" or octal escapes.
 */
const utf8Lang = (): string => {
  const lang = process.env.LANG;
  return lang && /utf-?8/i.test(lang) ? lang : "C.UTF-8";
};

/**
 * Windows: keep AutoRun (Clink) and Cygwin/MSYS ConPTY away from the piped shell.
 * Cygwin `ls` and friends otherwise allocate a pseudo-console, and cmd.exe exits when
 * that console is torn down — which looks to the user like the panel closing by itself.
 */
function withEnvFlags(current: string | undefined, ...flags: string[]): string {
  const parts = String(current || "").split(/\s+/).filter(Boolean);
  for (const flag of flags) if (!parts.includes(flag)) parts.push(flag);
  return parts.join(" ");
}

function shellEnv(def: ShellDef): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...COLOR_ENV,
    LANG: utf8Lang(),
    ...Object.fromEntries(
      (["LC_ALL", "LC_CTYPE"] as const)
        .filter((key) => process.env[key] && !/utf-?8/i.test(String(process.env[key])))
        .map((key) => [key, utf8Lang()]),
    ),
  };
  if (process.platform === "win32") {
    env.CLINK_NOAUTORUN = "1";
    env.CYGWIN = withEnvFlags(env.CYGWIN, "disable_pcon", "nodosfilewarning");
    env.MSYS = withEnvFlags(env.MSYS, "disable_pcon");
  }
  return { ...env, ...(def.env || {}) };
}

function resolveExe(target: string): string {
  if (!target) return "";
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() && !stat.isSymbolicLink()) return "";
    // WindowsApps execution aliases are empty stubs, not programs.
    if (stat.size === 0 && !stat.isSymbolicLink()) return "";
    try {
      const real = fs.realpathSync(target);
      const realStat = fs.statSync(real);
      if (!realStat.isFile() || realStat.size === 0) return "";
      return real;
    } catch {
      return stat.isFile() && stat.size > 0 ? target : "";
    }
  } catch {
    return "";
  }
}

function findOnPath(name: string): string {
  const win = process.platform === "win32";
  const exts = win ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  const names = win && !path.extname(name)
    ? exts.map((ext) => name + (ext.startsWith(".") ? ext : `.${ext}`))
    : [name];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const candidate of names) {
      const hit = resolveExe(path.join(dir, candidate));
      if (hit) return hit;
    }
  }
  return "";
}

function firstExisting(candidates: string[]): string {
  for (const candidate of candidates) {
    const hit = resolveExe(candidate);
    if (hit) return hit;
  }
  return "";
}

function firstDir(candidates: string[]): string {
  for (const candidate of candidates) if (candidate && isDir(candidate)) return candidate;
  return "";
}

/*
 * Cygwin / MSYS / Git-usr tools inherit cmd's stdin pipe and close that handle on exit,
 * so `cmd /K` sees EOF and dies with "process exited with code 0". Those commands get
 * NUL instead; builtins and interactive programs keep the pipe.
 */
const CMD_BUILTIN = new Set(BUILTINS.cmd);

export function isPosixWinTool(exe: string): boolean {
  if (!exe) return false;
  if (/[\\/](?:cygwin(?:64)?|msys(?:64|32)?|Git[\\/]usr)(?:[\\/]|$)/i.test(exe)) return true;
  const dir = path.dirname(exe);
  try {
    return fs.existsSync(path.join(dir, "cygwin1.dll")) || fs.existsSync(path.join(dir, "msys-2.0.dll"));
  } catch {
    return false;
  }
}

function firstToken(line: string): string {
  const text = String(line || "").trim();
  if (!text) return "";
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    return end > 0 ? text.slice(1, end) : text.slice(1);
  }
  const match = text.match(/^(\S+)/);
  return match ? match[1] : "";
}

function resolveCommand(token: string): string {
  if (!token) return "";
  if (/[\\/]/.test(token) || path.isAbsolute(token)) {
    return resolveExe(token) || resolveExe(/\.exe$/i.test(token) ? token : `${token}.exe`);
  }
  return findOnPath(token);
}

function injectNulRedirect(line: string): string {
  const text = String(line);
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = "";
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      i++;
      continue;
    }
    if (char === ">" && text[i + 1] === "&") {
      i += 2;
      continue;
    }
    if ((char === "&" && text[i + 1] === "&") || (char === "|" && text[i + 1] === "|") || char === "|" || char === "&") {
      return `${text.slice(0, i).trimEnd()} <nul ${text.slice(i)}`;
    }
    i++;
  }
  return `${text.trimEnd()} <nul`;
}

export function protectCmdLine(line: string): string {
  const text = String(line || "");
  if (!text.trim()) return text;
  if (/(?:^|[\s|&])(?:\d)?<\s*(?!&)/.test(text)) return text;
  const token = firstToken(text);
  if (!token || CMD_BUILTIN.has(token.toLowerCase())) return text;
  if (!isPosixWinTool(resolveCommand(token))) return text;
  return injectNulRedirect(text);
}

const posixSource = (file: string) => `. "${String(file).replace(/\\/g, "/")}";`;

const posixDef = (cmd: string, extra: Partial<ShellDef> = {}): ShellDef => ({
  cmd,
  args: extra.args || ["-s"],
  ext: ".sh",
  scriptEnc: "utf8",
  source: posixSource,
  cwdLine: `echo "${MARK}$PWD;$?"`,
  eol: "\n",
  init: POSIX_INIT,
  kind: "sh",
  ...extra,
});

const fishDef = (cmd: string, extra: Partial<ShellDef> = {}): ShellDef => ({
  cmd,
  args: extra.args || ["--no-config"],
  ext: ".fish",
  scriptEnc: "utf8",
  source: (file) => `source "${String(file).replace(/\\/g, "/")}"`,
  cwdLine: `echo "${MARK}$PWD;$status"`,
  eol: "\n",
  kind: "sh",
  ...extra,
});

function psDef(cmd: string, extra: Partial<ShellDef> = {}): ShellDef {
  return {
    cmd,
    args: ["-NoLogo", "-NoProfile", "-Command", "-"],
    ext: ".ps1",
    scriptEnc: "utf8",
    bom: true,
    kind: "powershell",
    source: (file) => `$__mdmrc = 1; $global:LASTEXITCODE = 0; . "${file}";`,
    rcLine: "$__mdmrc = if ($?) { 0 } else { 1 }; if ($__mdmrc -and $LASTEXITCODE) { $__mdmrc = $LASTEXITCODE }",
    cwdLine: `Write-Host "${MARK}$PWD;$__mdmrc"`,
    eol: "\r\n",
    encoding: extra.encoding || "utf8",
    ...extra,
  };
}

function cmdDef(cmd: string, extra: Partial<ShellDef> = {}): ShellDef {
  const page = extra.encoding || consoleCodePage();
  return {
    // /D skips the HKCU AutoRun (a Clink inject). A hooked Clink plus a Cygwin tool on
    // PATH can tear the piped cmd down, which looks like the panel closing.
    cmd,
    args: ["/D", "/Q", "/K", "rem"],
    env: { PROMPT: PROMPT_MARK },
    promptMark: true,
    ext: ".cmd",
    scriptEnc: page,
    markerInFile: true,
    preLine: "(call )",
    source: (file) => `call "${file}"`,
    // %CD% is quoted because cmd expands it before it parses the line: a directory with
    // `&` in its name (this project's own, as it happens) would otherwise cut the echo in
    // half and run the rest of the path as a command. The quotes are stripped again when
    // the marker is read. The posix and PowerShell shells quote their own already.
    cwdLine: `echo ${MARK}"%CD%";%ERRORLEVEL%`,
    eol: "\r\n",
    encoding: page,
    kind: "cmd",
    ...extra,
  };
}

function listWslDistros(wsl: string): string[] {
  try {
    const buffer = execFileSync(wsl, ["-l", "-q"], { windowsHide: true, timeout: 4000 });
    const text = (buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer.includes(0) && buffer[1] === 0)
      ? buffer.toString("utf16le")
      : buffer.toString("utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/\u0000/g, "").trim())
      .filter((line) => line && !/docker-desktop/i.test(line) && !/has no installed/i.test(line) && !/^wsl\.exe$/i.test(line));
  } catch {
    return [];
  }
}

export function parseEtcShells(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.startsWith("/"));
}

export function parseWtCommandLine(command: string): string {
  const text = String(command || "").trim();
  if (!text) return "";
  if (text.startsWith('"')) {
    const match = text.match(/^"([^"]+)"/);
    return match ? match[1] : "";
  }
  return text.split(/\s+/)[0] || "";
}

export function parseJsonc(text: string): unknown {
  const stripped = String(text || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  try {
    return JSON.parse(stripped);
  } catch {
    try {
      return JSON.parse(stripped.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

export function parseWtProfiles(source: string | unknown): { name: string; exe: string }[] {
  const data = typeof source === "string" ? parseJsonc(source) : source;
  const holder = (data ?? {}) as { profiles?: unknown };
  const list = Array.isArray(holder.profiles)
    ? holder.profiles
    : (holder.profiles && Array.isArray((holder.profiles as { list?: unknown[] }).list)
      ? (holder.profiles as { list: unknown[] }).list
      : []);
  return (list as Record<string, unknown>[])
    .filter((profile) => profile && !profile.hidden && profile.commandline
      && !/Windows\.Terminal\.(Azure|Wsl)/i.test(String(profile.source || "")))
    .map((profile) => ({
      name: String(profile.name || "").trim(),
      exe: parseWtCommandLine(String(profile.commandline)),
    }))
    .filter((profile) => profile.exe);
}

function regValue(key: string, name: string): string {
  if (process.platform !== "win32") return "";
  try {
    const out = execFileSync("reg.exe", ["query", key, "/v", name], {
      windowsHide: true,
      timeout: 3000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = String(out).match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`, "i"));
    return match ? match[1].trim().replace(/^"|"$/g, "") : "";
  } catch {
    return "";
  }
}

const dirJoin = (root: string, ...parts: string[]): string => (root ? path.join(root, ...parts) : "");

function pwshIn(dir: string): string[] {
  if (!dir || !isDir(dir)) return [];
  try {
    return fs.readdirSync(dir).sort().reverse().map((version) => path.join(dir, version, "pwsh.exe"));
  } catch {
    return [];
  }
}

function labelForExe(exe: string, fallback?: string): string {
  const name = path.basename(exe).replace(/\.exe$/i, "");
  if (/[\\/]Git[\\/]/i.test(exe) && /^bash$/i.test(name)) return "Git Bash";
  if (/msys64/i.test(exe) && /^bash$/i.test(name)) return "MSYS2";
  if (/cygwin/i.test(exe) && /^bash$/i.test(name)) return "Cygwin";
  if (/^powershell$/i.test(name)) return "Windows PowerShell";
  if (/^pwsh$/i.test(name)) return "PowerShell";
  if (/^cmd$/i.test(name)) return "Command Prompt";
  return fallback || name;
}

function specForExe(exe: string, options: { id?: string; label?: string; encoding?: string } = {}): ShellSpec {
  const base = path.basename(exe).replace(/\.exe$/i, "").toLowerCase();
  const nice = options.label || labelForExe(exe, base);
  if (base === "cmd") {
    return { id: options.id || "cmd", label: nice, ...cmdDef(exe, options.encoding ? { encoding: options.encoding } : {}) };
  }
  if (base === "powershell" || base === "pwsh") {
    const extra: Partial<ShellDef> = base === "pwsh"
      ? { encoding: options.encoding || "utf8" }
      : (options.encoding ? { encoding: options.encoding } : {});
    if (process.platform !== "win32") extra.eol = "\n";
    return { id: options.id || (base === "pwsh" ? "pwsh" : "powershell"), label: nice, ...psDef(exe, extra) };
  }
  if (base === "fish") return { id: options.id || "fish", label: nice, ...fishDef(exe) };
  return {
    id: options.id || base,
    label: nice,
    ...posixDef(exe, { args: base === "bash" ? ["--norc", "-s"] : ["-s"] }),
  };
}

let wslCache: { at: number; list: string[] | null; exe: string } = { at: 0, list: null, exe: "" };
function wslDistros(wsl: string, refresh: boolean): string[] {
  if (!refresh && wslCache.list && wslCache.exe === wsl && Date.now() - wslCache.at < 60000) return wslCache.list;
  const list = listWslDistros(wsl);
  wslCache = { at: Date.now(), list, exe: wsl };
  return list;
}

function wtProfileExes(): { exe: string; name: string }[] {
  const local = process.env.LOCALAPPDATA || "";
  if (!local) return [];
  const files = [path.join(local, "Microsoft", "Windows Terminal", "settings.json")];
  try {
    const packages = path.join(local, "Packages");
    for (const entry of fs.readdirSync(packages)) {
      if (/^Microsoft\.WindowsTerminal/i.test(entry)) {
        files.push(path.join(packages, entry, "LocalState", "settings.json"));
      }
    }
  } catch {
    /* no store packages */
  }
  const out: { exe: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const profile of parseWtProfiles(text)) {
      const exe = resolveExe(profile.exe) || findOnPath(profile.exe);
      if (!exe || seen.has(exe.toLowerCase())) continue;
      seen.add(exe.toLowerCase());
      out.push({ exe, name: profile.name });
    }
  }
  return out;
}

let shellsCache: { at: number; list: ShellSpec[] | null } = { at: 0, list: null };

/** Every shell installed on this computer, in the order the panel offers them. */
export function shells(refresh = false): ShellSpec[] {
  if (!refresh && shellsCache.list && Date.now() - shellsCache.at < 8000) return shellsCache.list;
  const list: ShellSpec[] = [];
  const seenId = new Set<string>();
  const seenCmd = new Set<string>();
  const add = (spec: ShellSpec) => {
    if (!spec || !spec.id || seenId.has(spec.id)) return;
    const exe = resolveExe(spec.cmd) || (path.isAbsolute(spec.cmd) ? "" : findOnPath(spec.cmd));
    if (!exe) return;
    const key = `${exe}|${JSON.stringify(spec.args || (spec.makeArgs && spec.id))}`.toLowerCase();
    if (seenCmd.has(key) && spec.id !== "default") return;
    seenId.add(spec.id);
    seenCmd.add(key);
    list.push({ ...spec, cmd: exe });
  };

  if (process.platform === "win32") {
    const page = consoleCodePage();
    const sys32 = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
    const programs = process.env.ProgramFiles || "C:\\Program Files";
    const programs86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    const home = os.homedir();
    const gitRoot = firstDir([
      regValue("HKLM\\SOFTWARE\\GitForWindows", "InstallPath"),
      regValue("HKCU\\SOFTWARE\\GitForWindows", "InstallPath"),
      path.join(programs, "Git"),
      path.join(programs86, "Git"),
      path.join(local, "Programs", "Git"),
      path.join(home, "scoop", "apps", "git", "current"),
      path.join(home, "AppData", "Local", "Programs", "Git"),
    ]);
    const cygwinRoot = firstDir([
      regValue("HKLM\\SOFTWARE\\Cygwin\\setup", "rootdir"),
      "C:\\cygwin64",
      "C:\\cygwin",
      path.join(programs, "cygwin64"),
    ]);
    add({ id: "cmd", label: "Command Prompt", ...cmdDef(process.env.ComSpec || path.join(sys32, "cmd.exe"), { encoding: page }) });
    add({ id: "powershell", label: "Windows PowerShell", ...psDef(path.join(sys32, "WindowsPowerShell", "v1.0", "powershell.exe"), { encoding: page }) });
    add({
      id: "pwsh",
      label: "PowerShell",
      ...psDef(firstExisting([
        ...pwshIn(path.join(programs, "PowerShell")),
        path.join(home, "scoop", "apps", "pwsh", "current", "pwsh.exe"),
        findOnPath("pwsh.exe"),
      ]), { encoding: "utf8" }),
    });
    add({
      id: "gitbash",
      label: "Git Bash",
      ...posixDef(firstExisting([
        dirJoin(gitRoot, "bin", "bash.exe"),
        dirJoin(gitRoot, "usr", "bin", "bash.exe"),
      ].filter(Boolean)), { args: ["--norc", "-s"] }),
    });
    add({
      id: "msys2",
      label: "MSYS2",
      ...posixDef(firstExisting([
        path.join("C:\\msys64", "usr", "bin", "bash.exe"),
        path.join(programs, "msys64", "usr", "bin", "bash.exe"),
        path.join(home, "msys64", "usr", "bin", "bash.exe"),
        path.join(local, "msys64", "usr", "bin", "bash.exe"),
        path.join(home, "scoop", "apps", "msys2", "current", "usr", "bin", "bash.exe"),
      ]), { args: ["--norc", "-s"] }),
    });
    add({
      id: "cygwin",
      label: "Cygwin",
      ...posixDef(firstExisting([dirJoin(cygwinRoot, "bin", "bash.exe")].filter(Boolean)), { args: ["--norc", "-s"] }),
    });
    const wsl = firstExisting([path.join(sys32, "wsl.exe"), findOnPath("wsl.exe")]);
    if (wsl) {
      for (const name of wslDistros(wsl, refresh)) {
        add({
          id: `wsl:${name}`,
          label: `WSL: ${name}`,
          ...posixDef(wsl, {
            args: ["-d", name, "--", "bash", "--norc", "-s"],
            makeArgs: (cwd) => ["-d", name, "--cd", cwd, "--", "bash", "--norc", "-s"],
          }),
        });
      }
    }
    const isWslLauncher = (exe: string) => /[\\/](?:system32|syswow64)[\\/](?:bash|wsl)\.exe$/i.test(exe);
    const bundledPosix = (exe: string) => /[\\/]Git[\\/]/i.test(exe) || /msys64/i.test(exe) || /cygwin/i.test(exe);
    for (const [id, names, kind] of [
      ["bash", ["bash.exe", "bash"], "posix"],
      ["zsh", ["zsh.exe", "zsh"], "posix"],
      ["dash", ["dash.exe", "dash"], "posix"],
      ["sh", ["sh.exe", "sh"], "posix"],
      ["ksh", ["ksh.exe", "ksh"], "posix"],
      ["fish", ["fish.exe", "fish"], "fish"],
    ] as [string, string[], string][]) {
      const exe = names.map(findOnPath).find(Boolean);
      if (!exe || isWslLauncher(exe) || bundledPosix(exe)) continue;
      if (kind === "fish") add({ id, label: id, ...fishDef(exe) });
      else add({ id, label: id, ...posixDef(exe, { args: id === "bash" ? ["--norc", "-s"] : ["-s"] }) });
    }
    let extra = 0;
    for (const profile of wtProfileExes()) {
      if (isWslLauncher(profile.exe) || bundledPosix(profile.exe)) continue;
      const base = path.basename(profile.exe).replace(/\.exe$/i, "").toLowerCase();
      if (seenId.has(base) || seenId.has(profile.name)) continue;
      extra += 1;
      add(specForExe(profile.exe, { id: `wt:${extra}`, label: profile.name || labelForExe(profile.exe) }));
    }
  } else {
    const shell = process.env.SHELL || "/bin/bash";
    add({
      id: "default",
      label: path.basename(shell),
      ...(/fish$/.test(shell) ? fishDef(shell) : posixDef(shell, /zsh$/.test(shell) ? { args: ["-s"] } : {})),
    });
    const extras: [string, ...string[]][] = [
      ["bash", "/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash"],
      ["sh", "/bin/sh", "/usr/bin/sh"],
      ["zsh", "/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"],
      ["dash", "/bin/dash", "/usr/bin/dash"],
      ["ksh", "/bin/ksh", "/usr/bin/ksh"],
      ["fish", "/usr/bin/fish", "/usr/local/bin/fish", "/opt/homebrew/bin/fish"],
      ["pwsh", "/usr/bin/pwsh", "/usr/local/bin/pwsh", "/opt/homebrew/bin/pwsh"],
    ];
    for (const [id, ...candidates] of extras) {
      const exe = firstExisting(candidates) || findOnPath(id);
      if (!exe) continue;
      if (id === "fish") add({ id, label: id, ...fishDef(exe) });
      else if (id === "pwsh") add({ id, label: "PowerShell", ...psDef(exe, { encoding: "utf8", eol: "\n" }) });
      else add({ id, label: id, ...posixDef(exe, id === "zsh" ? { args: ["-s"] } : {}) });
    }
    try {
      const listed = parseEtcShells(fs.readFileSync("/etc/shells", "utf8"));
      let n = 0;
      for (const entry of listed) {
        const exe = resolveExe(entry);
        if (!exe) continue;
        n += 1;
        add(specForExe(exe, { id: `etc:${n}`, label: path.basename(exe) }));
      }
    } catch {
      /* no /etc/shells */
    }
  }
  shellsCache = { at: Date.now(), list };
  return list;
}

/*
 * Found on disk is not the same as working.
 *
 * `shells()` above is a file-system scan: a registry key, a path that exists, a profile
 * in someone's Windows Terminal settings. Any of those can name a shell that was removed,
 * half-installed, or that refuses to start under a pipe — and offering it would mean a
 * terminal tab that opens onto nothing.
 *
 * So each candidate is started once, given the same line it would use to report its
 * directory, and kept only if it answers with the marker. The check runs when the
 * application starts (`warmShells`, called by the server) and its answer is what the
 * panel, the shell menu and the settings list are built from; `create` refuses a shell
 * that is not in it rather than quietly opening a different one.
 */
const PROBE_MS = 6000;

function probe(spec: ShellSpec): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      const args = typeof spec.makeArgs === "function" ? spec.makeArgs(os.homedir()) : (spec.args || []);
      proc = spawn(spec.cmd, args, {
        cwd: os.homedir(),
        stdio: "pipe",
        windowsHide: true,
        env: shellEnv(spec),
      });
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PROBE_MS);
    let seen = "";
    const read = (data: Buffer) => {
      seen += data.toString("latin1");
      if (seen.includes(MARK)) finish(true);
    };
    proc.stdout?.on("data", read);
    proc.stderr?.on("data", read);
    proc.on("error", () => finish(false));
    proc.on("exit", () => finish(seen.includes(MARK)));
    proc.stdin?.on("error", () => finish(false));
    try {
      proc.stdin?.write(encodeWith(`${spec.cwdLine}${spec.eol}`, spec.encoding || "utf8"));
    } catch {
      finish(false);
    }
  });
}

let verifying: Promise<ShellSpec[]> | null = null;

/**
 * The shells this computer really has, checked once and remembered. `refresh` is for the
 * shell menu and the settings list, where the user has just installed one and wants it.
 */
export function verifiedShells(refresh = false): Promise<ShellSpec[]> {
  if (refresh) verifying = null;
  if (!verifying) {
    verifying = Promise.all(shells(refresh).map(async (spec) => ((await probe(spec)) ? spec : null)))
      .then((list) => list.filter((spec): spec is ShellSpec => spec !== null));
  }
  return verifying;
}

/** Starts the check in the background, so the first terminal does not wait for it. */
export function warmShells(): void {
  verifiedShells().catch(() => {});
}

/*
 * Colours (SGR, "\x1b[…m") are kept for the panel to render; cursor movement, OSC titles
 * and the like are dropped. A lone CR stays — the panel decides what it means. A sequence
 * can arrive in two chunks, so the stream is cleaned after joining and an unfinished
 * sequence at the end (ESC_TAIL) waits for its rest.
 */
/* eslint-disable no-control-regex */
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-lnp-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#%][@-~]|\x1b[^[\]()#%]/g;
const ESC_TAIL = /\x1b(?:\[[0-9;?]*[ -/]*|\][^\x07\x1b]{0,256}\x1b?|[()#%])?$/;
/* eslint-enable no-control-regex */
const MARK_RE = new RegExp(`${MARK}([^\\n]*)\\n`, "g");
/*
 * cmd prints its prompt where a prompt goes: at the start of a line, or at the start of
 * what is left once a marker line has been taken out. Anchoring on that matters —
 * matching the mark anywhere would also take it out of `set PROMPT`, which would then
 * report the variable as empty and make the shell look like something other than cmd.
 */
const PROMPT_RE = new RegExp(`\\n${PROMPT_MARK}`, "g");
const PROMPT_HEAD_RE = new RegExp(`^${PROMPT_MARK}`);

/**
 * The repository a directory belongs to: the nearest ancestor holding `.git` (a
 * directory, or a file in a worktree / submodule); null outside a repository.
 */
export function repoRoot(dir: string): string | null {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const up = path.dirname(current);
    if (up === current) return null;
    current = up;
  }
}

/**
 * Commands that cannot change a repository's state (cd, listings, viewers, read-only
 * git). Every part of a compound line (&&, ||, ;, |) must be one; the prompt after such
 * a command reuses the last git status instead of running `git status` again.
 */
const READ_ONLY = /^\s*(?:cd|chdir|pushd|popd|ls|ll|dir|pwd|echo|cat|type|less|more|head|tail|wc|clear|cls|tree|which|where|whoami|date|time|hostname|uname|ver|find|grep|rg|findstr|env|set|printenv|history|man|help|get-childitem|gci|get-content|gc|get-location|gl|set-location|sl|write-host|write-output|get-date|get-item|gi|select-string|sls|node\s+-v|npm\s+-v|python\s+--version|git\s+(?:status|log|diff|show|blame|shortlog|rev-parse|ls-files|branch\s*$|remote\s*(?:-v)?\s*$|config\s+--get|describe|tag\s*$))(?:\s|$)/i;

export function isReadOnly(line: string): boolean {
  const parts = String(line || "").split(/&&|\|\||;|\|/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => READ_ONLY.test(part));
}

const gitCache = new Map<string, { at: number; status: GitStatus }>();
const CACHE_MS = 60 * 1000;

/*
 * The script file a session writes its commands to is named from this rather than from
 * the session's own id, which restarts at 1 for every engine: a dying shell cleans its
 * file up when its exit event arrives, which is long after the engine was shut down, and
 * two engines in one process would have had it delete the other's file.
 */
let scriptSeq = 0;

type Session = {
  id: number;
  shell: string;
  label: string;
  cwd: string;
  chunks: { seq: number; text: string }[];
  seq: number;
  pending: string;
  pendingCr: boolean;
  expectPrompt: boolean;
  idle: boolean;
  rc: number;
  waiters: (() => void)[];
  changed: boolean;
  exited: boolean;
  code: number | null;
  def: ShellDef;
  proc: ChildProcess | null;
  dead: boolean;
  scriptFile: string;
  enc: string;
  lastCmd?: string;
  restartAt?: number[];
};

export type Terminals = ReturnType<typeof createTerminals>;

export function createTerminals() {
  const sessions = new Map<number, Session>();
  /** A `git status` already running for the same directory and command. */
  const inflight = new Map<string, { at: number; promise: Promise<GitStatus> }>();

  const gitFor = (cwd: string, cmd?: string): Promise<GitStatus> => {
    const root = cwd ? repoRoot(cwd) : null;
    if (root && cmd !== undefined && isReadOnly(cmd)) {
      const cached = gitCache.get(root);
      if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve({ ...cached.status, cached: true });
    }
    const key = `${cwd}|${cmd === undefined ? "" : cmd}`;
    const running = inflight.get(key);
    if (running && Date.now() - running.at < 3000) return running.promise;
    const promise = gitStatus(cwd)
      .then((status) => {
        if (root && status && status.repo) gitCache.set(root, { at: Date.now(), status });
        else if (root) gitCache.delete(root);
        return status;
      })
      .finally(() => {
        const entry = inflight.get(key);
        if (entry && entry.promise === promise) inflight.delete(key);
      });
    inflight.set(key, { at: Date.now(), promise });
    return promise;
  };
  const prefetchGit = (cwd: string, cmd?: string) => {
    gitFor(cwd, cmd).catch(() => {});
  };

  let nextId = 1;

  /** Readers waiting in `read({ wait })` are woken on any change of the session. */
  function wake(session: Session): void {
    const waiters = session.waiters;
    session.waiters = [];
    for (const waiter of waiters) waiter();
  }

  function cleanup(session: Session): void {
    try {
      fs.unlinkSync(session.scriptFile);
    } catch {
      /* already gone */
    }
  }

  const MAX_RESTARTS = 3;

  function launch(session: Session): void {
    const dir = session.cwd && fs.existsSync(session.cwd) ? session.cwd : os.homedir();
    const args = typeof session.def.makeArgs === "function"
      ? session.def.makeArgs(dir)
      : (session.def.args || []);
    const proc = spawn(session.def.cmd, args, {
      cwd: dir,
      stdio: "pipe",
      windowsHide: true,
      env: shellEnv(session.def),
    });
    session.proc = proc;
    session.exited = false;
    const encoding = session.enc || session.def.encoding || "utf8";
    session.enc = encoding;
    const decodeOut = mixedDecoder(encoding);
    const decodeErr = mixedDecoder(encoding);
    proc.stdout?.on("data", (data: Buffer) => push(session, decodeOut(data)));
    proc.stderr?.on("data", (data: Buffer) => push(session, decodeErr(data)));
    proc.stdin?.on("error", () => {
      /* the exit handler reports it */
    });
    proc.on("error", (error) => {
      if (session.proc !== proc) return;
      if (session.dead) {
        push(session, `\n[${error.message}]\n`);
        session.exited = true;
        cleanup(session);
        wake(session);
      } else {
        onShellGone(session, null, error.message);
      }
    });
    proc.on("exit", (code) => {
      if (session.proc !== proc) return;
      if (session.dead) {
        session.exited = true;
        session.code = code;
        cleanup(session);
        wake(session);
      } else {
        onShellGone(session, code);
      }
    });
    if (session.def.init) proc.stdin?.write(encodeWith(`${session.def.init}${session.def.eol}`, encoding));
  }

  /**
   * An error or `exit` must not close the tab: the same session is relaunched so the
   * prompt stays. Only the user's close button sets `dead`.
   */
  function onShellGone(session: Session, code: number | null, error?: string): void {
    session.code = code;
    session.idle = true;
    session.pending = "";
    session.pendingCr = false;
    session.expectPrompt = Boolean(session.def.promptMark);
    const now = Date.now();
    session.restartAt = (session.restartAt || []).filter((at) => now - at < 4000);
    session.restartAt.push(now);
    // Cygwin `ls` and a plain `exit` must not look like the tab died: relaunch quietly.
    if (session.restartAt.length <= MAX_RESTARTS) {
      session.exited = false;
      launch(session);
      wake(session);
      return;
    }
    session.exited = true;
    push(session, error ? `\n[${error}]\n` : `\n[process exited with code ${code}]\n`);
    wake(session);
  }

  function ensureProc(session: Session): boolean {
    if (session.dead) return false;
    if (session.proc && session.proc.exitCode == null) return true;
    session.exited = false;
    launch(session);
    return Boolean(session.proc);
  }

  function push(session: Session, incoming: string): void {
    // Pull the cwd markers (and cmd's prompt marks) out of the stream; everything else
    // is output. A marker — and, for cmd, the blank line before its prompt — may be
    // split across chunks, so the tail that could still become one is held back. A CR
    // at the very end of a chunk is held too: its LF may come with the next chunk.
    let text = incoming;
    if (session.pendingCr) {
      text = `\r${text}`;
      session.pendingCr = false;
    }
    if (text.endsWith("\r")) {
      text = text.slice(0, -1);
      session.pendingCr = true;
    }
    session.pending = (session.pending + text.replace(/\r\n/g, "\n")).replace(ANSI, "");
    const dropMark = () => {
      session.expectPrompt = false;
      return "";
    };
    const stripPrompts = (value: string) => (session.def.promptMark
      ? value.replace(PROMPT_HEAD_RE, dropMark).replace(PROMPT_RE, dropMark)
      : value);
    let out = "";
    // A marker line ends the command: everything before it is complete output, what
    // follows is cmd's next prompt mark (held back until it is whole).
    let match: RegExpExecArray | null;
    MARK_RE.lastIndex = 0;
    while ((match = MARK_RE.exec(session.pending))) {
      let data = match[1].trim();
      // "<dir>;<exit code>" — the status of the command, for the prompt's status segment.
      const semi = data.lastIndexOf(";");
      if (semi >= 0 && /^-?\d+$/.test(data.slice(semi + 1))) {
        session.rc = Number(data.slice(semi + 1));
        data = data.slice(0, semi);
      }
      if (data.length > 1 && data.startsWith('"') && data.endsWith('"')) data = data.slice(1, -1);
      // Git Bash prints /c/… for C:/….
      if (process.platform === "win32") {
        data = data.replace(/^\/([a-zA-Z])(\/|$)/, (_all, letter: string) => `${letter.toUpperCase()}:/`);
      }
      session.cwd = data || session.cwd;
      session.idle = true;
      session.changed = true;
      // The prompt's git status starts now, not when the panel asks for it.
      prefetchGit(session.cwd, session.lastCmd);
      out += stripPrompts(session.pending.slice(0, match.index));
      session.pending = session.pending.slice(match.index + match[0].length);
      // cmd prints "\n__MDM_P__" before reading the next line.
      session.expectPrompt = Boolean(session.def.promptMark);
      MARK_RE.lastIndex = 0;
    }
    session.pending = stripPrompts(session.pending);
    const newline = session.pending.lastIndexOf("\n");
    const tail = session.pending.slice(newline + 1);
    let cut = session.pending.length;
    const couldBe = (mark: string) => tail.startsWith(mark) || mark.startsWith(tail);
    if (tail && (couldBe(MARK) || (session.def.promptMark && couldBe(PROMPT_MARK)))) cut = newline + 1;
    // The blank line cmd emits before a prompt mark, when the mark itself is still to come.
    if (session.def.promptMark && (!session.idle || session.expectPrompt) && cut > 0 && session.pending[cut - 1] === "\n") {
      cut--;
    }
    const escape = ESC_TAIL.exec(session.pending.slice(0, cut));
    // An escape sequence still coming; a long unterminated one is shown as it is.
    if (escape && escape[0].length < 300) cut = escape.index;
    const chunk = out + session.pending.slice(0, cut);
    session.pending = session.pending.slice(cut);
    if (!chunk) {
      if (session.changed) {
        session.changed = false;
        wake(session);
      }
      return;
    }
    session.seq++;
    session.chunks.push({ seq: session.seq, text: chunk });
    if (session.chunks.length > MAX_CHUNKS) session.chunks.splice(0, session.chunks.length - MAX_CHUNKS);
    session.changed = false;
    wake(session);
  }

  function gitStatus(cwd: string): Promise<GitStatus> {
    return new Promise((resolve) => {
      if (!cwd || !fs.existsSync(cwd)) {
        resolve({ repo: false });
        return;
      }
      // One git process: status itself says when this is not a repository.
      execFile(
        "git",
        ["-C", cwd, "--no-optional-locks", "status", "--porcelain=v2", "--branch", "--ignore-submodules=dirty"],
        { windowsHide: true, maxBuffer: 8 << 20 },
        (error, out) => {
          if (error) {
            resolve(/not a git repository/i.test(String(error.message))
              ? { repo: false }
              : { repo: true, error: error.message });
            return;
          }
          const status: GitStatus = {
            repo: true,
            root: repoRoot(cwd) ?? undefined,
            branch: "",
            upstream: "",
            ahead: 0,
            behind: 0,
            staged: 0,
            changed: 0,
            untracked: 0,
            conflicts: 0,
            files: [],
          };
          const files = status.files as { status: string; path: string }[];
          for (const line of String(out).split("\n")) {
            if (!line) continue;
            if (line.startsWith("# branch.head ")) status.branch = line.slice(14).trim();
            else if (line.startsWith("# branch.upstream ")) status.upstream = line.slice(18).trim();
            else if (line.startsWith("# branch.ab ")) {
              const ab = line.match(/\+(\d+) -(\d+)/);
              if (ab) {
                status.ahead = Number(ab[1]);
                status.behind = Number(ab[2]);
              }
            } else if (line[0] === "1" || line[0] === "2") {
              const xy = line.slice(2, 4);
              if (xy[0] !== ".") status.staged = (status.staged ?? 0) + 1;
              if (xy[1] !== ".") status.changed = (status.changed ?? 0) + 1;
              const target = line[0] === "1"
                ? line.split(" ").slice(8).join(" ")
                : line.split("\t")[0].split(" ").slice(9).join(" ");
              files.push({ status: xy, path: target });
            } else if (line[0] === "u") {
              status.conflicts = (status.conflicts ?? 0) + 1;
              files.push({ status: "UU", path: line.split(" ").slice(10).join(" ") });
            } else if (line[0] === "?") {
              status.untracked = (status.untracked ?? 0) + 1;
              files.push({ status: "??", path: line.slice(2) });
            }
          }
          status.files = files.slice(0, 200);
          resolve(status);
        },
      );
    });
  }

  return {
    shells: (options: { refresh?: boolean } = {}) =>
      verifiedShells(Boolean(options.refresh)).then((list) => list.map(({ id, label }) => ({ id, label }))),

    async create({ cwd, shell }: { cwd?: string; shell?: string } = {}): Promise<TerminalInfo> {
      const all = await verifiedShells();
      if (all.length === 0) {
        throw new ApiError("No working shell was found on this computer.", "NO_SHELL", 400);
      }
      // A shell that is not in the verified list is refused rather than swapped for
      // another one: opening "Git Bash" and getting cmd is worse than being told.
      const def = shell ? all.find((item) => item.id === shell) : all[0];
      if (!def) {
        throw new ApiError(
          `That shell is not installed on this computer: ${shell}`,
          "NO_SHELL",
          400,
          `Available: ${all.map((item) => item.id).join(", ")}`,
        );
      }
      let dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
      try {
        if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
      } catch {
        dir = os.homedir();
      }
      const id = nextId++;
      const session: Session = {
        id,
        shell: def.id,
        label: def.label,
        cwd: dir,
        chunks: [],
        seq: 0,
        pending: "",
        pendingCr: false,
        expectPrompt: Boolean(def.promptMark),
        idle: true,
        rc: 0,
        waiters: [],
        changed: false,
        exited: false,
        code: null,
        def,
        proc: null,
        dead: false,
        scriptFile: path.join(os.tmpdir(), `mdm-term-${process.pid}-${(scriptSeq += 1)}${def.ext}`),
        enc: def.encoding || "utf8",
      };
      launch(session);
      sessions.set(id, session);
      return { id, shell: session.shell, label: session.label, cwd: session.cwd };
    },

    write({ id, data }: { id: number; data: string }): boolean {
      const session = sessions.get(id);
      if (!session || session.dead || !ensureProc(session)) return false;
      session.proc?.stdin?.write(encodeWith(data, session.enc || "utf8"));
      return true;
    },

    /**
     * Runs one command line and asks for the cwd (and the exit status) afterwards. While
     * a command is still running — no marker yet — the line is input for that command and
     * goes to stdin as it is, ended with `eol` or, by default, the shell's own.
     */
    run({ id, line, eol }: { id: number; line: string; eol?: string }): boolean {
      const session = sessions.get(id);
      if (!session || session.dead || !ensureProc(session)) return false;
      const { eol: shellEol, cwdLine, bom, markerInFile, source, rcLine, preLine, scriptEnc } = session.def;
      const send = (text: string) => session.proc?.stdin?.write(encodeWith(text, session.enc || "utf8"));
      if (!session.idle) {
        send(`${line}${eol === "lf" ? "\n" : eol === "crlf" ? "\r\n" : shellEol}`);
        return true;
      }
      session.idle = false;
      session.lastCmd = line;
      // Readers see the busy phase, so the return to idle is never missed.
      wake(session);
      const runLine = session.def.kind === "cmd" ? protectCmdLine(line) : line;
      // The command goes into the script file, with the exit-status and marker lines that
      // belong there; stdin gets the one line that runs it.
      const body = `${preLine ? `${preLine}${shellEol}` : ""}${runLine}${shellEol}`
        + `${rcLine ? `${rcLine}${shellEol}` : ""}${markerInFile ? `${cwdLine}${shellEol}` : ""}`;
      const bytes = encodeWith(body, scriptEnc || "utf8");
      fs.writeFileSync(
        session.scriptFile,
        bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]) : bytes,
      );
      send(`${source(session.scriptFile)}${markerInFile ? "" : ` ${cwdLine}`}${shellEol}`);
      return true;
    },

    /**
     * Long poll: with `wait` (ms) and nothing new since `since` / the given idle state,
     * the answer is held back until something changes, so the panel shows output and the
     * prompt the moment they happen.
     */
    async read({ id, since = 0, idle, wait = 0 }: {
      id: number;
      since?: number;
      idle?: boolean;
      wait?: number;
    }): Promise<TerminalRead | null> {
      const session = sessions.get(id);
      if (!session) return null;
      const snapshot = (): TerminalRead => ({
        id,
        chunks: since ? session.chunks.filter((chunk) => chunk.seq > since) : session.chunks,
        seq: session.seq,
        cwd: session.cwd,
        idle: session.idle,
        exited: session.exited,
        code: session.code,
        rc: session.rc,
      });
      const fresh = () => session.seq > since || (idle !== undefined && session.idle !== idle) || session.exited;
      if (!wait || fresh()) return snapshot();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(wait, 5000));
        session.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      return snapshot();
    },

    kill({ id }: { id: number }): boolean {
      const session = sessions.get(id);
      if (!session) return false;
      session.dead = true;
      try {
        session.proc?.kill();
      } catch {
        /* already gone */
      }
      cleanup(session);
      wake(session);
      sessions.delete(id);
      return true;
    },

    list: (): (TerminalInfo & { idle: boolean; exited: boolean })[] =>
      [...sessions.values()].map((session) => ({
        id: session.id,
        shell: session.shell,
        label: session.label,
        cwd: session.cwd,
        idle: session.idle,
        exited: session.exited,
      })),

    /**
     * Git status of a directory, for the prompt. `cmd` is the command that just ran:
     * `git status` scans the whole working tree, so it is not run again when the command
     * could not have changed the repository and a status of the same repository is at
     * hand — the prompt then comes up at once.
     */
    git({ cwd, cmd }: { cwd: string; cmd?: string }): Promise<GitStatus> {
      return gitFor(cwd, cmd);
    },

    gitFresh({ cwd }: { cwd: string }): Promise<GitStatus> {
      return gitStatus(cwd);
    },

    /**
     * Completions for the word at `cursor` in `line`. `start` is where the word begins,
     * `lcp` the longest common prefix of the candidates — what a Tab can safely insert.
     */
    complete({ id, line, cursor }: { id: number; line: string; cursor?: number }): Completion {
      const session = sessions.get(id);
      if (!session) return { start: 0, quoted: false, word: "", lcp: "", items: [] };
      const head = line.slice(0, cursor == null ? line.length : cursor);
      let start = 0;
      let quote = false;
      for (let i = 0; i < head.length; i++) {
        const char = head[i];
        if (char === '"') quote = !quote;
        else if (!quote && (char === " " || char === "\t")) start = i + 1;
      }
      let word = head.slice(start);
      const quoted = word.startsWith('"');
      if (quoted) word = word.slice(1);
      const before = head.slice(0, start).trim();
      const firstWord = !before || /[|&;(]$/.test(before);
      const win = process.platform === "win32";
      const fold = (value: string) => (win ? value.toLowerCase() : value);
      const sepIdx = Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\"));
      const dirPart = sepIdx >= 0 ? word.slice(0, sepIdx + 1) : "";
      const prefix = word.slice(sepIdx + 1);
      const sep = sepIdx >= 0
        ? word[sepIdx]
        : ((session.def.kind === "cmd" || session.def.kind === "powershell") && win ? "\\" : "/");
      const matches = (name: string) => fold(name).startsWith(fold(prefix));
      const items: { text: string; dir: boolean; cmd: boolean }[] = [];
      if (firstWord && sepIdx < 0) {
        for (const candidate of [...BUILTINS[session.def.kind], ...pathCommands()]) {
          if (matches(candidate)) items.push({ text: candidate, dir: false, cmd: true });
        }
      }
      let base = dirPart;
      if (base.startsWith("~")) base = os.homedir() + base.slice(1);
      // Git Bash style /c/….
      if (win && /^\/[a-zA-Z](\/|$)/.test(base)) base = `${base[1]}:${base.slice(2) || "/"}`;
      base = dirPart ? path.resolve(session.cwd, base) : session.cwd;
      try {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (!matches(entry.name) || (entry.name.startsWith(".") && !prefix.startsWith("."))) continue;
          const dir = entry.isDirectory() || (entry.isSymbolicLink() && isDir(path.join(base, entry.name)));
          items.push({ text: dirPart + entry.name + (dir ? sep : ""), dir, cmd: false });
        }
      } catch {
        /* not a directory */
      }
      const seen = new Set<string>();
      const out = items
        .filter((item) => !seen.has(fold(item.text)) && seen.add(fold(item.text)))
        .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: "base" }))
        .slice(0, 500);
      let lcp = out.length ? out[0].text : "";
      for (const item of out) {
        let n = 0;
        while (n < lcp.length && n < item.text.length && fold(lcp[n]) === fold(item.text[n])) n++;
        lcp = lcp.slice(0, n);
      }
      return { start, quoted, word, lcp, items: out };
    },

    shutdown(): void {
      for (const session of sessions.values()) {
        session.dead = true;
        try {
          session.proc?.kill();
        } catch {
          /* already gone */
        }
        cleanup(session);
        wake(session);
      }
      sessions.clear();
    },
  };
}
