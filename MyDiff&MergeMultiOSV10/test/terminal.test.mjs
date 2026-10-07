/**
 * The terminal and its prompt.
 *
 * Everything here is the part that has no shell and no browser in it: the prompt theme
 * model and its template engine, the path styles, the carriage-return rule the panel
 * applies to output, and the handful of pure helpers in the terminal engine (which shells
 * are offered, which commands cannot change a repository, which cmd lines need a NUL on
 * their input). Driving a real shell is the GUI test's job.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import {
  clonePrompt,
  defaultTemplate,
  formatMs,
  formatPath,
  gitState,
  goDate,
  normalizePrompt,
  PRESETS,
  PROMPT_DEFAULT,
  renderPrompt,
  renderTemplate,
  resolveColor,
  SAMPLE_STATES,
  sanitizeCustomPrompts,
  SEGMENT_TYPES,
} from "../core/prompt.ts";
import {
  createTerminals,
  isReadOnly,
  verifiedShells,
  parseEtcShells,
  parseJsonc,
  parseWtCommandLine,
  parseWtProfiles,
  shells,
} from "../core/terminal.ts";
import { columns, mergeOutput } from "../src/termtext.ts";
import { defaultSettings, sanitize } from "../core/settings.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mdm-term-"));
// A shell that was started here holds the directory as its own until Windows notices it
// has died, so the cleanup waits it out and gives up quietly rather than failing the run.
after(() => {
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch {
    /* a shell still has it open */
  }
});

const THEME = { accent: "#4cc9f0", fg: "#e6edf3", bg: "#12161c" };

/** Runs one command in a session and waits for the shell to be idle again. */
async function runAndSettle(terminals, id, line, timeout = 20000) {
  terminals.run({ id, line });
  const deadline = Date.now() + timeout;
  let since = 0;
  let out = "";
  for (;;) {
    const answer = await terminals.read({ id, since, idle: false, wait: 500 });
    since = answer.seq;
    out += answer.chunks.map((chunk) => chunk.text).join("");
    if (answer.idle) return { out, cwd: answer.cwd, rc: answer.rc };
    if (Date.now() > deadline) throw new Error(`the shell never came back: ${JSON.stringify(out)}`);
  }
}

const text = (prompt) => prompt.blocks.flatMap((block) => block.segments).map((segment) => segment.text).join("");

/* ------------------------------------------------------------ the themes */

test("every preset normalises to a whole config", () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    const config = normalizePrompt(preset.config);
    assert.equal(config.preset, id, `${id} forgot its own id`);
    assert.ok(config.blocks.length > 0, `${id} has no blocks`);
    for (const block of config.blocks) {
      for (const segment of block.segments) {
        assert.ok(SEGMENT_TYPES.includes(segment.type), `${id} has a ${segment.type} segment`);
        assert.equal(typeof segment.template, "string");
        assert.equal(typeof segment.properties, "object");
      }
    }
  }
});

test("a prompt from nowhere falls back to the default blocks", () => {
  const config = normalizePrompt(undefined);
  assert.deepEqual(config.blocks, PROMPT_DEFAULT.blocks);
  assert.equal(config.final_space, true);
  assert.equal(config.git_state_colors, true);
});

test("normalising keeps a segment that was switched off, rather than dropping it", () => {
  const config = normalizePrompt({
    blocks: [{ segments: [{ type: "path", enabled: false }, { type: "git" }] }],
  });
  assert.equal(config.blocks[0].segments.length, 2);
  assert.equal(config.blocks[0].segments[0].enabled, false);
  assert.equal(config.blocks[0].segments[0].template, defaultTemplate("path"));
});

test("an unknown segment type becomes text instead of breaking the prompt", () => {
  const config = normalizePrompt({ blocks: [{ segments: [{ type: "nonsense" }] }] });
  assert.equal(config.blocks[0].segments[0].type, "text");
});

