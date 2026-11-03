// Test cases for the terminal prompt; test/cases.ts runs them with the rest.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS, normalizePrompt, renderPromptAnsi, renderPromptHtml, SAMPLE_STATES } from "../../core/promptCore.js";
import {
  cmdPromptString,
  escapeForBash,
  escapeForCmd,
  escapeForZsh,
  nativePath,
  PromptServer,
  powershellHook,
  shellKind,
} from "../../core/promptHook.js";
import { promptFromSettings, promptThemeOf } from "../../core/promptSettings.js";
import { gitStatusSync, parseGitStatus } from "../../core/promptState.js";
import { SettingsStore } from "../../core/settings.js";
import { installedShells } from "../../core/shells.js";
import { translate } from "../../src/i18n.js";
import { promptStrings } from "../../src/strings/prompt.js";
import { runShell } from "./promptShell.js";
import { assert, type AddCase, type FeatureCtx } from "./types";

const SGR = /\x1b\[[0-9;]*m/g;
const visible = (ansi: string) => ansi.replace(SGR, "");

function ask(port: number, token: string, query: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: `/prompt/${token}${query}`, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
  });
}

export function promptCases(ctx: FeatureCtx, add: AddCase): void {
  add("Prompt", "Every preset renders as ANSI with 24-bit colours and the folder", async () => {
    const theme = promptThemeOf("dark-midnight");
    for (const [id, preset] of Object.entries(PRESETS as Record<string, { config: unknown }>)) {
      const ansi = renderPromptAnsi(preset.config, SAMPLE_STATES.clean, theme) as string;
      assert(ansi.length > 0, `${id} is empty`);
      assert(!/undefined|NaN|\[object/.test(ansi), `${id}: ${JSON.stringify(ansi)}`);
      assert(/\x1b\[[34]8;2;\d+;\d+;\d+m/.test(ansi) || !/\x1b/.test(ansi), `${id} uses 24-bit colour`);
    }
    const plain = visible(renderPromptAnsi(PRESETS.default.config, SAMPLE_STATES.dirty, theme) as string);
    assert(plain.includes("renderer") || plain.includes("MyTerminal"), plain);
    assert(plain.includes("feature/tabs"), `the branch: ${plain}`);
  });

  add("Prompt", "Powerline arrows are the one-cell U+E0B0 that xterm draws itself", async () => {
    const ansi = renderPromptAnsi(PRESETS.default.config, SAMPLE_STATES.clean, promptThemeOf("light-classic")) as string;
    assert(ansi.includes("\ue0b0"), JSON.stringify(ansi));
    assert(!/[\ue0d0\ue0d1]/.test(ansi), "no patched two-cell arrows");
    const html = renderPromptHtml(PRESETS.default.config, SAMPLE_STATES.clean, promptThemeOf("light-classic")) as string;
    assert(html.includes("pseg"), html.slice(0, 200));
  });

  add("Prompt", "Settings keep a valid prompt and Restore defaults keeps saved prompts", async () => {
    const dir = path.join(ctx.home, "prompt-settings");
    const store = new SettingsStore(dir);
    assert(store.get().promptConfig === null && store.get().promptGitMode === "status", JSON.stringify(store.get().promptGitMode));
    const config = normalizePrompt(PRESETS.default.config);
    const custom = [{ id: "custom-test", label: "Mine", config }];
    store.update({ promptConfig: { blocks: "nonsense" }, promptGitMode: "weird", customPrompts: [...custom, { id: "", config: null }] });
    let saved = new SettingsStore(dir).get();
    assert(Array.isArray((saved.promptConfig as { blocks: unknown[] }).blocks), JSON.stringify(saved.promptConfig));
    assert(saved.promptGitMode === "status", String(saved.promptGitMode));
    assert((saved.customPrompts as unknown[]).length === 1, JSON.stringify(saved.customPrompts));
    store.update({ promptGitMode: "branch", promptConfig: config });
    store.resetPreferences();
    saved = new SettingsStore(dir).get();
    assert(saved.promptGitMode === "status" && saved.promptConfig === null, "restored");
    assert((saved.customPrompts as unknown[]).length === 1, "saved prompts survive Restore defaults");
    const resolved = promptFromSettings({ promptPresetId: "custom-test", customPrompts: custom });
    assert(JSON.stringify(resolved.config).includes("blocks"), "a saved prompt can be chosen by id");
  });

  add("Prompt", "Prompt text is escaped for each shell's prompt syntax", async () => {
    const ansi = "\x1b[31m50% $HOME\\x (a|b)\x1b[0m\n> ";
    assert(escapeForBash(ansi) === "\x01\x1b[31m\x0250% $HOME\\\\x (a|b)\x01\x1b[0m\x02\n> ", JSON.stringify(escapeForBash(ansi)));
    assert(escapeForZsh(ansi) === "%{\x1b[31m%}50%% $HOME\\x (a|b)%{\x1b[0m%}\n> ", JSON.stringify(escapeForZsh(ansi)));
    assert(escapeForCmd(ansi) === "$E[31m50% $$HOME\\x $Ca$Bb$F$E[0m$_$G ", JSON.stringify(escapeForCmd(ansi)));
    const cmd = cmdPromptString({ theme: "dark-midnight" });
    assert(cmd.includes("$P") && cmd.includes("$E["), cmd);
    assert(!cmd.includes("\x1b"), "no raw escape in PROMPT");
    assert(shellKind("C:\\Windows\\System32\\cmd.exe") === "cmd" && shellKind("/usr/bin/zsh") === "zsh", "kinds");
    assert(shellKind("C:\\x\\pwsh.exe") === "powershell" && shellKind("C:\\x\\wsl.exe") === "wsl", "kinds 2");
    if (process.platform === "win32") {
      assert(nativePath("/c/Users/me") === "C:\\Users\\me" && nativePath("/cygdrive/d/x") === "D:\\x", "msys paths");
      assert(nativePath("C:/Home/a") === "C:\\Home\\a", "forward slashes");
    }
    const script = powershellHook("http://127.0.0.1:1/prompt/t", "pwsh");
    assert(script.includes("function global:prompt") && script.includes("DownloadString"), "PowerShell hook");
  });

  add("Prompt", "Git status for the prompt is read from porcelain v2", async () => {
    const parsed = parseGitStatus([
      "# branch.oid abc", "# branch.head main", "# branch.upstream origin/main", "# branch.ab +2 -1", "# stash 3",
      "1 M. N... 100644 100644 100644 a b f1", "1 .M N... 100644 100644 100644 a b f2", "u UU N... 1 2 3 4 a b c f3", "? new.txt",
    ].join("\n"));
    assert(parsed.branch === "main" && parsed.ahead === 2 && parsed.behind === 1 && parsed.stashes === 3, JSON.stringify(parsed));
    assert(parsed.staged === 1 && parsed.changed === 1 && parsed.conflicts === 1 && parsed.untracked === 1, JSON.stringify(parsed));
    const live = gitStatusSync(ctx.repo);
    assert(live.repo && live.branch === "main", JSON.stringify(live));
  });

  add("Prompt", "The prompt server renders the saved prompt for the folder it is asked about", async () => {
    let settings: Record<string, unknown> = { theme: "dark-ink", promptGitMode: "status" };
    const server = new PromptServer(() => settings);
    try {
      const port = await server.start();
      const first = await ask(port, server.token, `?kind=powershell&rc=0&cwd=${encodeURIComponent(ctx.repo)}`);
      assert(first.status === 200, String(first.status));
      assert(visible(first.body).includes(path.basename(ctx.repo)) && visible(first.body).includes("main"), JSON.stringify(first.body));
      const bash = await ask(port, server.token, "?kind=bash", { "X-Cwd": ctx.repo, "X-Rc": "1" });
      assert(bash.body.includes("\x01\x1b[") && bash.body.includes("\x02"), "bash gets non-printing markers");
      settings = { ...settings, promptGitMode: "off" };
      const off = await ask(port, server.token, `?kind=powershell&cwd=${encodeURIComponent(ctx.repo)}`);
      assert(!visible(off.body).includes("main"), `settings are read on every prompt: ${JSON.stringify(off.body)}`);
      const wrong = await ask(port, "nope", "");
      assert(wrong.status === 404, "another token is refused");
    } finally {
      server.close();
    }
  });

  add("Prompt", "A real shell in the terminal shows the app's prompt", async () => {
    const shells = installedShells().filter((shell) => ["powershell", "bash", "cmd", "zsh"].includes(shellKind(shell.command)));
    const shell = shells[0];
    assert(shell, "no hookable shell installed");
    const run = runShell(shell, ctx.repo, () => ({ theme: "dark-midnight", promptGitMode: "status" }));
    try {
      const name = path.basename(ctx.repo);
      // The default preset: the folder on a painted segment closed by the powerline arrow.
      await run.waitFor((out) => out.includes(name) && out.includes("\ue0b0"), 30000);
      run.type("echo MGM_PROMPT_OK\r");
      await run.waitFor((out) => out.split("MGM_PROMPT_OK").length >= 3 && out.lastIndexOf("\ue0b0") > out.lastIndexOf("MGM_PROMPT_OK"), 20000);
    } finally {
      run.close();
    }
  });

  add("Prompt", "Prompt strings exist in Korean and English", async () => {
    const ko = Object.keys(promptStrings.ko);
    const en = Object.keys(promptStrings.en);
    assert(ko.length >= 60 && ko.length === en.length, `${ko.length} / ${en.length}`);
    for (const key of ko) {
      assert(promptStrings.en[key], `en ${key}`);
      assert(translate("ko", key) !== key && translate("en", key) !== key, key);
    }
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const editor = fs.readFileSync(path.join(root, "src", "promptEditor.js"), "utf8");
    for (const match of editor.matchAll(/\bt\('([A-Za-z.]+)'/g)) {
      if (match[1].includes("${")) continue;
      assert(`prompt.${match[1]}` in promptStrings.ko, `missing prompt.${match[1]}`);
    }
  });
}
