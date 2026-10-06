/**
 * The HTTP API, end to end.
 *
 * The server is started for real against a temporary settings directory and a
 * throwaway git repository, so these tests cover the paths the renderer actually
 * takes — including the ones that write to disk and the ones that shell out to git.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { startServer } from "../server/index.ts";
import { DEFAULT_THEME } from "../core/themes.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mdm-server-"));
process.env.MDM_SETTINGS_DIR = path.join(scratch, "settings");

let server;
let base;

/** True when git is on PATH; the git tests report as skipped rather than failing. */
let hasGit = false;
let repo = "";

before(async () => {
  server = await startServer({ port: 0, launcher: process.execPath });
  base = `http://127.0.0.1:${server.port}`;
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    hasGit = true;
  } catch {
    hasGit = false;
  }
  if (hasGit) repo = makeRepository();
});

after(async () => {
  await server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
  delete process.env.MDM_SETTINGS_DIR;
});

const api = async (method, route, body) => {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: payload };
};

function write(relative, text) {
  const target = path.join(scratch, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, "utf8");
  return target;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A repository with one commit, one edit in the work tree, and one conflict. */
function makeRepository() {
  const root = fs.mkdtempSync(path.join(scratch, "repo-"));
  git(["init", "-b", "main"], root);
  git(["config", "user.email", "test@example.com"], root);
  git(["config", "user.name", "Test"], root);
  git(["config", "commit.gpgsign", "false"], root);

  fs.writeFileSync(path.join(root, "a.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(root, "c.txt"), "shared\n");
  git(["add", "."], root);
  git(["commit", "-m", "first"], root);

  git(["checkout", "-b", "feature"], root);
  fs.writeFileSync(path.join(root, "c.txt"), "theirs\n");
  git(["commit", "-am", "theirs"], root);

  git(["checkout", "main"], root);
  fs.writeFileSync(path.join(root, "c.txt"), "ours\n");
  git(["commit", "-am", "ours"], root);

  // Leaves c.txt conflicted in the work tree.
  try {
    git(["merge", "feature"], root);
  } catch {
    /* the conflict is the point */
  }

  fs.writeFileSync(path.join(root, "a.txt"), "one\nTWO\nthree\nfour\n");
  return root;
}

/* ----------------------------------------------------------- bootstrap */

test("api › bootstrap reports the app, the settings and the platform", async () => {
  const { status, body } = await api("GET", "/api/bootstrap");
  assert.equal(status, 200);
  assert.equal(body.app.name, "My Diff & Merge");
  assert.match(body.app.title, /My Diff & Merge V\d+\.\d+/);
  assert.equal(body.app.author, "SHKWON(knix008@naver.com)");
  assert.equal(body.app.documentExtension, "dmrg");
  assert.ok(body.settings.settingsPath.length > 0);
  assert.equal(body.platform, process.platform);
});

test("api › health answers before anything is open", async () => {
  const { body } = await api("GET", "/api/health");
  assert.equal(body.ok, true);
});

/* ------------------------------------------------------------ compare */

test("api › two files compare and their rows can be read in windows", async () => {
  const left = write("cmp/left.txt", "one\ntwo\nthree\n");
  const right = write("cmp/right.txt", "one\nTWO\nthree\nfour\n");
  const opened = await api("POST", "/api/compare/files", { left, right });
  assert.equal(opened.status, 200);
  const summary = opened.body.compare;
  assert.equal(summary.mode, "text");
  assert.equal(summary.modified, 1);
  assert.equal(summary.added, 1);
  assert.equal(summary.identical, false);

  const rows = await api("GET", `/api/compare/${summary.id}/rows?start=0&count=10&words=1`);
  assert.equal(rows.body.mode, "text");
  assert.equal(rows.body.rows.length, summary.rowCount);
  const modified = rows.body.rows.find((row) => row.kind === "modified");
  assert.ok(modified.leftSpans.length > 0, "word spans are attached when asked for");
});

test("api › identical files report as identical", async () => {
  const left = write("same/a.txt", "x\n");
  const right = write("same/b.txt", "x\n");
  const { body } = await api("POST", "/api/compare/files", { left, right });
  assert.equal(body.compare.identical, true);
});

test("api › a binary pair switches to the hex view", async () => {
  const left = path.join(scratch, "bin-left.bin");
  const right = path.join(scratch, "bin-right.bin");
  fs.writeFileSync(left, Buffer.from([0, 1, 2, 3, 0, 5]));
  fs.writeFileSync(right, Buffer.from([0, 1, 9, 3, 0, 5]));
  const { body } = await api("POST", "/api/compare/files", { left, right });
  assert.equal(body.compare.mode, "binary");
  assert.equal(body.compare.differentBytes, 1);
  const rows = await api("GET", `/api/compare/${body.compare.id}/rows?start=0&count=4`);
  assert.equal(rows.body.mode, "binary");
  assert.equal(typeof rows.body.rows[0].offset, "number");
});

test("api › copying one side returns its text", async () => {
  const left = write("copy/a.txt", "alpha\nbeta\n");
  const right = write("copy/b.txt", "alpha\ngamma\n");
  const { body } = await api("POST", "/api/compare/files", { left, right });
  const text = await api("GET", `/api/compare/${body.compare.id}/text?side=left&start=0&count=10`);
  assert.equal(text.body.text, "alpha\nbeta");
});

test("api › a missing file is a 400 with a copyable detail", async () => {
  const { status, body } = await api("POST", "/api/compare/files", {
    left: path.join(scratch, "nope.txt"),
    right: path.join(scratch, "nope2.txt"),
  });
  assert.equal(status, 400);
  assert.equal(body.code, "NO_FILE");
  assert.ok(body.error.includes("File not found"));
  assert.ok(body.detail.length > 0);
});

test("api › reload picks up a change on disk", async () => {
  const left = write("reload/a.txt", "one\n");
  const right = write("reload/b.txt", "one\n");
  const opened = await api("POST", "/api/compare/files", { left, right });
  assert.equal(opened.body.compare.identical, true);
  fs.writeFileSync(right, "two\n");
  const reloaded = await api("POST", `/api/compare/${opened.body.compare.id}/reload`);
  assert.equal(reloaded.body.compare.identical, false);
});

/* ---------------------------------------------------------- directory */

test("api › two directories compare and an entry opens as a file diff", async () => {
  write("dir/left/same.txt", "x\n");
  write("dir/right/same.txt", "x\n");
  write("dir/left/changed.txt", "left\n");
  write("dir/right/changed.txt", "right\n");
  write("dir/left/only-left.txt", "l\n");

  const opened = await api("POST", "/api/compare/directories", {
    left: path.join(scratch, "dir/left"),
    right: path.join(scratch, "dir/right"),
  });
  const { id, result } = opened.body.directory;
  assert.equal(result.same, 1);
  assert.equal(result.different, 1);
  assert.equal(result.leftOnly, 1);

  const entry = await api("POST", `/api/directory/${id}/open`, { rel: "changed.txt" });
  assert.equal(entry.body.compare.modified, 1);
});

/* -------------------------------------------------------------- merge */

test("api › a 3-way merge opens, resolves and saves", async () => {
  const base_ = write("merge/base.txt", "one\ntwo\nthree\n");
  const local = write("merge/local.txt", "one\nLOCAL\nthree\n");
  const remote = write("merge/remote.txt", "one\nREMOTE\nthree\n");
  const merged = path.join(scratch, "merge/merged.txt");

  const opened = await api("POST", "/api/merge/three-way", { base: base_, local, remote, merged });
  const info = opened.body.merge;
  const regions = info.document.regions;
  assert.equal(regions.filter((region) => region.kind === "conflict").length, 1);

  // Resolve in the renderer's shape, then send the document back to be written.
  const resolved = {
    ...info.document,
    regions: regions.map((region) =>
      region.kind === "conflict"
        ? { kind: "conflict", hunk: { ...region.hunk, resolution: "local" } }
        : region),
  };
  const saved = await api("POST", `/api/merge/${info.id}/save`, { document: resolved });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(merged, "utf8"), "one\nLOCAL\nthree\n");
});

test("api › a conflicted file opens from its markers", async () => {
  const file = write("merge/conflicted.txt", [
    "head",
    "<<<<<<< HEAD",
    "ours",
    "=======",
    "theirs",
    ">>>>>>> branch",
    "tail",
    "",
  ].join("\n"));
  const { body } = await api("POST", "/api/merge/conflict-file", { path: file });
  const conflicts = body.merge.document.regions.filter((region) => region.kind === "conflict");
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].hunk.localLines, ["ours"]);
  assert.deepEqual(conflicts[0].hunk.remoteLines, ["theirs"]);
});