test("cloning a prompt copies it rather than sharing it", () => {
  const copy = clonePrompt(PRESETS.default.config);
  copy.blocks[0].segments[0].template = "changed";
  assert.notEqual(PRESETS.default.config.blocks[0].segments[0].template, "changed");
});

/* --------------------------------------------------- the template engine */

test("the template engine reads fields, conditions and pipes", () => {
  const context = { Branch: "main", Ahead: 2, Behind: 0, Working: { Changed: true, String: "~3" } };
  assert.equal(renderTemplate("{{ .Branch }}", context), "main");
  assert.equal(renderTemplate("{{ if gt .Ahead 0 }}up{{ else }}level{{ end }}", context), "up");
  assert.equal(renderTemplate("{{ if gt .Behind 0 }}down{{ else }}level{{ end }}", context), "level");
  assert.equal(renderTemplate("{{ if .Working.Changed }}{{ .Working.String }}{{ end }}", context), "~3");
  assert.equal(renderTemplate("{{ .Branch | upper }}", context), "MAIN");
  assert.equal(renderTemplate("{{ if and (gt .Ahead 0) (gt .Behind 0) }}both{{ end }}", context), "");
  assert.equal(renderTemplate("{{ if or (gt .Ahead 0) (gt .Behind 0) }}one{{ end }}", context), "one");
  assert.equal(renderTemplate("{{ .Missing }}", context), "");
});

test("else-if chains pick exactly one branch", () => {
  const template = "{{ if gt .Code 2 }}high{{ else if gt .Code 0 }}low{{ else }}none{{ end }}";
  assert.equal(renderTemplate(template, { Code: 5 }), "high");
  assert.equal(renderTemplate(template, { Code: 1 }), "low");
  assert.equal(renderTemplate(template, { Code: 0 }), "none");
});

test("the date filter speaks Go's reference layout", () => {
  const when = new Date(2026, 8, 16, 14, 5, 42);
  assert.equal(goDate(when, "15:04"), "14:05");
  assert.equal(goDate(when, "15:04:05"), "14:05:42");
  assert.equal(goDate(when, "2006-01-02"), "2026-09-16");
  assert.equal(goDate(when, "03:04 PM"), "02:05 PM");
  assert.equal(renderTemplate('{{ .CurrentDate | date "15:04" }}', { CurrentDate: when }), "14:05");
});

/* -------------------------------------------------------- the path styles */

test("the path styles shorten a path the way they say they do", () => {
  const cwd = "C:\\Users\\me\\Projects\\MyDiffMerge\\src";
  const home = "C:\\Users\\me";
  assert.equal(formatPath(cwd, home, { style: "full" }), "~\\Projects\\MyDiffMerge\\src");
  assert.equal(formatPath(cwd, home, { style: "folder" }), "src");
  assert.equal(formatPath(cwd, home, { style: "agnoster_short", max_depth: 2 }), "~\\…\\MyDiffMerge\\src");
  assert.equal(formatPath(cwd, home, { style: "agnoster" }), "~\\P\\M\\src");
  // Outside the home directory the drive stays where it is.
  assert.equal(formatPath("C:\\Home\\Projects", home, { style: "folder" }), "Projects");
  assert.equal(formatPath("/home/me/src", "/home/me", { style: "full" }), "~/src");
});

/* ------------------------------------------------------------ rendering */

test("the default prompt shows the folder and, in a repository, the branch", () => {
  const clean = renderPrompt(PRESETS.default.config, SAMPLE_STATES.clean, THEME);
  assert.match(text(clean), /MyDiffMerge/);
  assert.match(text(clean), /main/);
  const outside = renderPrompt(PRESETS.default.config, SAMPLE_STATES.plain, THEME);
  assert.doesNotMatch(text(outside), /main/, "a git segment was drawn outside a repository");
});

test("the git segment takes the colour of the repository's state", () => {
  const clean = renderPrompt(PRESETS.default.config, SAMPLE_STATES.clean, THEME);
  const dirty = renderPrompt(PRESETS.default.config, SAMPLE_STATES.dirty, THEME);
  const git = (prompt) => prompt.blocks.flatMap((block) => block.segments).find((segment) => segment.type === "git");
  assert.equal(clean.gitState, "uptodate");
  // The sample has something staged, and staged outranks modified.
  assert.equal(dirty.gitState, "staged");
  assert.notEqual(git(clean).bg, git(dirty).bg, "both states were drawn in the same colour");
});

