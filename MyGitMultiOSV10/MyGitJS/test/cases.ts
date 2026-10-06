import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApiError, redact } from "../core/errors.js";
import { listDirectory, systemDrives } from "../core/fsBrowse.js";
import { collectDiffTools, installedDiffTools } from "../core/diffTools.js";
import { documentFromLines } from "../core/lineDiff.js";
import { BUILTIN_MERGE_TOOL, isBuiltinMergeTool, usesBuiltinMerge } from "../core/mergeTool.js";
import { buildResult, conflictCount, mergeTexts } from "../core/threeWayMerge.js";
import { GitApp } from "../core/gitApp.js";
import { releaseStaleIndexLock, clearStaleIndexLock, runGit } from "../core/gitProcess.js";
import { renderCsv, renderDocx, renderMarkdown, renderXlsx, type Report } from "../core/report.js";
import { defaultPageSetup, paginate, renderPrintHtml, runningBands, type PrintBlock } from "../core/printLayout.js";
import { renderPdf } from "../core/reportPdf.js";
import { SettingsStore, DEFAULT_COMMIT_CATEGORIES } from "../core/settings.js";
import { installedShells, resolveShell, sameShell } from "../core/shells.js";
import { badgeOf, colorOf, countWork, hasChanges, mergeStatus, parseAheadBehind, statusFromPorcelain, EMPTY_STATUS } from "../core/status.js";
import { applyTheme, isThemeId, nextThemeId, themeById, THEMES } from "../core/themes.js";
import { startServer } from "../server/index.js";
import { buildFlat, buildGraph } from "../src/graph.js";
import { Icon, MenuGlyph, type IconName } from "../src/icons.js";
import { translate, TRANSLATION_KEYS } from "../src/i18n.js";
import { parseToolHash, toolHash } from "../src/toolLaunch.js";
import { WebSocket } from "ws";

export type TestCase = { group: string; name: string; fn: () => Promise<void> };

type Ctx = {
  home: string;
  settingsDir: string;
  repo: string;
  app: GitApp;
  sha: string;
};

const ICONS: IconName[] = [
  "folder", "branch", "history", "help", "open", "clone", "browse", "prefs", "clock", "refresh",
  "plus", "undo", "discard", "commit", "fetch", "pull", "push", "stash", "stashPop", "status",
  "list", "export", "snapshot", "copy", "hash", "filePlus", "folderPlus", "trash", "eyeOff", "eye",
  "stop", "theme", "language", "drive", "panelLeft", "panelRight", "panelBottom", "terminal", "lock", "alert", "print", "prev", "next",
];

const UI_KEYS = [
  "file", "open", "clone", "browse", "preferences", "refresh", "gitAdd", "gitReset", "discard",
  "gitCommit", "gitFetch", "gitPull", "gitPush", "gitStash", "gitStashPop", "gitStatus", "showAll",
  "exportSummary", "exportCommit", "about", "checkout", "copyName", "copySha", "copyMessage",
  "openExternal", "copyPath", "copy", "wordWrap", "openFolder", "showLog", "newFile", "newFolder",
  "delete", "ignore", "unignore", "files", "creator", "authorName", "appVersion", "buildInfo", "platform", "settingsFile", "errorTitle", "copied", "theme", "language",
  "recent", "removeRecent", "clearRecent",
  "panelLeft", "panelRight", "panelBottom", "outputLog", "logEmpty", "clearLog", "terminal", "terminalShell",
  "prefsGeneral", "prefsTools", "restoreDefaults",
  "pageHeader", "pageFooter", "headerText", "footerText", "headerAlign", "footerAlign",
  "alignLeft", "alignCenter", "alignRight", "showPageNumber", "pageNumberAt", "pageNumberStyle",
  "pageOf", "pageNumberOnly", "showPrintDate", "posTopLeft", "posTopCenter", "posTopRight",
  "posBottomLeft", "posBottomCenter", "posBottomRight",
];

export function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mygit-test-"));
}

export async function prepare(home: string): Promise<Ctx> {
  const settingsDir = path.join(home, "settings");
  const repo = path.join(home, "repo");
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  await git(repo, ["init", "-b", "main"]);
  await identity(repo);
  fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "Initial"]);
  const app = new GitApp(settingsDir);
  await app.open(repo);
  return { home, settingsDir, repo, app, sha: "" };
}