test("api › a file with no markers is refused with a clear reason", async () => {
  const file = write("merge/plain.txt", "nothing here\n");
  const { status, body } = await api("POST", "/api/merge/conflict-file", { path: file });
  assert.equal(status, 400);
  assert.equal(body.code, "NO_CONFLICTS");
});

/* ------------------------------------------------------------ session */

test("api › a session document saves and loads", async () => {
  const target = path.join(scratch, "work");
  const saved = await api("POST", "/api/session/save", {
    path: target,
    payload: { tabs: [{ kind: "compare", left: "a", right: "b" }] },
  });
  assert.ok(saved.body.path.endsWith(".dmrg"), saved.body.path);
  const loaded = await api("POST", "/api/session/load", { path: saved.body.path });
  assert.equal(loaded.body.payload.tabs.length, 1);
});

test("api › a file that is not a session is refused", async () => {
  const file = write("session/not-a-session.dmrg", "{}");
  const { status, body } = await api("POST", "/api/session/load", { path: file });
  assert.equal(status, 400);
  assert.equal(body.code, "BAD_SESSION");
});

/* ----------------------------------------------------------- settings */

test("api › settings are validated on the way in and persisted", async () => {
  const updated = await api("PUT", "/api/settings", { theme: "classic-dark", zoom: 9999 });
  assert.equal(updated.body.theme, "classic-dark");
  assert.equal(updated.body.zoom, 300, "an out-of-range zoom is clamped, not stored");
  const read = await api("GET", "/api/settings");
  assert.equal(read.body.theme, "classic-dark");
  await api("POST", "/api/settings/reset");
  assert.equal((await api("GET", "/api/settings")).body.theme, DEFAULT_THEME);
});

