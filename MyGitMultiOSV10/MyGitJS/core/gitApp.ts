import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError, redact } from "./errors.js";
import { isBuiltinMergeTool } from "./mergeTool.js";
import { runGit, gitEnv, releaseStaleIndexLock, clearStaleIndexLock, removeIndexLock, startGit } from "./gitProcess.js";
import { remoteCacheDirectory, SettingsStore } from "./settings.js";
import { badgeOf, colorOf, countWork, EMPTY_STATUS, hasChanges, mergeStatus, parseAheadBehind, statusFromPorcelain, type PathStatus, type WorkCounts } from "./status.js";

export type RepoInfo = {
  path: string;
  bare: boolean;
  remoteView: boolean;
  remoteUrl: string | null;
  branch: string | null;
  head: string | null;
  detached: boolean;
};

export type WorkState = WorkCounts & {
  ahead: number;
  behind: number;
  upstream: string | null;
};

export type FileEntry = {
  name: string;
  path: string;
  directory: boolean;
  badge: string;
  color: string;
  staged: string | null;
  workTree: string | null;
  unpushed: boolean;
};

export type CommitInfo = {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  refs: string[];
};

type Creds = { username?: string; password?: string };

type DiffToolProcess = {
  child: ChildProcess;
  pid: number;
  dir: string;
  left: string;
  right: string;
};

const AUTH_PATTERN = /authentication|authorization|401|403|terminal prompts disabled|could not read Username|Invalid username or password|Authentication failed/i;

export class GitApp {
  readonly settings: SettingsStore;
  private repoPath: string | null = null;
  private remoteView = false;
  private remoteUrl: string | null = null;
  private generation = 1;
  private progress: string | null = null;
  private dirtyTimer: NodeJS.Timeout | null = null;
  private dirtySnapshot: string | null = null;
  private dirtyBusy = false;
  private tail: Promise<void> = Promise.resolve();
  private currentChild: ChildProcess | null = null;
  private diffTool: DiffToolProcess | null = null;
  private diffQueue: Promise<void> = Promise.resolve();
  private mergeQueue: Promise<void> = Promise.resolve();
  private bare = false;
  private branch: string | null = null;
  private head: string | null = null;
  private workCounts: WorkCounts = { staged: 0, modified: 0, deleted: 0, untracked: 0, conflicted: 0, unpushed: 0 };
  private ahead = 0;
  private behind = 0;
  private upstream: string | null = null;
  private statusCache: { generation: number; files: Map<string, PathStatus>; dirs: Map<string, PathStatus> } | null = null;

  constructor(settingsDirectory?: string) {
    this.settings = new SettingsStore(settingsDirectory);
  }

  close(): void {
    this.stopDirtyPoll();
    const child = this.currentChild;
    const root = this.repoPath;
    this.currentChild = null;
    if (!child) {
      clearStaleIndexLock(root, 0);
      return;
    }
    child.once("close", () => removeIndexLock(root));
    child.kill();
  }

  tick() {
    return { generation: this.generation, progress: this.progress, repo: this.info(), work: this.workState() };
  }

  private workState(): WorkState | null {
    if (!this.repoPath) return null;
    return { ...this.workCounts, ahead: this.ahead, behind: this.behind, upstream: this.upstream };
  }

  cancel(): void {
    this.currentChild?.kill();
    this.currentChild = null;
    this.progress = null;
  }

  info(): RepoInfo | null {
    if (!this.repoPath) return null;
    return {
      path: this.repoPath,
      bare: this.bare,
      remoteView: this.remoteView,
      remoteUrl: this.remoteUrl,
      branch: this.branch,
      head: this.head,
      detached: this.branch === null,
    };
  }

  async open(repoPath: string, remoteView = false, remoteUrl: string | null = null): Promise<RepoInfo> {
    const resolved = path.resolve(repoPath);
    const check = await runGit(resolved, ["rev-parse", "--is-inside-work-tree"]);
    const bare = await runGit(resolved, ["rev-parse", "--is-bare-repository"]);
    if (check.code !== 0 && !(bare.code === 0 && bare.stdout.trim() === "true")) {
      const detail = redact(`${check.stderr}\n${bare.stderr}\n${check.stdout}`).trim();
      throw new ApiError("Not a Git repository.", "NOT_A_REPO", 400, detail);
    }
    const top = await runGit(resolved, ["rev-parse", "--show-toplevel"]);
    const gitDir = await runGit(resolved, ["rev-parse", "--absolute-git-dir"]);
    const isBare = bare.stdout.trim() === "true";
    const root = isBare
      ? path.resolve(gitDir.stdout.trim())
      : path.resolve(top.stdout.trim() || resolved);
    this.attach(root, remoteView || isBare, remoteUrl);
    if (!remoteView) {
      this.settings.rememberRepository(root, { mode: "local", path: root, remoteUrl: this.remoteUrl });
    } else {
      this.settings.rememberRepository(root, { mode: "remote", path: root, remoteUrl });
    }
    return this.info()!;
  }