export function cases(ctx: Ctx): TestCase[] {
  const list: TestCase[] = [];
  const add = (group: string, name: string, fn: () => Promise<void>) => list.push({ group, name, fn });

  add("Theme", "Light 20 and Dark 20 have distinct ids", async () => {
    const light = THEMES.filter((item) => item.mode === "light");
    const dark = THEMES.filter((item) => item.mode === "dark");
    assert(light.length === 20 && dark.length === 20, `light ${light.length} dark ${dark.length}`);
    assert(new Set(THEMES.map((item) => item.id)).size === 40, "duplicate theme id");
    assert(isThemeId("light-classic") && isThemeId("dark-midnight") && !isThemeId("nope"), "theme id check");
    applyTheme("dark-ink");
    applyTheme("not-a-theme");
    assert(nextThemeId("light-classic") === "light-paper", nextThemeId("light-classic"));
    assert(nextThemeId("light-porcelain") === "dark-midnight", "light wraps into dark");
    assert(nextThemeId("dark-ice") === "light-classic", "dark wraps to the first light theme");
    assert(nextThemeId("missing") === "light-paper", "unknown starts after the default");
    const seen = new Set<string>();
    let cursor = "light-classic";
    for (let step = 0; step < THEMES.length; step++) {
      seen.add(cursor);
      cursor = nextThemeId(cursor);
    }
    assert(seen.size === THEMES.length && cursor === "light-classic", "round robin");
  });

  add("Icons", "Menu and toolbar icons render as SVG", async () => {
    for (const name of ICONS) {
      const html = renderToStaticMarkup(createElement(Icon, { name }));
      const glyph = renderToStaticMarkup(createElement(MenuGlyph, { name }));
      assert(html.includes("<svg") && glyph.includes("menu-glyph"), name);
    }
  });

  add("Status", "Porcelain codes become U D R T ! ± X P badges", async () => {
    const samples: [string, string][] = [["??", "U"], ["!!", "X"], [" D", "D"], ["R ", "R"], ["T ", "T"], ["UU", "!"], ["AA", "!"], ["DD", "!"], ["M ", "±"], [" M", "±"]];
    for (const [code, badge] of samples) {
      assert(badgeOf(statusFromPorcelain(code)) === badge, `${code} => ${badgeOf(statusFromPorcelain(code))}`);
    }
    assert(badgeOf({ staged: null, workTree: null, unpushed: true }) === "P", "unpushed");
    assert(colorOf(statusFromPorcelain("??")) === "#059669", "untracked color");
    assert(colorOf(statusFromPorcelain("!!")) === "#64748b", "ignored color");
  });

  add("Status", "Worktree counts keep staged, modified, deleted, untracked, and conflicts apart", async () => {
    const counts = countWork([
      statusFromPorcelain("M "),
      statusFromPorcelain("MM"),
      statusFromPorcelain(" M"),
      statusFromPorcelain(" D"),
      statusFromPorcelain("??"),
      statusFromPorcelain("UU"),
      statusFromPorcelain("!!"),
      { staged: null, workTree: null, unpushed: true },
    ]);
    assert(counts.staged === 2, `staged ${counts.staged}`);
    assert(counts.modified === 2, `modified ${counts.modified}`);
    assert(counts.deleted === 1, `deleted ${counts.deleted}`);
    assert(counts.untracked === 1, `untracked ${counts.untracked}`);
    assert(counts.conflicted === 1, `conflict ${counts.conflicted}`);
    assert(counts.unpushed === 1, `unpushed ${counts.unpushed}`);
    assert(parseAheadBehind("3\t1").ahead === 3 && parseAheadBehind("3\t1").behind === 1, "ahead behind");
    assert(parseAheadBehind("").ahead === 0 && parseAheadBehind("nope").behind === 0, "empty");
  });

  add("Commit graph", "Linear, branch, and merge lanes are calculated", async () => {
    const linear = buildGraph([{ sha: "c", parents: ["b"] }, { sha: "b", parents: ["a"] }, { sha: "a", parents: [] }]);
    assert(linear.every((row) => row.lane === 0), "linear lane");
    assert(linear[0].continuesDown && !linear[2].continuesDown, "continues");
    const merge = buildGraph([
      { sha: "m", parents: ["a", "b"] },
      { sha: "b", parents: ["r"] },
      { sha: "a", parents: ["r"] },
      { sha: "r", parents: [] },
    ]);
    assert(merge[0].forks.length > 0, "merge forks");
    const flat = buildFlat([{ sha: "a", parents: ["b"] }, { sha: "b", parents: [] }]);
    assert(flat[0].continuesDown && !flat[1].continuesDown && flat.every((row) => row.lane === 0), "flat");
  });

  add("Language", "Menu text exists in Korean and English and shows the creator", async () => {
    for (const key of UI_KEYS) {
      assert(translate("ko", key) !== key, `ko ${key}`);
      assert(translate("en", key) !== key, `en ${key}`);
    }
    assert(translate("ko", "creator") === "제작자", "creator label");
    assert(translate("ko", "authorName") === "SHKWON(knix008@naver.com)", "author");
    assert(translate("en", "authorName") === "SHKWON(knix008@naver.com)", "author en");
    assert(translate("ko", "author") === "작성자", "commit author column");
  });

  add("Errors", "Credentials inside a repository URL are redacted", async () => {
    const hidden = redact("fatal: https://user:secret@github.com/a/b");
    assert(!hidden.includes("secret") && hidden.includes("https://***@"), hidden);
  });

  add("Settings", "Theme, recent repositories, and the token are stored", async () => {
    const dir = path.join(ctx.home, "settings-unit");
    const store = new SettingsStore(dir);
    store.update({ theme: "dark-ink", language: "en" });
    store.update({ theme: "not-a-theme" });
    assert(store.get().theme === "not-a-theme", "unsaved memory keeps the patch");
    const reloaded = new SettingsStore(dir);
    assert(reloaded.get().theme === "light-classic", reloaded.get().theme);
    assert(reloaded.get().language === "en", "language");
    reloaded.setCredentials("tester", "token-value", true);
    assert(reloaded.publicView().hasCredentials, "has token");
    assert(!JSON.stringify(reloaded.publicView()).includes("token-value"), "token not public");
    assert(reloaded.getToken() === "token-value", "decrypt");
    reloaded.rememberCloneUrl("https://example.com/a.git");
    reloaded.removeCloneUrl("https://example.com/a.git");
    assert(reloaded.get().recentCloneUrls.length === 0, "url removed");
    for (let index = 0; index < 12; index++) reloaded.rememberRepository(path.join(ctx.home, `recent-${index}`), { mode: "local", path: path.join(ctx.home, `recent-${index}`) });
    assert(reloaded.get().recentRepositoryPaths.length === 10, "recent limit");
    const newest = path.join(ctx.home, "recent-11");
    reloaded.removeRepository(newest);
    assert(!reloaded.get().recentRepositoryPaths.includes(newest) && reloaded.get().recentRepositoryPaths.length === 9, "one recent removed");
    reloaded.clearRepositories();
    assert(reloaded.get().recentRepositoryPaths.length === 0, "recent cleared");
  });

  add("File system", "A temporary folder and the system drives can be listed", async () => {
    const listed = listDirectory(ctx.home);
    assert(listed.entries.some((entry) => entry.name === "repo" && entry.directory), "repo folder");
    const missing = path.join(ctx.home, "missing-folder");
    const error = await expectCode(async () => listDirectory(missing), "MISSING");
    assert(error.message.includes("Folder not found"), error.message);
    const drives = await systemDrives();
    assert(drives.length > 0, "no drives");
    if (process.platform === "win32") assert(drives.some((drive) => drive.label === "C:"), drives.map((drive) => drive.label).join(","));
  });

  add("Git", "A path that is not a repository returns NOT_A_REPO detail", async () => {
    const plain = path.join(ctx.home, "plain");
    fs.mkdirSync(plain);
    const app = new GitApp(path.join(ctx.home, "settings-missing"));
    const error = await expectCode(() => app.open(plain), "NOT_A_REPO");
    assert(error.detail.length > 0, "missing git detail");
    app.close();
  });

  add("Git", "An opened repository shows its branch and files", async () => {
    const info = ctx.app.info();
    assert(info?.branch === "main" && info.path === ctx.repo, JSON.stringify(info));
    const tree = ctx.app.tree();
    assert(tree.writable && tree.local.some((item) => item.name === "main" && item.current), "main");
    const files = await ctx.app.files("");
    assert(files.some((entry) => entry.name === "README.md"), "readme");
  });

  add("Git", "A new file is badged U and can be staged and unstaged", async () => {
    const beforeGen = ctx.app.tick().generation;
    fs.writeFileSync(path.join(ctx.repo, "note.txt"), "one\n");
    await waitRefresh(ctx.app);
    const before = await ctx.app.files("");
    assert(before.find((entry) => entry.name === "note.txt")?.badge === "U", "untracked badge");
    const preview = await ctx.app.addPreview(["note.txt"]);
    assert(preview.some((line) => line.includes("note.txt")), preview.join("\n"));
    await ctx.app.add(["note.txt"]);
    assert(ctx.app.tick().generation > beforeGen, "generation");
    await ctx.app.unstage(["note.txt"]);
    const status = await ctx.app.gitStatusText();
    assert(/note\.txt/.test(status), status);
    await ctx.app.add(["note.txt"]);
  });

  add("Git", "An empty commit message is rejected and a real message is recorded", async () => {
    await expectCode(() => ctx.app.commit("   "), "MESSAGE");
    const message = await ctx.app.commit("Add note");
    assert(/Add note|note\.txt|file changed/i.test(message), message);
    const history = await ctx.app.log();
    assert(history.commits[0]?.subject === "Add note" && !history.flat, history.commits[0]?.subject);
    ctx.sha = history.commits[0].sha;
  });

  add("Git", "Commit detail and diff include the changed file", async () => {
    const detail = await ctx.app.commitDetail(ctx.sha);
    assert(detail.files.some((file) => file.path === "note.txt"), JSON.stringify(detail.files));
    const diff = await ctx.app.diff(ctx.sha, "note.txt");
    assert(diff.includes("+one"), diff);
  });

  add("Git", "Discard restores a working tree change", async () => {
    fs.writeFileSync(path.join(ctx.repo, "note.txt"), "changed\n");
    await ctx.app.discard(["note.txt"]);
    assert(readText(path.join(ctx.repo, "note.txt")) === "one\n", "not restored");
  });

  add("Git", "A folder can be created and deleted", async () => {
    await ctx.app.createFile("extra/nested.txt", false);
    assert(fs.existsSync(path.join(ctx.repo, "extra", "nested.txt")), "created");
    await expectCode(() => ctx.app.createFile("extra/nested.txt", false), "EXISTS");
    await ctx.app.deletePath("extra");
    assert(!fs.existsSync(path.join(ctx.repo, "extra")), "deleted");
    await expectCode(() => ctx.app.deletePath("extra"), "MISSING");
  });

  add("Git", "A path can be added to and removed from .gitignore", async () => {
    fs.writeFileSync(path.join(ctx.repo, "noise.tmp"), "skip\n");
    await ctx.app.gitignore("noise.tmp", false);
    const ignored = await ctx.app.files("");
    assert(ignored.find((entry) => entry.name === "noise.tmp")?.badge === "X", JSON.stringify(ignored.map((entry) => [entry.name, entry.badge])));
    await ctx.app.gitignore("noise.tmp", true);
    const visible = await ctx.app.files("");
    assert(visible.find((entry) => entry.name === "noise.tmp")?.badge === "U", "still ignored");
  });

  add("Git", "Checkout switches to another branch", async () => {
    await git(ctx.repo, ["checkout", "-b", "feature"]);
    await ctx.app.checkout("main");
    assert(ctx.app.info()?.branch === "main", ctx.app.info()?.branch ?? "");
    await ctx.app.checkout("feature");
    assert(ctx.app.info()?.branch === "feature", "feature");
    await ctx.app.checkout("main");
  });

  add("Git", "A change can be stashed and restored", async () => {
    fs.writeFileSync(path.join(ctx.repo, "note.txt"), "stashed\n");
    await ctx.app.stash();
    assert(readText(path.join(ctx.repo, "note.txt")) === "one\n", "stash kept change");
    await ctx.app.stashPop();
    assert(readText(path.join(ctx.repo, "note.txt")) === "stashed\n", "pop");
    fs.writeFileSync(path.join(ctx.repo, "note.txt"), "one\n");
  });

  add("Git", "Path-filtered history uses a flat graph", async () => {
    const filtered = await ctx.app.log(50, "note.txt");
    assert(filtered.flat && filtered.commits.length >= 1, `count ${filtered.commits.length}`);
  });

  add("Git", "A commit snapshot is exported to a folder", async () => {
    const dest = path.join(ctx.home, "snapshot");
    const count = await ctx.app.exportCommit(ctx.sha, dest);
    assert(count >= 1 && fs.existsSync(path.join(dest, "note.txt")), `count ${count}`);
  });

  add("Git", "The summary includes the commit count and contributors", async () => {
    const summary = await ctx.app.summary();
    assert(summary.commitCount >= 2, `count ${summary.commitCount}`);
    assert(summary.contributors.some((item) => item.name === "MyGit Test"), JSON.stringify(summary.contributors));
    assert(summary.recent[0]?.subject.length > 0, "recent");
  });

  add("Git", "History reports include the summary in Markdown, Word, Excel, CSV, and PDF", async () => {
    const report: Report = {
      title: "Commit history",
      filename: "MyGit-history",
      generatedAt: "2026-10-01T00:00:00.000Z",
      summary: [{ label: "Branch", value: "main" }, { label: "Commits", value: "2" }],
      tables: [{
        title: "Commit history",
        headers: ["SHA", "Subject"],
        rows: [["abc1234", "Initial"], ["def5678", "한글 제목"]],
      }],
    };
    const markdown = renderMarkdown(report);
    assert(markdown.includes("Branch: main") && markdown.includes("Initial") && markdown.includes("한글 제목"), "markdown");
    const csv = renderCsv(report);
    assert(csv.includes("Branch") && csv.includes("한글 제목"), "csv");
    const docx = Buffer.from(renderDocx(report));
    const xlsx = Buffer.from(renderXlsx(report));
    assert(docx.subarray(0, 2).toString() === "PK" && docx.includes("Initial") && docx.includes("한글 제목"), "docx");
    assert(xlsx.subarray(0, 2).toString() === "PK" && xlsx.includes("Branch") && xlsx.includes("한글 제목"), "xlsx");
    const pdf = Buffer.from(await renderPdf(report));
    assert(pdf.subarray(0, 5).toString() === "%PDF-", "pdf");
    if (fs.existsSync("C:/Windows/Fonts/malgun.ttf")) assert(pdf.length > 3000, `pdf font ${pdf.length}`);
  });

  add("Git", "Print preview splits history across pages and repeats the table header", async () => {
    const blocks: PrintBlock[] = [
      { type: "heading", text: "History" },
      { type: "thead", cells: ["SHA"] },
      ...Array.from({ length: 12 }, (_, index) => ({ type: "row" as const, cells: [`commit ${index}`] })),
    ];
    const pages = paginate(blocks, 500, 90);
    assert(pages.length > 1, `pages ${pages.length}`);
    assert(pages[1].some((block) => block.type === "thead"), "header repeated");
    assert(pages.flat().filter((block) => block.type === "row").length === 12, "rows kept");
    const setup = defaultPageSetup("History");
    setup.showHeader = true;
    setup.headerText = "MyGit History";
    setup.headerAlign = "center";
    setup.showPageNumber = true;
    setup.pageNumberPosition = "top-left";
    setup.pageNumberStyle = "number";
    setup.showDate = true;
    setup.showFooter = true;
    setup.footerText = "Confidential";
    const bands = runningBands(setup, 2, 4, "2026-10-01");
    assert(bands.top?.left === "2026-10-01  2" && bands.top.center === "MyGit History", JSON.stringify(bands.top));
    assert(bands.bottom?.center === "Confidential", JSON.stringify(bands.bottom));
    const html = renderPrintHtml({
      title: "History",
      filename: "history",
      generatedAt: "2026-10-01",
      summary: [],
      tables: [],
    }, setup);
    assert(html.includes("MyGit History") && html.includes("2026-10-01  1") && html.includes("Confidential"), "print html");
    setup.showPageNumber = false;
    setup.showHeader = false;
    setup.showFooter = false;
    setup.showDate = false;
    const hidden = runningBands(setup, 1, 1, "2026-10-01");
    assert(hidden.top === null && hidden.bottom === null, "page chrome hidden");
  });

  add("Git", "A non-GitHub repository has no releases", async () => {
    const releases = await ctx.app.releases();
    assert(Array.isArray(releases) && releases.length === 0, "releases");
  });

  add("Git", "A stale index lock is removed and add preview continues", async () => {
    const lock = path.join(ctx.repo, ".git", "index.lock");
    fs.writeFileSync(lock, "");
    const message = `fatal: Unable to create '${lock.replaceAll("\\", "/")}': File exists.\n\nAnother git process seems to be running in this repository, or the lock file may be stale`;
    assert(releaseStaleIndexLock(message) && !fs.existsSync(lock), "lock removed");
    const old = new Date(Date.now() - 60_000);
    fs.writeFileSync(lock, "");
    fs.utimesSync(lock, old, old);
    assert(clearStaleIndexLock(ctx.repo) && !fs.existsSync(lock), "old lock removed");
    fs.writeFileSync(lock, "");
    assert(!clearStaleIndexLock(ctx.repo), "fresh lock kept");
    fs.rmSync(lock);
    fs.writeFileSync(lock, "");
    const preview = await ctx.app.addPreview(["README.md"]);
    assert(!fs.existsSync(lock), "preview left the lock");
    assert(Array.isArray(preview), JSON.stringify(preview));
    assert(!releaseStaleIndexLock("fatal: not a git repository"), "unrelated");
  });

  add("Git", "Status polling stays behind add preview and git status", async () => {
    const attempts = Array.from({ length: 4 }, () => Promise.all([
      ctx.app.addPreview(["README.md"]),
      ctx.app.gitStatusText(),
      ctx.app.files(""),
    ]));
    const results = await Promise.all(attempts);
    for (const [preview, status, entries] of results) {
      assert(Array.isArray(preview), "preview");
      assert(!/index\.lock/i.test(status), status.slice(0, 180));
      assert(entries.some((entry) => entry.name === "README.md"), "files");
    }
  });

  add("Git", "A missing diff tool returns error detail", async () => {
    const error = await expectCode(() => ctx.app.externalDiff(ctx.sha, "note.txt"), "NO_DIFF_TOOL");
    assert(error.message.length > 0, "message");
    const missing = path.join(ctx.home, "missing-diff.exe");
    ctx.app.settings.update({ externalDiffToolPath: missing, externalDiffToolArguments: "\"{left}\" \"{right}\"" });
    try {
      const notFound = await expectCode(() => ctx.app.externalDiff("HEAD", "README.md"), "NO_DIFF_TOOL");
      assert(notFound.detail.includes(missing), notFound.detail);
      ctx.app.settings.update({ externalDiffToolPath: process.execPath, externalDiffToolArguments: "-e \"process.exit(3)\"" });
      const failed = await expectCode(() => ctx.app.externalDiff("HEAD", "README.md"), "DIFF_TOOL");
      assert(failed.message.includes("code 3"), failed.message);
      assert(failed.detail.includes(process.execPath) && failed.detail.includes("Left:"), failed.detail);
    } finally {
      ctx.app.settings.update({ externalDiffToolPath: "", externalDiffToolArguments: "\"{left}\" \"{right}\"" });
    }
  });

  add("Git", "An explicit external diff opens the viewer", async () => {
    const log = path.join(ctx.home, "stay-diff.log");
    const script = path.join(ctx.home, "stay-diff.mjs");
    fs.writeFileSync(script, [
      "import fs from 'node:fs';",
      "fs.appendFileSync(process.argv[2], process.pid + '\\n');",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"));
    ctx.app.settings.update({
      externalDiffToolPath: process.execPath,
      externalDiffToolArguments: `"${script}" "${log}" "{left}" "{right}"`,
    });
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("mygit-diff-")));
    const rights = () => fs.readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("mygit-diff-") && !before.has(name))
      .map((name) => {
        const file = fs.readdirSync(path.join(os.tmpdir(), name)).find((entry) => entry.startsWith("right"));
        return file ? fs.readFileSync(path.join(os.tmpdir(), name, file), "utf8") : "";
      })
      .sort();
    let pids: string[] = [];
    try {
      await ctx.app.externalDiff(ctx.sha, "note.txt", false);
      assert(!fs.existsSync(log), "refresh started a tool");
      await ctx.app.externalDiff(ctx.sha, "note.txt", true);
      await ctx.app.externalDiff(ctx.sha, "README.md", true);
      pids = fs.readFileSync(log, "utf8").trim().split(/\r?\n/).filter(Boolean);
      assert(pids.length === 2, pids.join(","));
      assert(rights().join("|") === "hello\n|one\n", rights().join("|"));
      await ctx.app.externalDiff(ctx.sha, "note.txt", false);
      const again = fs.readFileSync(log, "utf8").trim().split(/\r?\n/).filter(Boolean);
      assert(again.length === 2, again.join(","));
      assert(rights().join("|") === "one\n|one\n", rights().join("|"));
    } finally {
      for (const pid of pids) {
        try { process.kill(Number(pid)); } catch { /* already gone */ }
      }
      ctx.app.settings.update({ externalDiffToolPath: "", externalDiffToolArguments: "\"{left}\" \"{right}\"" });
    }
  });

  add("Git", "A conflict opens the configured merge tool", async () => {
    const repo = path.join(ctx.home, "merge-repo");
    const log = path.join(ctx.home, "merge-tool.log");
    const script = path.join(ctx.home, "merge-tool.mjs");
    fs.mkdirSync(repo);
    await git(repo, ["init", "-b", "main"]);
    await identity(repo);
    fs.writeFileSync(path.join(repo, "note.txt"), "base\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Base"]);
    await git(repo, ["checkout", "-b", "side"]);
    fs.writeFileSync(path.join(repo, "note.txt"), "theirs\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Theirs"]);
    await git(repo, ["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "note.txt"), "ours\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Ours"]);
    const conflict = await runGit(repo, ["merge", "side"]);
    assert(conflict.code !== 0, conflict.stderr || conflict.stdout);
    fs.writeFileSync(script, [
      "import fs from 'node:fs';",
      "const [log, base, local, remote, merged] = process.argv.slice(2);",
      "const read = (file) => fs.readFileSync(file, 'utf8');",
      "fs.writeFileSync(log, [read(base), read(local), read(remote), merged].join('---'));",
      "fs.writeFileSync(merged, 'resolved\\n');",
      "",
    ].join("\n"));
    const previous = ctx.app.info()?.path ?? ctx.repo;
    try {
      await expectCode(() => ctx.app.externalMerge("note.txt"), "BUILTIN_MERGE");
      ctx.app.settings.update({ externalMergeToolPath: "" });
      await expectCode(() => ctx.app.externalMerge("note.txt"), "NO_MERGE_TOOL");
      ctx.app.settings.update({
        externalMergeToolPath: process.execPath,
        externalMergeToolArguments: `"${script}" "${log}" "{base}" "{local}" "{remote}" "{merged}"`,
      });
      await ctx.app.open(repo);
      await ctx.app.externalMerge("note.txt");
      const written = fs.readFileSync(log, "utf8");
      assert(written.startsWith("base\n---ours\n---theirs\n---"), written);
      assert(written.includes(path.join(repo, "note.txt")), written);
      assert(readText(path.join(repo, "note.txt")) === "resolved\n", "merged file");
    } finally {
      ctx.app.settings.update({
        externalMergeToolPath: BUILTIN_MERGE_TOOL,
        externalMergeToolArguments: "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
      });
      await ctx.app.open(previous);
    }
  });

  add("Git", "Push, fetch, and pull work against a local remote", async () => {
    const origin = path.join(ctx.home, "origin.git");
    const seed = path.join(ctx.home, "seed");
    fs.mkdirSync(seed);
    await git(seed, ["init", "-b", "main"]);
    await identity(seed);
    fs.writeFileSync(path.join(seed, "seed.txt"), "seed\n");
    await git(seed, ["add", "seed.txt"]);
    await git(seed, ["commit", "-m", "Seed"]);
    await git(undefined, ["init", "--bare", "-b", "main", origin]);
    await git(seed, ["remote", "add", "origin", pathToFileURL(origin).href]);
    await git(seed, ["push", "-u", "origin", "HEAD"]);
    const url = pathToFileURL(origin).href;
    const leftDir = path.join(ctx.home, "clone-a");
    const rightDir = path.join(ctx.home, "clone-b");
    const left = new GitApp(ctx.settingsDir);
    const right = new GitApp(path.join(ctx.home, "settings-right"));
    try {
      await left.clone(url, leftDir);
      await identity(leftDir);
      fs.writeFileSync(path.join(leftDir, "seed.txt"), "updated\n");
      await left.add(["seed.txt"]);
      await left.commit("Update seed");
      await left.push();
      await right.clone(url, rightDir);
      assert(readText(path.join(rightDir, "seed.txt")) === "updated\n", `pushed content ${JSON.stringify(readText(path.join(rightDir, "seed.txt")))}`);
      fs.writeFileSync(path.join(leftDir, "seed.txt"), "again\n");
      await left.add(["seed.txt"]);
      await left.commit("Again");
      await left.push();
      await right.fetch();
      await right.pull();
      assert(readText(path.join(rightDir, "seed.txt")) === "again\n", `pulled ${JSON.stringify(readText(path.join(rightDir, "seed.txt")))}`);
    } finally {
      left.close();
      right.close();
    }
  });

  add("Git", "A local remote can be browsed through the bare cache", async () => {
    const origin = path.join(ctx.home, "origin.git");
    const browser = new GitApp(path.join(ctx.home, "settings-browse"));
    const info = await browser.browse(pathToFileURL(origin).href);
    assert(info.remoteView, "remote view");
    assert(browser.tree().local.some((item) => item.name === "main"), "bare branch");
    const history = await browser.log(20);
    assert(history.commits.length >= 1, "browse log");
    browser.close();
  });

  add("HTTP", "Health, drives, folders, and error detail respond", async () => {
    const server = await serve(ctx);
    try {
      const health = await api(server.base, "/api/health");
      assert(health.ok === true, "health");
      const boot = await api(server.base, "/api/bootstrap");
      assert(boot.git === true, "git missing");
      const drives = await api(server.base, "/api/drives");
      assert(drives.drives.length > 0, "drives");
      const listed = await api(server.base, `/api/fs?path=${encodeURIComponent(ctx.home)}`);
      assert(listed.entries.some((entry: { name: string }) => entry.name === "repo"), "fs");
      const missing = await api(server.base, `/api/fs?path=${encodeURIComponent(path.join(ctx.home, "missing-folder"))}`, { ok: false });
      assert(missing.code === "MISSING" && String(missing.detail).includes("Folder not found"), JSON.stringify(missing));
    } finally {
      await server.close();
    }
  });

  add("HTTP", "Open, files, log, diff, and summary can be queried", async () => {
    const server = await serve(ctx);
    try {
      const opened = await api(server.base, "/api/open", { method: "POST", body: { path: ctx.repo } });
      assert(opened.repo.branch === "main", opened.repo.branch);
      const tree = await api(server.base, "/api/tree");
      assert(tree.writable === true, "writable");
      const files = await api(server.base, "/api/files?path=");
      assert(files.entries.some((entry: { name: string }) => entry.name === "README.md"), "files");
      const history = await api(server.base, "/api/log?max=20");
      assert(history.commits.length >= 2, "log");
      const oldest = history.commits.at(-1);
      const detail = await api(server.base, `/api/commit?sha=${oldest.sha}`);
      assert(detail.sha === oldest.sha, "detail");
      const diff = await api(server.base, `/api/diff?sha=${encodeURIComponent(ctx.sha)}&file=note.txt`);
      assert(String(diff.text).includes("one"), diff.text);
      const summary = await api(server.base, "/api/summary");
      assert(summary.commitCount >= 2, "summary");
      const releases = await api(server.base, "/api/releases");
      assert(Array.isArray(releases.releases), "releases");
      const tick = await api(server.base, "/api/tick");
      assert(typeof tick.generation === "number", "tick");
      const cancelled = await api(server.base, "/api/cancel", { method: "POST", body: {} });
      assert(cancelled.ok === true, "cancel");
    } finally {
      await server.close();
    }
  });

  add("Terminal", "An installed shell can be selected and runs a command", async () => {
    const shells = installedShells();
    assert(shells.length > 0, "no shells");
    if (process.platform === "win32") {
      assert(shells.some((shell) => /cmd\.exe$/i.test(shell.command)), shells.map((shell) => shell.label).join(", "));
      assert(shells.some((shell) => /powershell\.exe$/i.test(shell.command)), "powershell");
    }
    const dir = path.join(ctx.home, "settings-shell");
    const store = new SettingsStore(dir);
    store.update({ terminalShell: shells[0].id });
    assert(new SettingsStore(dir).get().terminalShell === shells[0].id, "shell saved");
    store.update({ terminalShell: path.join(ctx.home, "missing-shell.exe") });
    assert(new SettingsStore(dir).get().terminalShell === "", "missing shell dropped");

    const server = await serve(ctx);
    let socket: WebSocket | null = null;
    try {
      const listed = await api(server.base, "/api/shells");
      assert(listed.shells.length > 0 && listed.selected, JSON.stringify(listed));
      const rejected = await api(server.base, "/api/settings", { method: "PUT", body: { terminalShell: path.join(ctx.home, "missing-shell.exe") } });
      assert(rejected.terminalShell !== path.join(ctx.home, "missing-shell.exe"), "rejected shell");
      const chosen = listed.shells.find((shell: { command: string }) => /cmd\.exe$/i.test(shell.command)) ?? listed.shells[0];
      const saved = await api(server.base, "/api/settings", { method: "PUT", body: { terminalShell: chosen.id } });
      assert(saved.terminalShell === chosen.id, saved.terminalShell);
      socket = new WebSocket(server.base.replace(/^http/, "ws") + "/api/terminal");
      let output = "";
      socket.on("message", (data) => {
        output += Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      });
      await new Promise<void>((resolve, reject) => {
        socket?.once("open", () => resolve());
        socket?.once("error", reject);
      });
      socket.send(JSON.stringify({ type: "input", data: "echo MYGIT_TERMINAL_OK\r" }));
      const started = Date.now();
      while (!output.includes("MYGIT_TERMINAL_OK")) {
        if (Date.now() - started > 10000) throw new Error(`terminal output missing marker: ${output.slice(-500)}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      socket?.close();
      await server.close();
    }
  });

  add("HTTP", "Settings, credentials, and recent URLs can be saved and removed", async () => {
    const server = await serve(ctx);
    try {
      const saved = await api(server.base, "/api/settings", { method: "PUT", body: { language: "en", theme: "dark-midnight" } });
      assert(saved.language === "en" && saved.theme === "dark-midnight", JSON.stringify(saved));
      const kept = await api(server.base, "/api/settings", { method: "PUT", body: { theme: "nope", language: "ko" } });
      assert(kept.theme === "dark-midnight" && kept.language === "ko", JSON.stringify(kept));
      const creds = await api(server.base, "/api/credentials", { method: "POST", body: { username: "ada", password: "s3cret", reuse: true } });
      assert(creds.hasCredentials === true && creds.gitUsername === "ada", JSON.stringify(creds));
      assert(!JSON.stringify(creds).includes("s3cret"), "leaked");
      await api(server.base, "/api/open", { method: "POST", body: { path: ctx.repo } });
      const view = await api(server.base, "/api/settings");
      assert(view.recentRepositoryPaths.some((item: string) => item === ctx.repo), "recent");
    } finally {
      await server.close();
    }
  });

  add("HTTP", "Add, commit, branch, ignore, and export work", async () => {
    const server = await serve(ctx);
    try {
      await api(server.base, "/api/open", { method: "POST", body: { path: ctx.repo } });
      fs.writeFileSync(path.join(ctx.repo, "api.txt"), "api\n");
      const preview = await api(server.base, "/api/add/preview", { method: "POST", body: { paths: ["api.txt"] } });
      assert(preview.paths.some((item: string) => item.includes("api.txt")), JSON.stringify(preview));
      await api(server.base, "/api/add", { method: "POST", body: { paths: ["api.txt"] } });
      await api(server.base, "/api/unstage", { method: "POST", body: { paths: ["api.txt"] } });
      await api(server.base, "/api/add", { method: "POST", body: { paths: ["api.txt"] } });
      const committed = await api(server.base, "/api/commit", { method: "POST", body: { message: "API file" } });
      assert(String(committed.message).length > 0, "commit");
      const empty = await api(server.base, "/api/commit", { method: "POST", body: { message: " " }, ok: false });
      assert(empty.code === "MESSAGE", JSON.stringify(empty));
      await api(server.base, "/api/new-folder", { method: "POST", body: { path: "box" } });
      await api(server.base, "/api/new-file", { method: "POST", body: { path: "box/a.txt" } });
      await api(server.base, "/api/delete", { method: "POST", body: { path: "box" } });
      fs.writeFileSync(path.join(ctx.repo, "skip.tmp"), "x");
      await api(server.base, "/api/gitignore", { method: "POST", body: { path: "skip.tmp", remove: false } });
      const files = await api(server.base, "/api/files?path=");
      assert(files.entries.find((entry: { name: string }) => entry.name === "skip.tmp")?.badge === "X", "ignore");
      await git(ctx.repo, ["branch", "api-branch"]);
      const checked = await api(server.base, "/api/checkout", { method: "POST", body: { name: "api-branch" } });
      assert(checked.repo.branch === "api-branch", checked.repo.branch);
      await api(server.base, "/api/checkout", { method: "POST", body: { name: "main" } });
      const status = await api(server.base, "/api/git-status");
      assert(String(status.text).length > 0, "status");
      const history = await api(server.base, "/api/log?max=5");
      const exported = await api(server.base, "/api/export-commit", { method: "POST", body: { sha: history.commits[0].sha, destination: path.join(ctx.home, "http-export") } });
      assert(exported.count >= 1, "export");
      const tool = await api(server.base, "/api/external-diff", { method: "POST", body: { sha: history.commits[0].sha, file: "README.md" }, ok: false });
      assert(tool.code === "NO_DIFF_TOOL" && String(tool.detail || tool.error).length > 0, JSON.stringify(tool));
    } finally {
      await server.close();
    }
  });

  add("HTTP", "Stash, discard, clone, fetch, pull, push, and browse work", async () => {
    const server = await serve(ctx);
    try {
      await api(server.base, "/api/open", { method: "POST", body: { path: ctx.repo } });
      fs.writeFileSync(path.join(ctx.repo, "note.txt"), "http-stash\n");
      await api(server.base, "/api/stash", { method: "POST", body: {} });
      assert(readText(path.join(ctx.repo, "note.txt")) === "one\n", "stash");
      await api(server.base, "/api/stash/pop", { method: "POST", body: {} });
      assert(readText(path.join(ctx.repo, "note.txt")) === "http-stash\n", "pop");
      fs.writeFileSync(path.join(ctx.repo, "note.txt"), "one\n");
      fs.writeFileSync(path.join(ctx.repo, "README.md"), "dirty\n");
      await api(server.base, "/api/discard", { method: "POST", body: { paths: ["README.md"] } });
      assert(readText(path.join(ctx.repo, "README.md")) === "hello\n", "discard");
      const url = pathToFileURL(path.join(ctx.home, "origin.git")).href;
      const destination = path.join(ctx.home, "http-clone");
      const cloned = await api(server.base, "/api/clone", { method: "POST", body: { url, destination } });
      assert(cloned.repo.path === destination, cloned.repo.path);
      const remembered = await api(server.base, "/api/settings");
      assert(remembered.recentCloneUrls.includes(url), "url remembered");
      const removed = await api(server.base, "/api/recent-urls/delete", { method: "POST", body: { url } });
      assert(!removed.recentCloneUrls.includes(url), "url removed");
      await identity(destination);
      fs.writeFileSync(path.join(destination, "seed.txt"), "from-http\n");
      await api(server.base, "/api/add", { method: "POST", body: { paths: ["seed.txt"] } });
      await api(server.base, "/api/commit", { method: "POST", body: { message: "HTTP push" } });
      await api(server.base, "/api/push", { method: "POST", body: {} });
      const other = path.join(ctx.home, "http-clone-2");
      const second = await serve(ctx);
      try {
        await api(second.base, "/api/clone", { method: "POST", body: { url, destination: other } });
        assert(readText(path.join(other, "seed.txt")) === "from-http\n", `cloned push ${JSON.stringify(readText(path.join(other, "seed.txt")))}`);
        fs.writeFileSync(path.join(destination, "seed.txt"), "from-http-2\n");
        await api(server.base, "/api/add", { method: "POST", body: { paths: ["seed.txt"] } });
        await api(server.base, "/api/commit", { method: "POST", body: { message: "HTTP push 2" } });
        await api(server.base, "/api/push", { method: "POST", body: {} });
        await api(second.base, "/api/fetch", { method: "POST", body: {} });
        await api(second.base, "/api/pull", { method: "POST", body: {} });
        assert(readText(path.join(other, "seed.txt")) === "from-http-2\n", `pulled ${JSON.stringify(readText(path.join(other, "seed.txt")))}`);
        const browsed = await api(second.base, "/api/browse", { method: "POST", body: { url } });
        assert(browsed.repo.remoteView === true, "browse");
      } finally {
        await second.close();
      }
    } finally {
      await server.close();
    }
  });

  add("Theme", "Every theme shows background, panel, and accent colors", async () => {
    for (const item of THEMES) {
      assert(item.swatch.length === 3 && item.swatch.every((color) => /^#[0-9a-fA-F]{6}$/.test(color)), item.id);
      assert(Boolean(item.vars["--bg"] && item.vars["--panel"] && item.vars["--accent"]), item.id);
      assert(item.swatch[0] === item.vars["--bg"] && item.swatch[2] === item.vars["--accent"], item.id);
    }
  });

  add("Theme", "An unknown theme id falls back to light-classic", async () => {
    assert(themeById("missing").id === "light-classic", themeById("missing").id);
    assert(themeById(undefined).mode === "light", "default mode");
    assert(themeById("dark-ink").nameEn === "Ink", themeById("dark-ink").nameEn);
  });

  add("Theme", "The desktop window background matches every theme", async () => {
    const { themeBackground } = createRequire(import.meta.url)("../electron/theme-bg.cjs");
    for (const item of THEMES) assert(themeBackground(item.id) === item.vars["--bg"], item.id);
    assert(themeBackground("missing") === themeById("light-classic").vars["--bg"], "fallback");
  });

  add("Theme", "Theme names are unique in Korean and English", async () => {
    for (const mode of ["light", "dark"] as const) {
      const items = THEMES.filter((item) => item.mode === mode);
      assert(new Set(items.map((item) => item.nameKo)).size === items.length, `${mode} ko`);
      assert(new Set(items.map((item) => item.nameEn)).size === items.length, `${mode} en`);
    }
  });

  add("Language", "Korean and English have the same translation keys", async () => {
    assert(TRANSLATION_KEYS.length >= 100, `keys ${TRANSLATION_KEYS.length}`);
    for (const key of TRANSLATION_KEYS) {
      assert(translate("ko", key) !== key, `ko ${key}`);
      assert(translate("en", key) !== key, `en ${key}`);
    }
  });

  add("Language", "An unknown translation key is returned unchanged", async () => {
    assert(translate("ko", "not-a-real-key") === "not-a-real-key", "ko fallback");
    assert(translate("en", "not-a-real-key") === "not-a-real-key", "en fallback");
  });

  add("Language", "Git command names stay English in Korean", async () => {
    for (const key of ["gitAdd", "gitCommit", "gitFetch", "gitPull", "gitPush", "gitStash", "gitStashPop", "gitStatus"]) {
      assert(translate("ko", key) === translate("en", key), key);
    }
    assert(translate("ko", "close") === "닫기" && translate("en", "close") === "Close", "close");
  });

  add("Status", "Deleted, staged, unpushed, and clean states have distinct colors", async () => {
    assert(colorOf(statusFromPorcelain("D ")) === "#7c3aed", "staged delete");
    assert(colorOf(statusFromPorcelain(" D")) === "#dc2626", "worktree delete");
    assert(colorOf({ staged: null, workTree: null, unpushed: true }) === "#dc2626", "unpushed");
    assert(colorOf(EMPTY_STATUS) === "#64748b" && badgeOf(EMPTY_STATUS) === "", "clean");
    assert(!hasChanges(EMPTY_STATUS), "clean has no changes");
  });

  add("Status", "Merged statuses keep both a worktree change and the unpushed flag", async () => {
    const merged = mergeStatus(statusFromPorcelain(" M"), { staged: null, workTree: null, unpushed: true });
    assert(merged.workTree === "Modified" && merged.unpushed, JSON.stringify(merged));
    assert(badgeOf(merged) === "±", badgeOf(merged));
  });

  add("Commit graph", "An empty history has no lanes", async () => {
    assert(buildGraph([]).length === 0, "empty graph");
    assert(buildFlat([]).length === 0, "empty flat");
  });

  add("Commit graph", "A second parent is recorded as a fork", async () => {
    const rows = buildGraph([
      { sha: "m", parents: ["a", "b"] },
      { sha: "b", parents: [] },
      { sha: "a", parents: [] },
    ]);
    assert(rows[0].forks.length + rows[0].merges.length > 0, JSON.stringify(rows[0]));
  });

  add("Errors", "Plain text is left unchanged and HTTP credentials are redacted", async () => {
    assert(redact("nothing secret here") === "nothing secret here", "plain");
    const hidden = redact("http://ada:pw@example.com/repo");
    assert(!hidden.includes("pw") && hidden.includes("https://***@"), hidden);
  });

  add("Errors", "ApiError keeps its code, status, and detail", async () => {
    const error = new ApiError("Not a Git repository.", "NOT_A_REPO", 400, "fatal: not a repo");
    assert(error.code === "NOT_A_REPO" && error.status === 400 && error.detail.includes("fatal"), error.detail);
  });

  add("Settings", "Updating the language keeps the current theme", async () => {
    const dir = path.join(ctx.home, "settings-partial");
    const store = new SettingsStore(dir);
    store.update({ theme: "dark-grove" });
    store.update({ language: "en" });
    const saved = new SettingsStore(dir).get();
    assert(saved.language === "en" && saved.theme === "dark-grove", JSON.stringify(saved));
  });

  add("Settings", "A missing terminal shell path is cleared and an empty one is kept", async () => {
    const dir = path.join(ctx.home, "settings-shell-unit");
    const store = new SettingsStore(dir);
    store.update({ terminalShell: "" });
    assert(new SettingsStore(dir).get().terminalShell === "", "empty");
    store.update({ terminalShell: path.join(ctx.home, "missing-shell.exe") });
    assert(new SettingsStore(dir).get().terminalShell === "", "missing");
  });

  add("Settings", "Restoring defaults is saved and applied on the next load", async () => {
    const dir = path.join(ctx.home, "settings-reset");
    const store = new SettingsStore(dir);
    store.update({
      language: "en",
      theme: "dark-ink",
      externalDiffToolPath: "C:\\Tools\\diff.exe",
      externalDiffToolArguments: "--wait",
      externalMergeToolPath: "C:\\Tools\\merge.exe",
      externalMergeToolArguments: "--merge",
      terminalShell: "",
    });
    store.rememberRepository(ctx.repo, { mode: "local", path: ctx.repo });
    store.setCredentials("tester", "token-value", true);
    store.resetPreferences();
    const saved = new SettingsStore(dir);
    assert(saved.get().language === "ko", "language");
    assert(saved.get().theme === "light-classic", saved.get().theme);
    assert(saved.get().externalDiffToolPath === "", "tool");
    assert(saved.get().externalDiffToolArguments.includes("{left}"), "args");
    assert(saved.get().externalMergeToolPath === BUILTIN_MERGE_TOOL, saved.get().externalMergeToolPath);
    assert(saved.get().externalMergeToolArguments.includes("{merged}"), "merge args");
    assert(saved.get().terminalShell === "", "shell");
    assert(saved.get().recentRepositoryPaths.some((item) => item === ctx.repo), "recent kept");
    assert(saved.get().lastSession?.path === ctx.repo, "session kept");
    assert(saved.getToken() === "token-value", "token kept");
  });

  add("Settings", "Default commit categories and the diff tool path round-trip", async () => {
    const dir = path.join(ctx.home, "settings-tools");
    const store = new SettingsStore(dir);
    assert(store.get().commitCategories.length === DEFAULT_COMMIT_CATEGORIES.length, "defaults");
    store.update({
      externalDiffToolPath: "C:\\Tools\\diff.exe",
      externalDiffToolArguments: "\"{left}\" \"{right}\"",
      externalMergeToolPath: "C:\\Tools\\merge.exe",
      externalMergeToolArguments: "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
    });
    const saved = new SettingsStore(dir).get();
    assert(saved.externalDiffToolPath.endsWith("diff.exe") && saved.externalDiffToolArguments.includes("{left}"), saved.externalDiffToolPath);
    assert(saved.externalMergeToolPath.endsWith("merge.exe") && saved.externalMergeToolArguments.includes("{merged}"), saved.externalMergeToolPath);
  });

  add("Shells", "Installed shells expose a command and arguments", async () => {
    const shells = installedShells();
    assert(shells.length > 0, "none");
    for (const shell of shells) {
      assert(shell.id.length > 0 && shell.command.length > 0 && Array.isArray(shell.args), shell.label);
    }
  });

  add("Shells", "An unknown shell id resolves to the default shell", async () => {
    const shells = installedShells();
    const chosen = resolveShell(shells, path.join(ctx.home, "missing-shell.exe"));
    assert(chosen !== null && shells.some((shell) => shell.id === chosen.id), "default");
    if (process.platform === "win32") assert(sameShell("C:\\Windows\\System32\\cmd.exe", "c:\\windows\\system32\\cmd.exe"), "case");
  });

  add("Diff", "The built-in diff aligns an inserted line", async () => {
    const document = documentFromLines(["a", "b"], ["a", "c", "b"]);
    assert(document.added === 1 && document.removed === 0 && document.modified === 0, JSON.stringify(document));
    assert(document.rows.some((row) => row.kind === "added" && row.right === "c" && row.left === null), "inserted row");
    const sides = await ctx.app.diffSides(ctx.sha, "README.md");
    assert(sides.right.startsWith("hello"), sides.right);
    assert(sides.rightVersion === ctx.sha.slice(0, 7), sides.rightVersion);
    assert(sides.leftVersion.length === 0 || sides.leftVersion.length === 7, sides.leftVersion);
  });

  add("Diff", "The built-in merge keeps one-sided edits and a real conflict", async () => {
    const clean = mergeTexts("a\nb\nc\n", "a\nB\nc\n", "a\nb\nc\n");
    assert(conflictCount(clean) === 0, `conflicts ${conflictCount(clean)}`);
    assert(buildResult(clean, []) === "a\nB\nc\n", buildResult(clean, []));
    const conflict = mergeTexts("a\n", "mine\n", "theirs\n");
    assert(conflictCount(conflict) === 1, "expected one conflict");
    assert(buildResult(conflict, ["unresolved"]).includes("<<<<<<< LOCAL"), "markers");
    assert(buildResult(conflict, ["local"]) === "mine\n", buildResult(conflict, ["local"]));
    assert(buildResult(conflict, ["remote"]) === "theirs\n", buildResult(conflict, ["remote"]));
  });

  add("Git", "The built-in Diff & Merge resolves a conflict and stages the file", async () => {
    const repo = path.join(ctx.home, "builtin-merge-repo");
    fs.mkdirSync(repo);
    await git(repo, ["init", "-b", "main"]);
    await identity(repo);
    fs.writeFileSync(path.join(repo, "note.txt"), "base\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Base"]);
    await git(repo, ["checkout", "-b", "side"]);
    fs.writeFileSync(path.join(repo, "note.txt"), "theirs\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Theirs"]);
    await git(repo, ["checkout", "main"]);
    fs.writeFileSync(path.join(repo, "note.txt"), "ours\n");
    await git(repo, ["add", "note.txt"]);
    await git(repo, ["commit", "-m", "Ours"]);
    const conflict = await runGit(repo, ["merge", "side"]);
    assert(conflict.code !== 0, conflict.stderr || conflict.stdout);
    const previous = ctx.app.info()?.path ?? ctx.repo;
    try {
      await ctx.app.open(repo);
      const sources = await ctx.app.conflictSources("note.txt");
      assert(sources.base === "base\n" && sources.local === "ours\n" && sources.remote === "theirs\n", JSON.stringify(sources));
      const document = mergeTexts(sources.base, sources.local, sources.remote);
      assert(conflictCount(document) === 1, `conflicts ${conflictCount(document)}`);
      await ctx.app.saveMerge("note.txt", buildResult(document, ["local"]));
      assert(readText(path.join(repo, "note.txt")) === "ours\n", readText(path.join(repo, "note.txt")));
      const unresolved = await runGit(repo, ["diff", "--name-only", "--diff-filter=U"]);
      assert(!unresolved.stdout.trim(), unresolved.stdout);
      await expectCode(() => ctx.app.conflictSources("note.txt"), "NOT_CONFLICTED");
    } finally {
      await ctx.app.open(previous);
    }
  });

  add("Settings", "The built-in Diff & Merge is the default merge tool", async () => {
    const dir = path.join(ctx.home, "settings-merge-default");
    const store = new SettingsStore(dir);
    assert(store.get().externalMergeToolPath === BUILTIN_MERGE_TOOL, store.get().externalMergeToolPath);
    assert(store.publicView().externalMergeToolPath === BUILTIN_MERGE_TOOL, "public view");
    store.update({ externalMergeToolPath: "" });
    assert(new SettingsStore(dir).get().externalMergeToolPath === BUILTIN_MERGE_TOOL, "an empty path falls back");
    store.update({ externalMergeToolPath: "MyGit:Builtin" });
    assert(new SettingsStore(dir).get().externalMergeToolPath === BUILTIN_MERGE_TOOL, "casing");
    const external = path.join("C:\\", "Tools", "merge.exe");
    store.update({ externalMergeToolPath: external });
    assert(new SettingsStore(dir).get().externalMergeToolPath === external, "an external tool is kept");
    assert(usesBuiltinMerge("") && usesBuiltinMerge(" mygit:builtin ") && !usesBuiltinMerge(external), "usesBuiltinMerge");
    assert(isBuiltinMergeTool(BUILTIN_MERGE_TOOL) && !isBuiltinMergeTool("") && !isBuiltinMergeTool(external), "isBuiltinMergeTool");
  });

  add("Diff", "A tool window address names the diff or the merge", async () => {
    const diff = parseToolHash("#tool?kind=diff&sha=abc&file=a%20b.txt");
    assert(diff?.kind === "diff" && diff.sha === "abc" && diff.file === "a b.txt", JSON.stringify(diff));
    const merge = parseToolHash(toolHash({ kind: "merge", file: "dir/b.txt" }));
    assert(merge?.kind === "merge" && merge.file === "dir/b.txt", JSON.stringify(merge));
    assert(parseToolHash("#tool?kind=diff") === null, "missing file");
    assert(parseToolHash("") === null, "empty");
  });

  add("Build", "The bundled server entry points are CommonJS and the run scripts point at them", async () => {
    const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const read = (name: string) => fs.readFileSync(path.join(projectDir, name), "utf8");
    const builder = read(path.join("scripts", "build-server.mjs"));
    const outfiles = [...builder.matchAll(/outfile:\s*"([^"]+)"/g)].map((match) => match[1]);
    assert(outfiles.length === 2, outfiles.join(", "));
    for (const outfile of outfiles) {
      assert(outfile.endsWith(".cjs"), `${outfile} must be CommonJS: express cannot be bundled into ESM`);
    }
    assert(!/format:\s*"esm"/.test(builder), "an esm bundle breaks on a dynamic require of node:path");
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const web = read(path.join("scripts", "package-web.mjs"));
    const cli = outfiles.find((outfile) => outfile.includes("cli"));
    assert(cli, outfiles.join(", "));
    assert(pkg.scripts["start:web"].includes(cli), pkg.scripts["start:web"]);
    assert(web.includes(`node ${cli}`), "the web package start script");
    const electron = read(path.join("electron", "main.cjs"));
    const server = outfiles.find((outfile) => outfile !== cli);
    assert(server && electron.includes(path.basename(server)), server ?? "");
  });

  add("Diff", "Installed diff tools can be selected and keep left and right arguments", async () => {
    const found = collectDiffTools({
      exists: (command) => command === "/tools/meld" || command.endsWith("WinMergeU.exe"),
      lookup: (name) => name === "meld" ? ["/tools/meld"] : [],
    });
    const meld = found.find((tool) => tool.label === "Meld");
    assert(meld?.args.includes("{left}") && meld.args.includes("{right}"), JSON.stringify(found));
    assert(meld?.mergeArgs.includes("{base}") && meld.mergeArgs.includes("{merged}"), meld?.mergeArgs ?? "");
    const installed = installedDiffTools();
    for (const tool of installed) {
      assert(fs.existsSync(tool.id), tool.id);
      assert(tool.label.length > 0 && tool.args.includes("{left}") && tool.args.includes("{right}"), tool.label);
      assert(tool.mergeArgs.includes("{local}") && tool.mergeArgs.includes("{merged}"), tool.label);
    }
  });

  add("Git", "Status text names the current branch", async () => {
    const text = await ctx.app.gitStatusText();
    assert(text.includes("main"), text);
  });

  add("Git", "Tick and info describe the opened repository", async () => {
    const tick = ctx.app.tick();
    assert(tick.repo?.path === ctx.repo && tick.repo.branch === "main", JSON.stringify(tick.repo));
    assert(ctx.app.info()?.remoteView === false && ctx.app.info()?.bare === false, "local");
    assert(tick.work !== null && tick.work.upstream === null, JSON.stringify(tick.work));
  });

  add("Git", "Tick reports an untracked file in the worktree counts", async () => {
    const file = path.join(ctx.repo, "status-bar.txt");
    fs.writeFileSync(file, "status\n");
    try {
      await ctx.app.open(ctx.repo);
      await ctx.app.files("");
      const work = ctx.app.tick().work;
      assert(work !== null && work.untracked >= 1, JSON.stringify(work));
      assert(work.ahead === 0 && work.behind === 0, "tracking");
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  add("Git", "Cancel leaves the opened repository in place", async () => {
    ctx.app.cancel();
    assert(ctx.app.info()?.path === ctx.repo, "still open");
    assert(ctx.app.tick().progress === null, "progress cleared");
  });

  add("Git", "Add preview lists a new file before it is staged", async () => {
    const file = path.join(ctx.repo, "preview-only.txt");
    fs.writeFileSync(file, "preview\n");
    try {
      const paths = await ctx.app.addPreview(["preview-only.txt"]);
      assert(paths.some((item) => item.replaceAll("\\", "/").endsWith("preview-only.txt")), paths.join(","));
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  add("Git", "The full history is not marked as a flat path filter", async () => {
    const history = await ctx.app.log(20, "");
    assert(history.flat === false && history.commits.length >= 1, `flat ${history.flat} count ${history.commits.length}`);
  });

  add("HTTP", "Bootstrap reports Git and the saved language", async () => {
    const server = await serve(ctx);
    try {
      await api(server.base, "/api/open", { method: "POST", body: { path: ctx.repo } });
      await api(server.base, "/api/settings", { method: "PUT", body: { language: "en", theme: "light-classic" } });
      const boot = await api(server.base, "/api/bootstrap");
      assert(boot.git === true && boot.settings.language === "en", JSON.stringify(boot.settings));
      const status = await api(server.base, "/api/git-status");
      assert(String(status.text).includes("main"), status.text);
    } finally {
      await server.close();
    }
  });

  add("HTTP", "A diff tool path and its arguments are saved", async () => {
    const server = await serve(ctx);
    try {
      const saved = await api(server.base, "/api/settings", {
        method: "PUT",
        body: {
          externalDiffToolPath: path.join(ctx.home, "missing-diff.exe"),
          externalDiffToolArguments: "\"{left}\" \"{right}\"",
          externalMergeToolPath: path.join(ctx.home, "missing-merge.exe"),
          externalMergeToolArguments: "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
        },
      });
      assert(String(saved.externalDiffToolPath).includes("missing-diff.exe"), saved.externalDiffToolPath);
      assert(String(saved.externalMergeToolPath).includes("missing-merge.exe"), saved.externalMergeToolPath);
      const view = await api(server.base, "/api/settings");
      assert(String(view.externalDiffToolArguments).includes("{left}") && String(view.externalDiffToolArguments).includes("{right}"), view.externalDiffToolArguments);
      assert(String(view.externalMergeToolArguments).includes("{base}") && String(view.externalMergeToolArguments).includes("{merged}"), view.externalMergeToolArguments);
    } finally {
      await server.close();
    }
  });

  return list;
}

function readText(file: string): string {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

async function waitRefresh(app: GitApp): Promise<void> {
  const seen = app.tick().generation;
  const start = Date.now();
  while (Date.now() - start < 2500) {
    if (app.tick().generation !== seen) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("파일 변경 감시가 갱신되지 않았습니다.");
}

async function identity(repo: string): Promise<void> {
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "MyGit Test"]);
}

async function git(cwd: string | undefined, args: string[]): Promise<void> {
  const result = await runGit(cwd, args);
  if (result.code !== 0) throw new Error(`${args.join(" ")}\n${result.stderr || result.stdout}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<ApiError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ApiError && error.code === code) return error;
    throw error;
  }
  throw new Error(`expected ${code}`);
}

async function serve(ctx: Ctx): Promise<{ base: string; close: () => Promise<void> }> {
  process.env.MYGIT_SETTINGS_DIR = path.join(ctx.home, "http-settings");
  const started = await startServer({ port: 0, host: "127.0.0.1" });
  return { base: `http://127.0.0.1:${started.port}`, close: started.close };
}

async function api(base: string, url: string, options: { method?: string; body?: unknown; ok?: boolean } = {}): Promise<any> {
  const response = await fetch(`${base}${url}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (options.ok === false) {
    if (response.ok) throw new Error(`expected failure for ${url}`);
    return data;
  }
  if (!response.ok) throw new Error(`${url} ${response.status} ${JSON.stringify(data)}`);
  return data;
}
