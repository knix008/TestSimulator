import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer } from "ws";
import { ApiError, redact } from "../core/errors.js";
import { listDirectory, systemDrives } from "../core/fsBrowse.js";
import { GitApp } from "../core/gitApp.js";
import { gitAvailable } from "../core/gitProcess.js";
import { installedDiffTools } from "../core/diffTools.js";
import { installedShells, resolveShell, sameShell } from "../core/shells.js";
import { isThemeId } from "../core/themes.js";
import { renderPdf } from "../core/reportPdf.js";
import type { Report } from "../core/report.js";
import { TerminalSession } from "../core/terminalSession.js";
import type { AppLanguage } from "../core/settings.js";

export type ServerOptions = {
  port: number;
  staticDir?: string;
  host?: string;
};

type Creds = { username?: string; password?: string };

export function startServer(options: ServerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const app = express();
  const git = new GitApp();
  const terminal = new TerminalSession({
    shell: () => resolveShell(installedShells(), git.settings.get().terminalShell),
    cwd: () => {
      const info = git.info();
      if (info && !info.remoteView && info.path) return info.path;
      return os.homedir();
    },
  });
  app.use(express.json({ limit: "2mb" }));

  const wrap = (fn: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res);
      } catch (error) {
        next(error);
      }
    };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/bootstrap", wrap(async (_req, res) => {
    if (!git.info()) {
      const session = git.settings.get().lastSession;
      if (session?.path && fs.existsSync(session.path)) {
        try {
          await git.open(session.path, session.mode === "remote", session.remoteUrl ?? null);
        } catch {
          /* keep the window empty when the previous folder is gone */
        }
      }
    }
    res.json({
      settings: git.settings.publicView(),
      repo: git.info(),
      git: await gitAvailable(),
    });
  }));

  app.get("/api/tick", wrap((_req, res) => {
    res.json(git.tick());
  }));

  app.post("/api/cancel", wrap((_req, res) => {
    git.cancel();
    res.json({ ok: true });
  }));

  app.post("/api/open", wrap(async (req, res) => {
    res.json({ repo: await git.open(String(req.body.path ?? "")) });
  }));

  app.post("/api/clone", wrap(async (req, res) => {
    const repo = await git.clone(String(req.body.url ?? ""), String(req.body.destination ?? ""), creds(req));
    res.json({ repo });
  }));

  app.post("/api/browse", wrap(async (req, res) => {
    const repo = await git.browse(String(req.body.url ?? ""), creds(req));
    res.json({ repo });
  }));

  app.get("/api/tree", wrap((_req, res) => {
    res.json(git.tree());
  }));

  app.get("/api/releases", wrap(async (_req, res) => {
    res.json({ releases: await git.releases() });
  }));

  app.get("/api/files", wrap(async (req, res) => {
    res.json({ entries: await git.files(String(req.query.path ?? "")) });
  }));

  app.get("/api/drives", wrap(async (_req, res) => {
    res.json({ drives: await systemDrives() });
  }));

  app.get("/api/fs", wrap((req, res) => {
    res.json(listDirectory(String(req.query.path ?? "")));
  }));

  app.get("/api/log", wrap(async (req, res) => {
    const max = Number(req.query.max ?? 300);
    res.json(await git.log(Number.isFinite(max) ? max : 300, String(req.query.path ?? "")));
  }));

  app.get("/api/commit", wrap(async (req, res) => {
    res.json(await git.commitDetail(String(req.query.sha ?? "")));
  }));

  app.get("/api/diff", wrap(async (req, res) => {
    res.json({ text: await git.diff(String(req.query.sha ?? ""), String(req.query.file ?? "")) });
  }));

  app.post("/api/checkout", wrap(async (req, res) => {
    await git.checkout(String(req.body.name ?? ""));
    res.json({ repo: git.info(), message: "Checkout completed." });
  }));

  app.post("/api/add/preview", wrap(async (req, res) => {
    res.json({ paths: await git.addPreview(asPaths(req.body.paths)) });
  }));

  app.post("/api/add", wrap(async (req, res) => {
    res.json({ message: await git.add(asPaths(req.body.paths)) });
  }));

  app.post("/api/unstage", wrap(async (req, res) => {
    res.json({ message: await git.unstage(asPaths(req.body.paths)) });
  }));

  app.post("/api/discard", wrap(async (req, res) => {
    res.json({ message: await git.discard(asPaths(req.body.paths)) });
  }));

  app.post("/api/commit", wrap(async (req, res) => {
    res.json({ message: await git.commit(String(req.body.message ?? "")) });
  }));

  app.post("/api/fetch", wrap(async (req, res) => {
    res.json({ message: await git.fetch(creds(req)) });
  }));

  app.post("/api/pull", wrap(async (req, res) => {
    res.json({ message: await git.pull(creds(req)) });
  }));

  app.post("/api/push", wrap(async (req, res) => {
    res.json({ message: await git.push(creds(req)) });
  }));

  app.post("/api/stash", wrap(async (_req, res) => {
    res.json({ message: await git.stash() });
  }));

  app.post("/api/stash/pop", wrap(async (_req, res) => {
    res.json({ message: await git.stashPop() });
  }));

  app.get("/api/git-status", wrap(async (_req, res) => {
    res.json({ text: await git.gitStatusText() });
  }));

  app.post("/api/new-file", wrap(async (req, res) => {
    await git.createFile(String(req.body.path ?? ""), false);
    res.json({ ok: true });
  }));

  app.post("/api/new-folder", wrap(async (req, res) => {
    await git.createFile(String(req.body.path ?? ""), true);
    res.json({ ok: true });
  }));

  app.post("/api/delete", wrap(async (req, res) => {
    await git.deletePath(String(req.body.path ?? ""));
    res.json({ ok: true });
  }));

  app.post("/api/gitignore", wrap(async (req, res) => {
    await git.gitignore(String(req.body.path ?? ""), Boolean(req.body.remove));
    res.json({ ok: true });
  }));

  app.post("/api/open-path", wrap((req, res) => {
    git.openInShell(String(req.body.path ?? ""));
    res.json({ ok: true });
  }));

  app.post("/api/diff-sides", wrap(async (req, res) => {
    res.json(await git.diffSides(String(req.body.sha ?? ""), String(req.body.file ?? "")));
  }));

  app.post("/api/merge-sources", wrap(async (req, res) => {
    res.json(await git.conflictSources(String(req.body.file ?? "")));
  }));

  app.post("/api/merge-save", wrap(async (req, res) => {
    await git.saveMerge(String(req.body.file ?? ""), String(req.body.content ?? ""));
    res.json({ ok: true });
  }));

  app.post("/api/external-diff", wrap(async (req, res) => {
    await git.externalDiff(String(req.body.sha ?? ""), String(req.body.file ?? ""), req.body.launch !== false);
    res.json({ ok: true });
  }));

  app.post("/api/external-merge", wrap(async (req, res) => {
    await git.externalMerge(String(req.body.file ?? ""));
    res.json({ ok: true });
  }));

  app.post("/api/export-commit", wrap(async (req, res) => {
    const count = await git.exportCommit(String(req.body.sha ?? ""), String(req.body.destination ?? ""));
    res.json({ count });
  }));

  app.get("/api/summary", wrap(async (_req, res) => {
    res.json(await git.summary());
  }));

  app.post("/api/report/pdf", wrap(async (req, res) => {
    const pdf = await renderPdf(asReport(req.body));
    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from(pdf));
  }));

  app.get("/api/diff-tools", wrap((_req, res) => {
    res.json({ tools: installedDiffTools() });
  }));

  app.get("/api/shells", wrap((_req, res) => {
    const shells = installedShells();
    const selected = resolveShell(shells, git.settings.get().terminalShell);
    res.json({
      shells: shells.map((shell) => ({ id: shell.id, label: shell.label, command: shell.command })),
      selected: selected?.id ?? "",
    });
  }));

  app.get("/api/settings", wrap((_req, res) => {
    res.json(git.settings.publicView());
  }));

  app.put("/api/settings", wrap((req, res) => {
    const body = req.body ?? {};
    const current = git.settings.get();
    const previous = resolveShell(installedShells(), current.terminalShell)?.id ?? "";
    let terminalShell = current.terminalShell;
    if (typeof body.terminalShell === "string") {
      if (body.terminalShell === "") terminalShell = "";
      else {
        const match = installedShells().find((shell) => sameShell(shell.id, body.terminalShell));
        if (match) terminalShell = match.id;
      }
    }
    git.settings.update({
      language: body.language === "en" ? "en" : body.language === "ko" ? "ko" : current.language,
      theme: isThemeId(body.theme) ? body.theme : current.theme,
      commitCategories: Array.isArray(body.commitCategories) ? body.commitCategories.map(String) : current.commitCategories,
      externalDiffToolPath: body.externalDiffToolPath !== undefined ? String(body.externalDiffToolPath) : current.externalDiffToolPath,
      externalDiffToolArguments: body.externalDiffToolArguments !== undefined ? String(body.externalDiffToolArguments) : current.externalDiffToolArguments,
      externalMergeToolPath: body.externalMergeToolPath !== undefined ? String(body.externalMergeToolPath) : current.externalMergeToolPath,
      externalMergeToolArguments: body.externalMergeToolArguments !== undefined ? String(body.externalMergeToolArguments) : current.externalMergeToolArguments,
      terminalShell,
    });
    const next = resolveShell(installedShells(), git.settings.get().terminalShell)?.id ?? "";
    if (previous !== next) terminal.restart();
    res.json(git.settings.publicView());
  }));

  app.post("/api/settings/reset", wrap((_req, res) => {
    const previous = resolveShell(installedShells(), git.settings.get().terminalShell)?.id ?? "";
    git.settings.resetPreferences();
    const next = resolveShell(installedShells(), git.settings.get().terminalShell)?.id ?? "";
    if (previous !== next) terminal.restart();
    res.json(git.settings.publicView());
  }));

  app.post("/api/credentials", wrap((req, res) => {
    git.settings.setCredentials(String(req.body.username ?? ""), String(req.body.password ?? ""), Boolean(req.body.reuse));
    res.json(git.settings.publicView());
  }));

  app.post("/api/recent-urls/delete", wrap((req, res) => {
    git.settings.removeCloneUrl(String(req.body.url ?? ""));
    res.json(git.settings.publicView());
  }));

  app.post("/api/recent-repos/delete", wrap((req, res) => {
    git.settings.removeRepository(String(req.body.path ?? ""));
    res.json(git.settings.publicView());
  }));

  app.post("/api/recent-repos/clear", wrap((_req, res) => {
    git.settings.clearRepositories();
    res.json(git.settings.publicView());
  }));

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const err = error instanceof ApiError
      ? error
      : new ApiError(
        error instanceof Error ? error.message : String(error),
        "ERROR",
        500,
        error instanceof Error ? error.stack || error.message : String(error),
      );
    const detail = redact(err.detail || err.message);
    if (!res.headersSent) res.status(err.status).json({ error: redact(err.message), code: err.code, detail });
  });

  return new Promise((resolve) => {
    const server = app.listen(options.port, options.host ?? "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        port,
        close: () => new Promise((done) => {
          terminal.close();
          git.close();
          server.close(() => done());
        }),
      });
    });
    const sockets = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname = "";
      try {
        pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (pathname !== "/api/terminal") {
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(req, socket, head, (ws) => terminal.attach(ws));
    });
  });
}