test("switching the state colours off hands the git segment back to the theme", () => {
  // Agnoster names its own colours, so the difference is visible; the default prompt asks
  // for `auto`, which means the state colour whatever this switch says.
  const git = (prompt) => prompt.blocks.flatMap((block) => block.segments).find((segment) => segment.type === "git");
  const on = renderPrompt(PRESETS.agnoster.config, SAMPLE_STATES.clean, THEME);
  const off = renderPrompt(
    { ...clonePrompt(PRESETS.agnoster.config), git_state_colors: false },
    SAMPLE_STATES.clean,
    THEME,
  );
  assert.equal(git(on).bg, "#7cfc8b", "the state colour was not applied");
  assert.equal(git(off).bg, "#5faf00", "the theme's own colour was not kept");
});

test("the exit code only shows when it has to, and the run time only past its threshold", () => {
  const status = {
    blocks: [{ segments: [
      { type: "status", template: "{{ .Code }}", properties: {} },
      { type: "executiontime", template: "{{ .FormattedMs }}", properties: { threshold: 1000 } },
    ] }],
  };
  assert.equal(text(renderPrompt(status, { cwd: "C:\\x", rc: 0, ms: 100 }, THEME)), "");
  assert.equal(text(renderPrompt(status, { cwd: "C:\\x", rc: 3, ms: 100 }, THEME)), "3");
  assert.equal(text(renderPrompt(status, { cwd: "C:\\x", rc: 0, ms: 3200 }, THEME)), "3.20s");
});

test("gitState names every state, worst first", () => {
  assert.equal(gitState(null), "none");
  assert.equal(gitState({ repo: false }), "none");
  assert.equal(gitState({ repo: true, conflicts: 1, staged: 1, changed: 1 }), "conflict");
  assert.equal(gitState({ repo: true, staged: 1, changed: 1 }), "staged");
  assert.equal(gitState({ repo: true, changed: 1, ahead: 1 }), "modified");
  assert.equal(gitState({ repo: true, ahead: 1 }), "ahead");
  assert.equal(gitState({ repo: true, behind: 1 }), "behind");
  assert.equal(gitState({ repo: true }), "uptodate");
});

test("colour names resolve against the theme, the state and the palette", () => {
  const options = { theme: THEME, gitStateName: "modified", palette: { brand: "#123456" } };
  assert.equal(resolveColor("accent", options), THEME.accent);
  assert.equal(resolveColor("foreground", options), THEME.fg);
  assert.equal(resolveColor("transparent", options), null);
  assert.equal(resolveColor("#abcdef", options), "#abcdef");
  assert.equal(resolveColor("p:brand", options), "#123456");
  assert.equal(resolveColor("auto", options), "#ff5c5c");
});

test("a run time reads as a person would say it", () => {
  assert.equal(formatMs(40), "40ms");
  assert.equal(formatMs(3200), "3.20s");
  assert.equal(formatMs(42000), "42.0s");
  assert.equal(formatMs(125000), "2m 5s");
});

/* ------------------------------------------------- the saved prompts */

test("a saved prompt list is kept whole and tagged with its own id", () => {
  const list = sanitizeCustomPrompts([
    { id: "custom-1", label: "Mine", config: PRESETS.minimal.config },
    { id: "custom-1", label: "Duplicate", config: PRESETS.minimal.config },
    { id: "", label: "No id", config: {} },
    "nonsense",
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].label, "Mine");
  assert.equal(list[0].config.preset, "custom-1");
});