  async clone(url: string, destination: string, creds?: Creds): Promise<RepoInfo> {
    const dest = path.resolve(destination);
    if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
      throw new ApiError("Destination folder must be empty or absent.", "DEST_NOT_EMPTY");
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    this.settings.rememberCloneUrl(url);
    const authUrl = withAuth(url, this.resolveCreds(creds));
    this.progress = "Cloning…";
    try {
      await this.gitOrThrow(undefined, ["clone", "--progress", authUrl, dest]);
      await runGit(dest, ["remote", "set-url", "origin", url]);
      this.settings.markCredentialSuccess();
    } catch (error) {
      this.noteAuthFailure(error);
      throw error;
    } finally {
      this.progress = null;
    }
    return this.open(dest, false, url);
  }

  async browse(url: string, creds?: Creds): Promise<RepoInfo> {
    this.settings.rememberCloneUrl(url);
    const hash = crypto.createHash("sha256").update(url.trim()).digest("hex").slice(0, 16);
    const cache = path.join(remoteCacheDirectory(), hash);
    fs.mkdirSync(remoteCacheDirectory(), { recursive: true });
    const authUrl = withAuth(url, this.resolveCreds(creds));
    this.progress = "Fetching remote…";
    try {
      if (!fs.existsSync(path.join(cache, "HEAD"))) {
        await this.gitOrThrow(undefined, ["clone", "--bare", "--progress", authUrl, cache]);
        await runGit(cache, ["remote", "set-url", "origin", url]);
      } else {
        await this.gitOrThrow(cache, [...authHeaderArgs(this.resolveCreds(creds)), "fetch", "--all", "--prune", "--tags"]);
      }
      this.settings.markCredentialSuccess();
    } catch (error) {
      this.noteAuthFailure(error);
      throw error;
    } finally {
      this.progress = null;
    }
    return this.open(cache, true, url);
  }

  tree() {
    this.requireRepo();
    const refs = this.gitSync(["for-each-ref", "--format=%(refname)%x00%(objectname)%x00%(HEAD)", "refs/heads", "refs/remotes", "refs/tags"]);
    const local: { name: string; sha: string; current: boolean }[] = [];
    const remotes = new Map<string, { name: string; sha: string }[]>();
    const tags: { name: string; sha: string }[] = [];
    for (const line of refs.split(/\r?\n/).filter(Boolean)) {
      const parts = line.includes("\0") ? line.split("\0") : line.split("%x00");
      const [ref, sha, head] = parts;
      if (!ref || !sha) continue;
      if (ref.startsWith("refs/heads/")) {
        local.push({ name: ref.slice("refs/heads/".length), sha, current: head === "*" });
      } else if (ref.startsWith("refs/remotes/")) {
        const rest = ref.slice("refs/remotes/".length);
        if (rest.endsWith("/HEAD")) continue;
        const slash = rest.indexOf("/");
        const remote = slash < 0 ? rest : rest.slice(0, slash);
        const name = slash < 0 ? rest : rest.slice(slash + 1);
        const list = remotes.get(remote) ?? [];
        list.push({ name, sha });
        remotes.set(remote, list);
      } else if (ref.startsWith("refs/tags/")) {
        tags.push({ name: ref.slice("refs/tags/".length), sha });
      }
    }
    local.sort((a, b) => a.name.localeCompare(b.name));
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return {
      local,
      remotes: [...remotes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([remote, items]) => ({
        remote,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      })),
      tags,
      writable: !this.remoteView && !this.bare,
    };
  }

