import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { DiffApp, type GitView } from "../core/diffApp.js";
import { ApiError, asApiError, redact } from "../core/errors.js";
import { homeDirectory, listDirectory, systemDrives } from "../core/fsBrowse.js";
import { gitAvailable, type GitChange } from "../core/git.js";
import type { AppSettings } from "../core/settings.js";

export type ServerOptions = {
  port: number;
  host?: string;
  staticDir?: string;
  /** Left/right pair passed on the command line (`mydiff LEFT RIGHT`, git difftool). */
  pending?: { left: string; right: string } | null;
  launcher?: string;
};

export type StartedServer = { port: number; app: DiffApp; close: () => Promise<void> };

export function startServer(options: ServerOptions): Promise<StartedServer> {
  const diff = new DiffApp({ launcher: options.launcher });
  if (options.pending) diff.setPending(options.pending);

  const server = express();
  server.use(express.json({ limit: "4mb" }));

  const wrap = (handler: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(req, res);
      } catch (error) {
        next(error);
      }
    };

  server.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  server.get("/api/bootstrap", wrap(async (_req, res) => {
    let session = diff.summary();
    let message = "";
    const pending = diff.takePending();
    if (!session && pending) {
      if (isDirectory(pending.left) && isDirectory(pending.right)) {
        diff.compareDirectories(pending.left, pending.right);
      } else {
        try {
          session = await diff.openFiles(pending.left, pending.right);
        } catch (error) {
          message = asApiError(error).message;
        }
      }
    }

    const settings = diff.settings.get();
    if (!session && !pending && settings.lastFiles) {
      const { left, right } = settings.lastFiles;
      if (isFile(left) && isFile(right)) {
        session = await diff.openFiles(left, right).catch(() => null);
      }
    }

    res.json({
      settings: diff.settings.publicView(),
      session,
      repo: diff.repository(),
      directory: diff.directoryResult(),
      git: await gitAvailable(),
      launcher: diff.launcher,
      platform: process.platform,
      message,
    });
  }));

  /* ---------------- file comparison ---------------- */

  server.post("/api/files/open", wrap(async (req, res) => {
    res.json({ session: await diff.openFiles(text(req.body?.left), text(req.body?.right)) });
  }));

  server.post("/api/reload", wrap(async (_req, res) => {
    res.json({ session: await diff.reload() });
  }));

  server.get("/api/session/rows", wrap((req, res) => {
    const session = diff.currentSession();
    const start = number(req.query.start, 0);
    const count = number(req.query.count, 200);
    res.json(session.mode === "binary"
      ? { mode: "binary", start, rows: session.hex(start, count) }
      : { mode: "text", start, rows: session.rows(start, count) });
  }));

  server.get("/api/session/text", wrap((req, res) => {
    const session = diff.currentSession();
    const side = req.query.side === "right" ? "right" : "left";
    res.json({ text: session.text(side, number(req.query.start, 0), number(req.query.count, 200)) });
  }));

  /* ---------------- directory comparison ---------------- */

  server.post("/api/dir/compare", wrap((req, res) => {
    const excludes = Array.isArray(req.body?.excludes) ? req.body.excludes.map(String) : undefined;
    res.json({ directory: diff.compareDirectories(text(req.body?.left), text(req.body?.right), excludes) });
  }));

  server.post("/api/dir/open", wrap(async (req, res) => {
    res.json({ session: await diff.openDirectoryEntry(text(req.body?.rel)) });
  }));

  /* ---------------- git ---------------- */

  server.post("/api/git/open", wrap(async (req, res) => {
    const repo = await diff.openRepo(text(req.body?.path));
    res.json({ repo, changes: await diff.listChanges({ mode: "work" }) });
  }));

  server.get("/api/git/changes", wrap(async (req, res) => {
    await diff.refreshRepo();
    res.json(await diff.listChanges(asView(req.query)));
  }));

  server.get("/api/git/log", wrap(async (req, res) => {
    res.json({ commits: await diff.history(number(req.query.max, 200), text(req.query.file)) });
  }));

  server.post("/api/git/open-change", wrap(async (req, res) => {
    res.json({ session: await diff.openChange(asView(req.body?.view ?? {}), asChange(req.body?.change)) });
  }));

  server.get("/api/git/unified", wrap(async (_req, res) => {
    res.json({ text: await diff.unifiedDiffText() });
  }));

  server.get("/api/git/difftool", wrap(async (_req, res) => {
    res.json(await diff.diffTool());
  }));

  server.post("/api/git/difftool", wrap(async (req, res) => {
    res.json(req.body?.register === false ? await diff.unregisterAsDiffTool() : await diff.registerAsDiffTool());
  }));

  /* ---------------- file system browsing ---------------- */

  server.get("/api/fs", wrap((req, res) => {
    res.json(listDirectory(text(req.query.path)));
  }));

  server.get("/api/drives", wrap((_req, res) => {
    res.json({ drives: systemDrives(), home: homeDirectory() });
  }));

  /* ---------------- settings ---------------- */

  server.get("/api/settings", wrap((_req, res) => {
    res.json(diff.settings.publicView());
  }));

  server.put("/api/settings", wrap((req, res) => {
    diff.updateSettings(asSettingsPatch(req.body));
    res.json(diff.settings.publicView());
  }));

  server.post("/api/settings/reset", wrap((_req, res) => {
    diff.settings.resetPreferences();
    res.json(diff.settings.publicView());
  }));

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    server.use(express.static(staticDir));
    server.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const api = asApiError(error);
    if (!res.headersSent) {
      res.status(api.status).json({ error: redact(api.message), code: api.code, detail: redact(api.detail) });
    }
  });

  return new Promise((resolve) => {
    const listener = server.listen(options.port, options.host ?? "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        port,
        app: diff,
        close: () => new Promise((done) => {
          listener.close(() => done());
        }),
      });
    });
  });
}