test("the settings store keeps the prompt and the terminal switches", () => {
  const defaults = defaultSettings();
  assert.equal(defaults.termCwd, "");
  assert.equal(defaults.showTerminalPanel, false);
  assert.equal(defaults.bottomPanel, "log");
  assert.equal(defaults.termEol, "shell");
  assert.equal(defaults.termCr, "overwrite");
  assert.equal(defaults.termColor, true);
  assert.equal(defaults.prompt.preset, "default");

  const saved = sanitize({
    ...defaults,
    showTerminalPanel: true,
    bottomPanel: "terminal",
    termEol: "crlf",
    termCr: "nonsense",
    termShell: "gitbash",
    termCwd: "  C:\tmp  ",
    prompt: PRESETS.minimal.config,
    customPrompts: [{ id: "custom-9", label: "Saved", config: PRESETS.pure.config }],
  });
  assert.equal(saved.showTerminalPanel, true);
  assert.equal(saved.bottomPanel, "terminal");
  assert.equal(saved.termEol, "crlf");
  assert.equal(saved.termCr, "overwrite", "an unknown carriage-return rule was written through");
  assert.equal(saved.termShell, "gitbash");
  assert.equal(saved.termCwd, "C:\tmp", "the start directory was not trimmed");
  assert.equal(saved.prompt.preset, "minimal");
  assert.equal(saved.customPrompts.length, 1);
});

/* ------------------------------------------------------- the output rules */

test("a lone carriage return overwrites, breaks or vanishes, as asked", () => {
  assert.equal(mergeOutput("", "50%\r100%\n", "overwrite"), "100%\n");
  assert.equal(mergeOutput("", "50%\r100%\n", "newline"), "50%\n100%\n");
  assert.equal(mergeOutput("", "50%\r100%\n", "strip"), "50%100%\n");
  // CR LF is a line ending, not a redraw.
  assert.equal(mergeOutput("", "one\r\ntwo\r\n", "overwrite"), "one\ntwo\n");
  // A CR at the very end waits for the next chunk to say what it meant.
  assert.equal(mergeOutput("", "50%\r", "overwrite"), "50%\r");
  assert.equal(mergeOutput("50%\r", "100%\n", "overwrite"), "100%\n");
  // Only the current line is overwritten, never what came before it.
  assert.equal(mergeOutput("done\n50%\r", "100%\n", "overwrite"), "done\n100%\n");
});

test("completions are listed in columns that fit the panel", () => {
  const names = ["one", "two", "three", "four", "five"];
  assert.equal(columns(names, 80).split("\n").length, 1);
  assert.equal(columns(names, 20).split("\n").length, 3);
  assert.equal(columns([], 80), "");
});

/* ------------------------------------------------------ the shell engine */

test("read-only commands are recognised, compound lines included", () => {
  assert.ok(isReadOnly("cd src"));
  assert.ok(isReadOnly("git status"));
  assert.ok(isReadOnly("ls -al && pwd"));
  assert.ok(!isReadOnly("git commit -m x"));
  assert.ok(!isReadOnly("ls && npm install"), "a write half made the whole line read-only");
  assert.ok(!isReadOnly(""));
});

test("Windows Terminal profiles and /etc/shells are read for their shells", () => {
  assert.deepEqual(parseEtcShells("# a comment\n/bin/bash\n\n/usr/bin/zsh\nrelative\n"), ["/bin/bash", "/usr/bin/zsh"]);
  assert.equal(parseWtCommandLine('"C:\\Program Files\\PowerShell\\pwsh.exe" -nologo'), "C:\\Program Files\\PowerShell\\pwsh.exe");
  assert.equal(parseWtCommandLine("cmd.exe /k"), "cmd.exe");
  assert.deepEqual(parseJsonc('{ /* note */ "a": 1, }'), { a: 1 });
  const profiles = parseWtProfiles({
    profiles: { list: [
      { name: "Shown", commandline: "cmd.exe" },
      { name: "Hidden", commandline: "cmd.exe", hidden: true },
      { name: "WSL", commandline: "wsl.exe", source: "Windows.Terminal.Wsl" },
      { name: "No command" },
    ] },
  });
  assert.deepEqual(profiles, [{ name: "Shown", exe: "cmd.exe" }]);
});