test("api › opening files records them in the recent list", async () => {
  const left = write("recent/a.txt", "a\n");
  const right = write("recent/b.txt", "b\n");
  await api("POST", "/api/compare/files", { left, right });
  const settings = await api("GET", "/api/settings");
  const entry = settings.body.recent.find((item) => item.paths[0] === left);
  assert.ok(entry, "the pair was recorded");
  assert.equal(entry.kind, "files");
  assert.ok(settings.body.recentDirectories.includes(path.dirname(left)), "the folder is remembered too");
});

test("api › the recent list can be cleared", async () => {
  await api("POST", "/api/settings/recent/clear");
  assert.equal((await api("GET", "/api/settings")).body.recent.length, 0);
});

/* ------------------------------------------------------- file system */

test("api › the browser lists folders and drives", async () => {
  const listing = await api("GET", `/api/fs?path=${encodeURIComponent(scratch)}`);
  assert.equal(listing.status, 200);
  assert.ok(Array.isArray(listing.body.entries));
  const drives = await api("GET", "/api/drives");
  assert.ok(drives.body.drives.length > 0);
  assert.ok(drives.body.home.length > 0);
});

test("api › system fonts are discoverable", async () => {
  const { body } = await api("GET", "/api/fonts");
  assert.ok(Array.isArray(body.fonts));
  assert.ok(body.fonts.length > 0, "at least a fallback list is returned");
  assert.ok(body.fonts.every((font) => typeof font.family === "string" && font.family.length > 0));
});