function asView(source: unknown): GitView {
  const value = (source ?? {}) as Record<string, unknown>;
  const mode = String(value.mode ?? "work");
  if (mode === "commit") return { mode: "commit", sha: String(value.sha ?? "") };
  if (mode === "range") return { mode: "range", from: String(value.from ?? "HEAD"), to: String(value.to ?? "") };
  return { mode: "work" };
}

function asChange(source: unknown): GitChange {
  const value = (source ?? {}) as Record<string, unknown>;
  const filePath = String(value.path ?? "");
  if (!filePath) throw new ApiError("No file was selected.", "NO_FILE", 400);
  const scope = String(value.scope ?? "unstaged") as GitChange["scope"];
  return {
    path: filePath,
    oldPath: value.oldPath ? String(value.oldPath) : null,
    scope,
    code: String(value.code ?? "M"),
    status: String(value.status ?? "Modified"),
    added: typeof value.added === "number" ? value.added : null,
    deleted: typeof value.deleted === "number" ? value.deleted : null,
  };
}

function asSettingsPatch(source: unknown): Partial<AppSettings> {
  const value = (source ?? {}) as Record<string, unknown>;
  const patch: Partial<AppSettings> = {};
  if (value.language === "ko" || value.language === "en") patch.language = value.language;
  if (typeof value.theme === "string") patch.theme = value.theme as AppSettings["theme"];
  if (value.paneFontSize !== undefined) patch.paneFontSize = Number(value.paneFontSize);
  if (value.wordWrap !== undefined) patch.wordWrap = Boolean(value.wordWrap);
  if (value.wordHighlight !== undefined) patch.wordHighlight = Boolean(value.wordHighlight);
  if (typeof value.leftHeaderColor === "string") patch.leftHeaderColor = value.leftHeaderColor;
  if (typeof value.rightHeaderColor === "string") patch.rightHeaderColor = value.rightHeaderColor;
  if (Array.isArray(value.excludes)) patch.excludes = value.excludes.map(String);
  if (value.autoRefresh !== undefined) patch.autoRefresh = Boolean(value.autoRefresh);
  if (value.window && typeof value.window === "object") {
    patch.window = value.window as AppSettings["window"];
  }
  return patch;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}