function asReport(value: unknown): Report {
  const body = value && typeof value === "object" ? value as Partial<Report> : {};
  if (typeof body.title !== "string" || !Array.isArray(body.summary) || !Array.isArray(body.tables)) {
    throw new ApiError("Invalid report.", "REPORT", 400);
  }
  const cell = (item: unknown) => String(item ?? "").slice(0, 2000);
  return {
    title: body.title.slice(0, 200),
    filename: String(body.filename || "report").slice(0, 80),
    generatedAt: String(body.generatedAt || new Date().toISOString()).slice(0, 40),
    summary: body.summary.slice(0, 40).map((row) => ({ label: cell(row?.label), value: cell(row?.value) })),
    tables: body.tables.slice(0, 6).map((table) => ({
      title: cell(table?.title),
      headers: Array.isArray(table?.headers) ? table.headers.slice(0, 12).map(cell) : [],
      rows: Array.isArray(table?.rows) ? table.rows.slice(0, 5000).map((row) => Array.isArray(row) ? row.slice(0, 12).map(cell) : []) : [],
    })),
    text: body.text && typeof body.text.body === "string"
      ? { title: cell(body.text.title), body: body.text.body.slice(0, 200_000) }
      : undefined,
  };
}

function creds(req: Request): Creds | undefined {
  const username = typeof req.body?.username === "string" ? req.body.username : undefined;
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  if (!username && !password) return undefined;
  return { username, password };
}

function asPaths(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export type { AppLanguage };