test("api › an image is served for the image comparison, and a non-image is refused", async () => {
  const icon = path.resolve("build/icon.png");
  const response = await fetch(`${base}/api/image?path=${encodeURIComponent(icon)}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const refused = await api("GET", `/api/image?path=${encodeURIComponent(write("x.txt", "x"))}`);
  assert.equal(refused.status, 400);
});

/* ----------------------------------------------------------------- git */

test("git › a repository opens and reports its changes", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  const { status, body } = await api("POST", "/api/git/open", { path: repo });
  assert.equal(status, 200);
  assert.equal(body.repository.branch, "main");
  assert.ok(body.changes.length > 0);
  assert.ok(body.changes.some((change) => change.path === "a.txt"));
});

test("git › a conflicted file is listed as conflicted", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  await api("POST", "/api/git/open", { path: repo });
  const { body } = await api("GET", "/api/git/changes?mode=work");
  assert.ok(body.conflicted.includes("c.txt"), `conflicted: ${JSON.stringify(body.conflicted)}`);
});

test("git › a conflicted file opens as a 3-way merge with all three stages", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  await api("POST", "/api/git/open", { path: repo });
  const { body } = await api("POST", "/api/merge/repository-conflict", { repository: repo, file: "c.txt" });
  const conflicts = body.merge.document.regions.filter((region) => region.kind === "conflict");
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].hunk.localLines, ["ours"]);
  assert.deepEqual(conflicts[0].hunk.remoteLines, ["theirs"]);
  assert.deepEqual(conflicts[0].hunk.baseLines, ["shared"]);
  assert.equal(body.merge.source, "git");
});

test("git › resolving and saving a repository conflict stages the file", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  await api("POST", "/api/git/open", { path: repo });
  const opened = await api("POST", "/api/merge/repository-conflict", { repository: repo, file: "c.txt" });
  const info = opened.body.merge;
  const resolved = {
    ...info.document,
    regions: info.document.regions.map((region) =>
      region.kind === "conflict"
        ? { kind: "conflict", hunk: { ...region.hunk, resolution: "remote" } }
        : region),
  };
  const saved = await api("POST", `/api/merge/${info.id}/save`, { document: resolved });
  assert.equal(saved.body.staged, true);
  assert.equal(fs.readFileSync(path.join(repo, "c.txt"), "utf8"), "theirs\n");
  const after_ = await api("GET", "/api/git/changes?mode=work");
  assert.equal(after_.body.conflicted.includes("c.txt"), false);
});

test("git › a change opens as a two-way comparison of the right blobs", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  await api("POST", "/api/git/open", { path: repo });
  const changes = await api("GET", "/api/git/changes?mode=work");
  const change = changes.body.changes.find((item) => item.path === "a.txt");
  assert.ok(change, "a.txt is modified in the work tree");
  const { body } = await api("POST", "/api/git/open-change", { view: { mode: "work" }, change });
  assert.ok(body.compare.modified + body.compare.added > 0);
});

test("git › the history is readable", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  await api("POST", "/api/git/open", { path: repo });
  const { body } = await api("GET", "/api/git/log?max=10");
  assert.ok(body.commits.length >= 2);
  assert.ok(body.commits[0].shortSha.length >= 7);
});

test("git › the difftool and mergetool commands are reported", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  const { body } = await api("GET", "/api/git/tools");
  // Positional, with no switches: a packaged Electron app rejects unknown ones.
  assert.match(body.diff.command, /"\$LOCAL" "\$REMOTE"/);
  assert.equal(body.diff.command.includes("--"), false, body.diff.command);
  assert.match(body.merge.command, /"\$BASE" "\$LOCAL" "\$REMOTE" "\$MERGED"/);
  assert.equal(body.merge.command.includes("--"), false, body.merge.command);
  assert.ok(body.merge.lines.some((line) => line.includes("trustExitCode")));
});

test("git › a folder that is not a repository is refused", async (t) => {
  if (!hasGit) return t.skip("git is not installed");
  const { status, body } = await api("POST", "/api/git/open", { path: scratch });
  assert.equal(status, 400);
  assert.equal(body.code, "NO_REPO");
});