  async releases() {
    const remote = this.remoteUrl;
    const parsed = parseGitHub(remote);
    if (!parsed) return [];
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "MyGitJS" };
    const token = this.settings.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/releases?per_page=30`, { headers });
    if (!response.ok) return [];
    const body = await response.json() as { tag_name?: string; name?: string; body?: string; published_at?: string; html_url?: string }[];
    return body.map((release) => ({
      tag: release.tag_name ?? "",
      name: release.name || release.tag_name || "",
      body: release.body ?? "",
      publishedAt: release.published_at ?? "",
      url: release.html_url ?? "",
    }));
  }

  async files(rel = ""): Promise<FileEntry[]> {
    return this.queued(() => this.readFiles(rel));
  }

  private async readFiles(rel = ""): Promise<FileEntry[]> {
    const root = this.requireRepo();
    const relative = normalizeRel(rel);
    const statuses = this.remoteView || this.bare ? emptyStatusIndex() : this.statusIndex();
    if (this.remoteView || this.bare) {
      const spec = relative ? `HEAD:${relative}` : "HEAD";
      const listed = await runGit(root, ["ls-tree", "-z", spec]);
      if (listed.code !== 0) return [];
      return parseLsTree(listed.stdout).map((entry) => ({
        ...entry,
        path: relative ? `${relative}/${entry.name}` : entry.name,
      })).sort(compareEntries);
    }
    const dir = safeJoin(root, relative);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    const names = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.name !== ".git");
    const ignored = new Set(this.ignoredNames(relative, names.map((entry) => entry.name)));
    return names.map((entry) => {
      const childRel = relative ? `${relative}/${entry.name}` : entry.name;
      const fromStatus = entry.isDirectory()
        ? statuses.dirs.get(childRel) ?? EMPTY_STATUS
        : statuses.files.get(childRel) ?? EMPTY_STATUS;
      const status = !hasChanges(fromStatus) && ignored.has(childRel)
        ? { staged: null, workTree: "Ignored", unpushed: false }
        : fromStatus;
      return toEntry(entry.name, childRel, entry.isDirectory(), status);
    }).sort(compareEntries);
  }

  async log(max = 300, pathFilter = ""): Promise<{ commits: CommitInfo[]; flat: boolean }> {
    const root = this.requireRepo();
    const args = ["log", "--date-order", "-n", String(Math.min(Math.max(max, 1), 2000)), "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1e"];
    const filter = normalizeRel(pathFilter);
    if (filter) args.push("--all", "--", filter);
    else args.push("--all");
    const result = await runGit(root, args);
    if (result.code !== 0) {
      if (/does not have any commits/i.test(result.stderr)) return { commits: [], flat: Boolean(filter) };
      throw gitError(result.stderr || result.stdout);
    }
    const commits = result.stdout.split("\x1e").map((row) => row.trim()).filter(Boolean).map(parseCommit).filter((row): row is CommitInfo => row !== null);
    return { commits, flat: Boolean(filter) };
  }

  async commitDetail(sha: string) {
    const root = this.requireRepo();
    const meta = await this.gitOrThrow(root, ["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%B", sha]);
    const [hash, parents, authorName, authorEmail, date, ...bodyParts] = meta.split("\x1f");
    const names = await runGit(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", sha]);
    return {
      sha: hash,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      authorName,
      authorEmail,
      date,
      message: bodyParts.join("\x1f").trim(),
      files: parseNameStatus(names.stdout),
    };
  }

  async diff(sha: string, file: string): Promise<string> {
    const root = this.requireRepo();
    const rel = normalizeRel(file);
    const parents = await runGit(root, ["rev-list", "--parents", "-n", "1", sha]);
    const parts = parents.stdout.trim().split(/\s+/);
    const parent = parts[1];
    const args = parent
      ? ["diff", "--unified=3", "--no-color", parent, sha, "--", rel]
      : ["show", "--unified=3", "--no-color", sha, "--", rel];
    const result = await runGit(root, args, 400_000);
    if (result.code !== 0) throw gitError(result.stderr || "Diff failed");
    const text = result.stdout;
    if (text.length >= 400_000) return `${text.slice(0, 400_000)}\n\n… truncated …`;
    return text || "(no textual diff)";
  }

  async checkout(name: string): Promise<void> {
    this.requireWritable();
    await this.gitOrThrow(this.repoPath!, ["checkout", name]);
    this.bump();
  }

  async addPreview(paths: string[]): Promise<string[]> {
    this.requireWritable();
    const rels = cleanPaths(paths);
    const out = await this.gitOrThrow(this.repoPath!, rels.length ? ["add", "--dry-run", "--", ...rels] : ["add", "--dry-run", "-A"]);
    return out.split(/\r?\n/).map((line) => line.replace(/^add '/, "").replace(/'$/, "").trim()).filter(Boolean);
  }

  async add(paths: string[]): Promise<string> {
    this.requireWritable();
    const rels = cleanPaths(paths);
    const out = await this.gitOrThrow(this.repoPath!, rels.length ? ["add", "--", ...rels] : ["add", "-A"]);
    this.bump();
    return out.trim() || "Git Add completed.";
  }

  async unstage(paths: string[]): Promise<string> {
    this.requireWritable();
    const rels = cleanPaths(paths);
    const out = await this.gitOrThrow(this.repoPath!, rels.length ? ["restore", "--staged", "--", ...rels] : ["reset"]);
    this.bump();
    return out.trim() || "Git Reset completed.";
  }

  async discard(paths: string[]): Promise<string> {
    this.requireWritable();
    const root = this.repoPath!;
    const rels = cleanPaths(paths);
    await this.queued(async () => {
      if (!rels.length) {
        await this.invokeGit(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", "."]);
        await this.invokeGit(root, ["clean", "-fd"]);
        return;
      }
      for (const rel of rels) {
        if (this.tracked(rel)) await this.invokeGit(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", rel]);
        await this.invokeGit(root, ["clean", "-fd", "--", rel]);
      }
    });
    this.bump();
    return "Discard completed.";
  }

  async commit(message: string): Promise<string> {
    this.requireWritable();
    if (!message.trim()) throw new ApiError("Commit message is required.", "MESSAGE");
    const out = await this.gitOrThrow(this.repoPath!, ["commit", "-m", message]);
    this.bump();
    return out.trim();
  }

  async fetch(creds?: Creds): Promise<string> {
    return this.remoteOp(["fetch", "--all", "--prune", "--tags"], creds, "Fetch completed.");
  }

  async pull(creds?: Creds): Promise<string> {
    this.requireWritable();
    return this.remoteOp(["pull", "--ff-only"], creds, "Pull completed.");
  }

  async push(creds?: Creds): Promise<string> {
    this.requireWritable();
    const upstream = await runGit(this.repoPath!, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    const args = upstream.code === 0 ? ["push"] : ["push", "-u", "origin", "HEAD"];
    return this.remoteOp(args, creds, "Push completed.");
  }

  async stash(): Promise<string> {
    this.requireWritable();
    const out = await this.gitOrThrow(this.repoPath!, ["stash", "push", "-u"]);
    this.bump();
    return out.trim();
  }

  async stashPop(): Promise<string> {
    this.requireWritable();
    const out = await this.gitOrThrow(this.repoPath!, ["stash", "pop"]);
    this.bump();
    return out.trim();
  }

  async gitStatusText(): Promise<string> {
    const root = this.requireRepo();
    return this.gitOrThrow(root, ["status"]);
  }

  async createFile(rel: string, directory: boolean): Promise<void> {
    this.requireWritable();
    const abs = safeJoin(this.repoPath!, normalizeRel(rel));
    if (fs.existsSync(abs)) throw new ApiError("Already exists.", "EXISTS");
    if (directory) fs.mkdirSync(abs, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "");
    }
    this.bump();
  }

  async deletePath(rel: string): Promise<void> {
    this.requireWritable();
    const abs = safeJoin(this.repoPath!, normalizeRel(rel));
    if (!fs.existsSync(abs)) throw new ApiError("Path not found.", "MISSING");
    fs.rmSync(abs, { recursive: true, force: true });
    this.bump();
  }

  async gitignore(rel: string, remove: boolean): Promise<void> {
    this.requireWritable();
    const root = this.repoPath!;
    const rule = normalizeRel(rel).replace(/\\/g, "/");
    const file = path.join(root, ".gitignore");
    const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
    const next = remove ? lines.filter((line) => line.trim() !== rule) : [...lines.filter((line) => line.trim() !== rule), rule];
    fs.writeFileSync(file, `${next.filter((line, index) => line.length || index < next.length - 1).join("\n")}\n`);
    this.bump();
  }

  openInShell(rel: string): void {
    const root = this.requireRepo();
    const abs = rel ? safeJoin(root, normalizeRel(rel)) : root;
    openOsPath(abs);
  }

  externalDiff(sha: string, file: string, launch = true): Promise<void> {
    const job = this.diffQueue.then(() => this.openExternalDiff(sha, file, launch));
    this.diffQueue = job.then(() => undefined, () => undefined);
    return job;
  }

  externalMerge(file: string): Promise<void> {
    const job = this.mergeQueue.then(() => this.openExternalMerge(file));
    this.mergeQueue = job.then(() => undefined, () => undefined);
    return job;
  }

  private async openExternalDiff(sha: string, file: string, launch: boolean): Promise<void> {
    const running = this.liveDiffTool();
    if (!launch) {
      if (running) await this.writeDiffFiles(sha, file, running.left, running.right);
      return;
    }
    const configured = this.settings.get().externalDiffToolPath.trim();
    const tool = configured ? unwrapCommand(configured) : "";
    if (!configured) throw new ApiError("External diff tool is not configured.", "NO_DIFF_TOOL");
    if (!tool || !fs.existsSync(tool)) {
      throw new ApiError("Diff tool was not found.", "NO_DIFF_TOOL", 400, `Path: ${tool}`);
    }
    const rel = normalizeRel(file);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-diff-"));
    const ext = path.extname(rel);
    const left = path.join(dir, `left${ext}`);
    const right = path.join(dir, `right${ext}`);
    await this.writeDiffFiles(sha, file, left, right);
    const template = this.settings.get().externalDiffToolArguments || "\"{left}\" \"{right}\"";
    const rendered = template.replaceAll("{left}", left).replaceAll("{right}", right);
    const child = await launchExternalTool(tool, splitArgs(rendered), [`Left: ${left}`, `Right: ${right}`], "DIFF_TOOL", false);
    this.keepDiffTool(child, dir, left, right);
  }

  private async openExternalMerge(file: string): Promise<void> {
    this.requireWritable();
    const root = this.requireRepo();
    const configured = this.settings.get().externalMergeToolPath.trim();
    if (isBuiltinMergeTool(configured)) {
      throw new ApiError("The built-in Diff & Merge tool resolves this file.", "BUILTIN_MERGE");
    }
    const tool = configured ? unwrapCommand(configured) : "";
    if (!configured) throw new ApiError("Merge tool is not configured.", "NO_MERGE_TOOL");
    if (!tool || !fs.existsSync(tool)) {
      throw new ApiError("Merge tool was not found.", "NO_MERGE_TOOL", 400, `Path: ${tool}`);
    }
    const rel = normalizeRel(file);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-merge-"));
    const ext = path.extname(rel);
    const base = path.join(dir, `base${ext}`);
    const local = path.join(dir, `local${ext}`);
    const remote = path.join(dir, `remote${ext}`);
    const merged = safeJoin(root, rel);
    try {
      await writeBlob(root, `:1:${rel}`, base);
      await writeBlob(root, `:2:${rel}`, local);
      await writeBlob(root, `:3:${rel}`, remote);
      const template = this.settings.get().externalMergeToolArguments || "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"";
      const rendered = template
        .replaceAll("{base}", base)
        .replaceAll("{local}", local)
        .replaceAll("{remote}", remote)
        .replaceAll("{merged}", merged);
      await launchExternalTool(tool, splitArgs(rendered), [
        `Base: ${base}`,
        `Local: ${local}`,
        `Remote: ${remote}`,
        `Merged: ${merged}`,
      ], "MERGE_TOOL", true);
      this.bump();
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the tool may still be releasing the stage files */
      }
    }
  }

  private liveDiffTool(): DiffToolProcess | null {
    const session = this.diffTool;
    if (!session) return null;
    if (session.child.exitCode !== null || session.child.signalCode !== null) {
      this.diffTool = null;
      return null;
    }
    return session;
  }

  private keepDiffTool(child: ChildProcess, dir: string, left: string, right: string): void {
    const session: DiffToolProcess = { child, pid: child.pid ?? 0, dir, left, right };
    this.diffTool = session;
    const forget = () => {
      if (this.diffTool === session) this.diffTool = null;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the tool may still be releasing the files */
      }
    };
    child.once("exit", forget);
    if (child.exitCode !== null || child.signalCode !== null) forget();
  }

  async diffSides(sha: string, file: string): Promise<{ path: string; left: string; right: string; leftVersion: string; rightVersion: string }> {
    const root = this.requireRepo();
    const rel = normalizeRel(file);
    const detail = await this.commitDetail(sha);
    const parent = detail.parents[0];
    return {
      path: rel,
      left: await readBlobText(root, parent ? `${parent}:${rel}` : null),
      right: await readBlobText(root, `${sha}:${rel}`),
      leftVersion: parent ? parent.slice(0, 7) : "",
      rightVersion: detail.sha.slice(0, 7),
    };
  }

  async conflictSources(file: string): Promise<{ path: string; base: string; local: string; remote: string; current: string }> {
    this.requireWritable();
    const root = this.requireRepo();
    const rel = normalizeRel(file);
    const staged = await this.gitOrThrow(root, ["ls-files", "-u", "--", rel]);
    if (!staged.trim()) {
      throw new ApiError("The file has no merge conflict to resolve.", "NOT_CONFLICTED", 400, `Path: ${rel}`);
    }
    let current = "";
    try {
      current = fs.readFileSync(safeJoin(root, rel), "utf8");
    } catch {
      current = "";
    }
    return {
      path: rel,
      base: await readBlobText(root, `:1:${rel}`),
      local: await readBlobText(root, `:2:${rel}`),
      remote: await readBlobText(root, `:3:${rel}`),
      current,
    };
  }

  async saveMerge(file: string, content: string): Promise<void> {
    this.requireWritable();
    const root = this.requireRepo();
    const rel = normalizeRel(file);
    fs.writeFileSync(safeJoin(root, rel), content);
    await this.gitOrThrow(root, ["add", "--", rel]);
    this.bump();
  }

  private async writeDiffFiles(sha: string, file: string, left: string, right: string): Promise<void> {
    const root = this.requireRepo();
    const rel = normalizeRel(file);
    const detail = await this.commitDetail(sha);
    const parent = detail.parents[0];
    await writeBlob(root, parent ? `${parent}:${rel}` : null, left);
    await writeBlob(root, `${sha}:${rel}`, right);
  }

  async exportCommit(sha: string, destination: string): Promise<number> {
    const root = this.requireRepo();
    const dest = path.resolve(destination);
    fs.mkdirSync(dest, { recursive: true });
    const listed = await this.gitOrThrow(root, ["ls-tree", "-r", "-z", sha]);
    const entries = parseLsTree(listed);
    let count = 0;
    for (const entry of entries) {
      if (entry.directory) continue;
      const target = safeJoin(dest, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await writeBlob(root, `${sha}:${entry.path}`, target);
      count += 1;
    }
    return count;
  }

  async summary() {
    const root = this.requireRepo();
    const info = this.info()!;
    const count = await runGit(root, ["rev-list", "--count", "--all"]);
    const authors = await runGit(root, ["log", "--all", "--format=%an"]);
    const tally = new Map<string, number>();
    for (const name of authors.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const contributors = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, commits]) => ({ name, commits }));
    const recent = await this.log(20);
    return {
      path: root,
      branch: info.branch,
      remoteUrl: info.remoteUrl,
      remoteView: info.remoteView,
      commitCount: Number(count.stdout.trim() || 0),
      contributors,
      recent: recent.commits.map((commit) => ({ sha: commit.sha.slice(0, 7), date: commit.date.slice(0, 10), author: commit.authorName, subject: commit.subject })),
    };
  }

  private async remoteOp(args: string[], creds: Creds | undefined, fallback: string): Promise<string> {
    const root = this.requireRepo();
    const resolved = this.resolveCreds(creds);
    const headerArgs = authHeaderArgs(resolved);
    try {
      const out = await this.gitOrThrow(root, [...headerArgs, ...args]);
      this.settings.markCredentialSuccess();
      this.bump();
      return out.trim() || fallback;
    } catch (error) {
      this.noteAuthFailure(error);
      throw error;
    }
  }

  private resolveCreds(override?: Creds): { username: string; password: string } | null {
    const username = (override?.username ?? this.settings.get().gitUsername).trim();
    if (override?.password) {
      return username && override.password ? { username, password: override.password } : null;
    }
    if (!this.settings.get().reuseCredentials) return null;
    const password = this.settings.getToken();
    if (!username || !password) return null;
    return { username, password };
  }

  private noteAuthFailure(error: unknown): void {
    if (error instanceof ApiError && error.code === "AUTH_REQUIRED") this.settings.markCredentialFailure();
  }

  private statusIndex() {
    if (this.statusCache?.generation === this.generation) return this.statusCache;
    const files = new Map<string, PathStatus>();
    const dirs = new Map<string, PathStatus>();
    const extras: PathStatus[] = [];
    const root = this.repoPath;
    if (!root) return { generation: this.generation, files, dirs };
    const porcelain = this.gitSync(["status", "--porcelain=v1", "-z", "-unormal"]);
    const parts = porcelain.split("\0");
    if (parts.at(-1) === "") parts.pop();
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (entry.length < 4) continue;
      const xy = entry.slice(0, 2);
      let filePath = entry.slice(3).replaceAll("\\", "/");
      const directory = filePath.endsWith("/");
      if (directory) filePath = filePath.replace(/\/+$/, "");
      if (xy.includes("R") || xy.includes("C")) i += 1;
      const status = statusFromPorcelain(xy);
      if (directory) {
        dirs.set(filePath, mergeStatus(dirs.get(filePath), status));
        if (xy === "??") extras.push(status);
      } else files.set(filePath, mergeStatus(files.get(filePath), status));
      bubble(dirs, filePath, status);
    }
    const unpushed = this.gitSyncOptional(["diff", "--name-only", "@{upstream}...HEAD"]);
    for (const line of unpushed.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const filePath = line.replaceAll("\\", "/");
      const current = files.get(filePath) ?? EMPTY_STATUS;
      const next = { ...current, unpushed: true };
      files.set(filePath, next);
      bubble(dirs, filePath, { staged: null, workTree: null, unpushed: true });
    }
    this.workCounts = countWork([...files.values(), ...extras]);
    this.statusCache = { generation: this.generation, files, dirs };
    return this.statusCache;
  }

  private tracked(rel: string): boolean {
    const result = this.gitSyncOptional(["ls-files", "--error-unmatch", "--", rel]);
    return Boolean(result);
  }

  private attach(root: string, remoteView: boolean, remoteUrl: string | null): void {
    this.stopDirtyPoll();
    this.repoPath = root;
    this.remoteView = remoteView;
    this.remoteUrl = remoteUrl;
    this.workCounts = { staged: 0, modified: 0, deleted: 0, untracked: 0, conflicted: 0, unpushed: 0 };
    this.refreshMeta();
    this.bump();
    this.dirtySnapshot = null;
    this.startDirtyPoll();
    if (!remoteView && !this.bare) void this.checkDirty();
  }

  private startDirtyPoll(): void {
    this.stopDirtyPoll(false);
    if (!this.repoPath || this.remoteView || this.bare) return;
    this.dirtyTimer = setInterval(() => { void this.checkDirty(); }, 800);
  }

  private stopDirtyPoll(clearSnapshot = true): void {
    if (this.dirtyTimer) clearInterval(this.dirtyTimer);
    this.dirtyTimer = null;
    if (clearSnapshot) this.dirtySnapshot = null;
  }

  private async checkDirty(): Promise<void> {
    if (this.dirtyBusy || !this.repoPath || this.remoteView || this.bare) return;
    this.dirtyBusy = true;
    const root = this.repoPath;
    const generation = this.generation;
    try {
      await this.queued(async () => {
        if (this.repoPath !== root || this.remoteView || this.bare) return;
        const result = await runGit(root, ["status", "--porcelain", "-unormal"]);
        if (this.repoPath !== root) return;
        const snapshot = result.code === 0 ? result.stdout : "";
        if (this.dirtySnapshot === null) {
          this.dirtySnapshot = snapshot;
          return;
        }
        if (snapshot !== this.dirtySnapshot && this.generation === generation) {
          this.bump();
          this.dirtySnapshot = snapshot;
        }
      });
    } finally {
      this.dirtyBusy = false;
    }
  }

  private bump(): void {
    this.generation += 1;
    this.statusCache = null;
    this.dirtySnapshot = null;
    this.refreshMeta();
  }

  private refreshMeta(): void {
    if (!this.repoPath) return;
    this.bare = this.gitSyncOptional(["rev-parse", "--is-bare-repository"]).trim() === "true";
    const branch = this.gitSyncOptional(["symbolic-ref", "--short", "-q", "HEAD"]).trim();
    this.branch = branch || null;
    const sha = this.gitSyncOptional(["rev-parse", "--verify", "-q", "HEAD"]).trim();
    this.head = sha || null;
    if (!this.remoteUrl) {
      const url = this.gitSyncOptional(["remote", "get-url", "origin"]).trim();
      this.remoteUrl = url || null;
    }
    this.refreshTracking();
  }

  private refreshTracking(): void {
    this.upstream = null;
    this.ahead = 0;
    this.behind = 0;
    if (!this.repoPath || this.remoteView || this.bare || !this.branch) return;
    const upstream = this.gitSyncOptional(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).trim();
    if (!upstream) return;
    this.upstream = upstream;
    const counts = parseAheadBehind(this.gitSyncOptional(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]));
    this.ahead = counts.ahead;
    this.behind = counts.behind;
  }

  private requireRepo(): string {
    if (!this.repoPath) throw new ApiError("No repository is open.", "NO_REPO", 409);
    return this.repoPath;
  }

  private requireWritable(): string {
    const root = this.requireRepo();
    if (this.remoteView || this.bare) throw new ApiError("This repository is read-only.", "READ_ONLY", 409);
    return root;
  }

  private ignoredNames(relative: string, names: string[]): string[] {
    if (!this.repoPath || names.length === 0) return [];
    const paths = names.map((name) => (relative ? `${relative}/${name}` : name));
    const result = spawnSync("git", ["check-ignore", "-z", "--stdin"], {
      cwd: this.repoPath,
      encoding: "utf8",
      input: `${paths.join("\0")}\0`,
      windowsHide: true,
    });
    return (result.stdout ?? "").split("\0").map((item) => item.replaceAll("\\", "/")).filter(Boolean);
  }

  private gitSync(args: string[]): string {
    return this.gitSyncOptional(args);
  }

  private gitSyncOptional(args: string[]): string {
    if (!this.repoPath) return "";
    let result = this.spawnGit(args);
    if (result.status !== 0 && releaseStaleIndexLock(`${result.stderr ?? ""}\n${result.stdout ?? ""}`)) {
      result = this.spawnGit(args);
    }
    if (result.status !== 0) return "";
    return result.stdout ?? "";
  }

  private spawnGit(args: string[]) {
    return spawnSync("git", args, {
      cwd: this.repoPath ?? undefined,
      encoding: "utf8",
      windowsHide: true,
      env: gitEnv(),
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  private queued<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(async () => task());
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async gitOrThrow(cwd: string | undefined, args: string[]): Promise<string> {
    return this.queued(() => this.invokeGit(cwd, args));
  }

  private async invokeGit(cwd: string | undefined, args: string[], retried = false): Promise<string> {
    clearStaleIndexLock(cwd);
    const child = startGit(cwd, args);
    this.currentChild = child;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => {
      stderr.push(Buffer.from(chunk));
      const line = Buffer.from(chunk).toString("utf8").trim();
      if (line) this.progress = line.split(/\r?\n/).at(-1) ?? line;
    });
    const code: number = await new Promise((resolve, reject) => {
      child.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new ApiError("Git was not found on PATH. Install Git and restart.", "NO_GIT", 500));
          return;
        }
        reject(error);
      });
      child.on("close", (exit) => resolve(exit ?? 1));
    });
    if (this.currentChild === child) this.currentChild = null;
    const out = Buffer.concat(stdout).toString("utf8");
    const err = Buffer.concat(stderr).toString("utf8");
    if (code !== 0) {
      if (!retried && releaseStaleIndexLock(`${err}\n${out}`)) return this.invokeGit(cwd, args, true);
      throw gitError(`${err}\n${out}`.trim() || `git ${args[0]} failed`);
    }
    return out || err;
  }
}

function gitError(message: string): ApiError {
  const clean = redact(message).trim() || "Git command failed.";
  if (AUTH_PATTERN.test(clean)) return new ApiError("Authentication required.", "AUTH_REQUIRED", 401, clean);
  return new ApiError(clean, "GIT", 400, clean);
}

function withAuth(url: string, creds: { username: string; password: string } | null): string {
  if (!creds || !/^https?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.username = creds.username;
    parsed.password = creds.password;
    return parsed.toString();
  } catch {
    return url;
  }
}

function authHeaderArgs(creds: { username: string; password: string } | null): string[] {
  if (!creds) return [];
  const b64 = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  return ["-c", `http.extraheader=Authorization: Basic ${b64}`];
}

function parseGitHub(remote: string | null): { owner: string; repo: string } | null {
  if (!remote) return null;
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function parseCommit(row: string): CommitInfo | null {
  const [sha, parents, authorName, authorEmail, date, refs, subject] = row.split("\x1f");
  if (!sha) return null;
  return {
    sha,
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    authorName: authorName ?? "",
    authorEmail: authorEmail ?? "",
    date: date ?? "",
    subject: (subject ?? "").replace(/\s+/g, " ").trim(),
    refs: (refs ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function parseNameStatus(stdout: string): { status: string; path: string; oldPath?: string }[] {
  const files: { status: string; path: string; oldPath?: string }[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const status = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1);
    if (status.startsWith("R") || status.startsWith("C")) {
      const [oldPath, filePath] = rest.split("\t");
      if (filePath) files.push({ status: status[0] ?? status, path: filePath, oldPath });
    } else {
      files.push({ status: status[0] ?? status, path: rest });
    }
  }
  return files;
}

function parseLsTree(stdout: string): FileEntry[] {
  const parts = stdout.split("\0");
  if (parts.at(-1) === "") parts.pop();
  return parts.filter(Boolean).map((entry) => {
    const tab = entry.indexOf("\t");
    const meta = tab >= 0 ? entry.slice(0, tab) : entry;
    const namePath = tab >= 0 ? entry.slice(tab + 1) : entry;
    const kind = meta.split(/\s+/)[1];
    const directory = kind === "tree";
    const name = namePath.split("/").pop() || namePath;
    return toEntry(name, namePath, directory, EMPTY_STATUS);
  });
}

function toEntry(name: string, rel: string, directory: boolean, status: PathStatus): FileEntry {
  return {
    name,
    path: rel,
    directory,
    badge: badgeOf(status),
    color: colorOf(status),
    staged: status.staged,
    workTree: status.workTree,
    unpushed: status.unpushed,
  };
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.directory !== b.directory) return a.directory ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function bubble(dirs: Map<string, PathStatus>, filePath: string, status: PathStatus): void {
  let dir = path.posix.dirname(filePath);
  while (dir && dir !== ".") {
    dirs.set(dir, mergeStatus(dirs.get(dir), status));
    dir = path.posix.dirname(dir);
  }
}

function emptyStatusIndex() {
  return { generation: -1, files: new Map<string, PathStatus>(), dirs: new Map<string, PathStatus>() };
}

function normalizeRel(rel: string): string {
  return rel.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function cleanPaths(paths: string[]): string[] {
  return paths.map(normalizeRel).filter(Boolean);
}

function safeJoin(root: string, rel: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, rel);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new ApiError("Invalid path.", "PATH");
  return resolved;
}

function openOsPath(target: string): void {
  if (process.platform === "win32") {
    startProcess("cmd", ["/c", "start", "", target]);
    return;
  }
  if (process.platform === "darwin") {
    startProcess("open", [target]);
    return;
  }
  startProcess("xdg-open", [target]);
}

function startProcess(command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: "ignore" });
  child.unref();
  return child;
}

function unwrapCommand(command: string): string {
  const trimmed = command.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quotedArg(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll("\"", "\\\"")}"` : arg;
}