test("this computer offers at least one shell, and each one is whole", () => {
  const listed = shells(true);
  assert.ok(listed.length > 0, "no shell was found on this computer");
  for (const shell of listed) {
    assert.ok(shell.id && shell.label, "a shell was offered without a name");
    assert.ok(["cmd", "powershell", "sh"].includes(shell.kind), `${shell.id} has kind ${shell.kind}`);
    assert.equal(typeof shell.source("/tmp/x"), "string");
    assert.ok(shell.cwdLine.includes("__MDM_CWD__"), `${shell.id} never reports its directory`);
  }
});

test("only shells that actually start are offered", async () => {
  // The scan finds files; this list is what answered when it was run. Anything that was
  // offered must therefore be openable, which is the whole point of the check.
  const found = shells(true);
  const working = await verifiedShells(true);
  assert.ok(working.length > 0, "no shell on this computer could be started");
  assert.ok(working.length <= found.length, "a shell was verified that was never found");
  for (const shell of working) assert.ok(found.some((item) => item.id === shell.id));
});

test("a session reports itself, and killing it is final", async () => {
  const terminals = createTerminals();
  try {
    const listed = await terminals.shells();
    assert.ok(listed.length > 0);
    const session = await terminals.create({ cwd: process.cwd() });
    assert.equal(typeof session.id, "number");
    assert.equal(session.cwd, process.cwd());
    assert.equal(terminals.list().length, 1);
    assert.ok(terminals.kill({ id: session.id }));
    assert.equal(terminals.list().length, 0);
    assert.equal(terminals.kill({ id: session.id }), false);
  } finally {
    terminals.shutdown();
  }
});

test("a shell that is not installed is refused, not quietly swapped", async () => {
  const terminals = createTerminals();
  try {
    await assert.rejects(
      () => terminals.create({ cwd: process.cwd(), shell: "no-such-shell" }),
      /not installed/i,
    );
    assert.equal(terminals.list().length, 0, "a terminal was opened anyway");
  } finally {
    terminals.shutdown();
  }
});

test("completion offers the files of the directory the session is in", async () => {
  const terminals = createTerminals();
  try {
    const session = await terminals.create({ cwd: process.cwd() });
    const result = terminals.complete({ id: session.id, line: "type packa", cursor: 10 });
    assert.equal(result.start, 5);
    assert.ok(result.items.some((item) => item.text.startsWith("package")), "package.json was not offered");
    const commands = terminals.complete({ id: session.id, line: "ec", cursor: 2 });
    assert.ok(commands.items.some((item) => item.cmd), "no command was offered for the first word");
  } finally {
    terminals.shutdown();
  }
});

test("a command runs, and a directory with " + "&" + " in its name survives the round trip", async () => {
  // The marker the shell prints to report its directory is a shell command like any
  // other: unquoted, cmd would read the ampersand as a separator and report half a path
  // while running the other half. This project's own folder has one in its name.
  const dir = path.join(scratch, "a" + "&" + "b dir");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "hello.txt"), "hello\n", "utf8");

  const terminals = createTerminals();
  try {
    const session = await terminals.create({ cwd: dir });
    assert.equal(session.cwd, dir);
    const marker = `mdm-${Date.now()}`;
    const result = await runAndSettle(terminals, session.id, `echo ${marker}`);
    assert.match(result.out, new RegExp(marker), "the command did not echo back");
    assert.equal(normalise(result.cwd), normalise(dir), "the shell reported a different directory");
    assert.equal(result.rc, 0);
    // Nothing of the path may have leaked into the output as a command of its own.
    assert.doesNotMatch(result.out, /__MDM_CWD__/, "the marker was left in the output");
  } finally {
    terminals.shutdown();
  }
});

/** Git Bash answers with /c/... and cmd with C:\\...; either names the same place. */
function normalise(target) {
  return path.resolve(String(target).replace(/^\/([a-zA-Z])\//, (_all, letter) => `${letter}:/`)).toLowerCase();
}