function launchExternalTool(command: string, args: string[], details: string[], errorCode: string, waitForExit: boolean): Promise<ChildProcess> {
  const commandLine = [quotedArg(command), ...args.map(quotedArg)].join(" ");
  const context = [`Command: ${commandLine}`, ...details];
  const label = errorCode === "MERGE_TOOL" ? "Merge tool" : "Diff tool";
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: path.dirname(command),
        detached: true,
        windowsHide: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reject(new ApiError(message, errorCode, 500, [...context, message].join("\n")));
      return;
    }
    const chunks: Buffer[] = [];
    const capture = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const used = chunks.reduce((total, item) => total + item.length, 0);
      if (used < 8000) chunks.push(buf.subarray(0, 8000 - used));
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    let settled = false;
    const detail = (extra?: string) => [...context, extra, Buffer.concat(chunks).toString("utf8").trim()].filter(Boolean).join("\n");
    const fail = (message: string, extra?: string) => {
      if (settled) return;
      settled = true;
      reject(new ApiError(message, errorCode, 500, detail(extra)));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      child.stdout?.resume();
      child.stderr?.resume();
      child.unref();
      resolve(child);
    };
    child.once("error", (error) => fail(error.message));
    child.once("spawn", () => {
      if (!waitForExit) setTimeout(succeed, 700);
    });
    child.once("exit", (code, signal) => {
      if (code === 0 || code === null) {
        succeed();
        return;
      }
      fail(`${label} exited with code ${code}${signal ? ` (${signal})` : ""}.`);
    });
  });
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of input.matchAll(pattern)) args.push(match[1] ?? match[2] ?? match[3] ?? "");
  return args;
}

async function readBlobText(repo: string, spec: string | null): Promise<string> {
  if (!spec) return "";
  const exists = spawnSync("git", ["-C", repo, "cat-file", "-e", spec], { windowsHide: true });
  if (exists.status !== 0) return "";
  const result = spawnSync("git", ["-C", repo, "cat-file", "blob", spec], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) return "";
  const buffer = result.stdout ?? Buffer.alloc(0);
  if (buffer.includes(0)) throw new ApiError("This file is binary.", "BINARY");
  return buffer.toString("utf8");
}

function writeBlob(repo: string, spec: string | null, destination: string): Promise<void> {
  if (!spec) {
    fs.writeFileSync(destination, "");
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const exists = spawnSync("git", ["-C", repo, "cat-file", "-e", spec], { windowsHide: true });
    if (exists.status !== 0) {
      fs.writeFileSync(destination, "");
      resolve();
      return;
    }
    const reader = startGit(repo, ["cat-file", "blob", spec]);
    const stream = fs.createWriteStream(destination);
    let failed = false;
    reader.stdout?.pipe(stream);
    reader.on("error", (error) => {
      failed = true;
      reject(error);
    });
    stream.on("error", (error) => {
      failed = true;
      reject(error);
    });
    reader.on("close", (exit) => {
      if (failed) return;
      if (exit !== 0) reject(new ApiError(`Unable to read ${spec}`, "BLOB"));
      else resolve();
    });
  });
}
