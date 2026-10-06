/**
 * The HTTP API.
 *
 * One server serves both products: `npm run serve` runs it as the web build's backend,
 * and the Electron main process starts the same thing on an ephemeral port and points
 * its window at it. Every file-system, git and settings operation therefore has exactly
 * one implementation.
 */
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { APP_NAME, APP_TITLE, APP_VERSION, AUTHOR, DOC_EXTENSION } from "../core/appInfo.js";
import { DiffMergeApp, type GitView, type PendingRequest } from "../core/app.js";
import { parseArguments } from "../core/cli.js";
import { ApiError, asApiError, redact } from "../core/errors.js";
import { systemFonts } from "../core/fonts.js";
import { gitAvailable, type GitChange } from "../core/git.js";
import type { FileOperation } from "../core/fileOps.js";
import { homeDirectory, listDirectory, systemDrives } from "../core/fsBrowse.js";
import type { MergeDocument } from "../core/mergeDocument.js";
import { sanitize, type AppSettings } from "../core/settings.js";

export type ServerOptions = {
  port: number;
  host?: string;
  staticDir?: string;
  /** What the command line asked for (`--diff A B`, `--merge BASE LOCAL REMOTE MERGED`). */
  pending?: PendingRequest | null;
  /** Raw arguments, parsed here when `pending` is not supplied. */
  argv?: readonly string[];
  /** Executable a user would register with git; shown in Settings. */
  launcher?: string;
};

export type StartedServer = { port: number; app: DiffMergeApp; close: () => Promise<void> };

export { parseArguments } from "../core/cli.js";

import { encodePng } from "../core/png.js";
import { isFileOperation } from "../core/fileOps.js";
import { isFormatId } from "../core/formats.js";
import { isSyncMode } from "../core/sync.js";
import { decodeTiff } from "../core/tiff.js";

/**
 * The picture formats the browser can display for itself. Everything in this table
 * is streamed straight from disk.
 */
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".dib": "image/bmp",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/**
 * Formats no browser will display, which are decoded here and sent as PNG instead.
 * TIFF has a decoder of its own in `core/tiff.ts`; HEIC and HEIF are HEVC frames in
 * a container and would need a video decoder, so they are recognised — the file is
 * a picture, and saying so is better than calling it binary — but refused with a
 * reason rather than served as something broken.
 */
const CONVERTED_TYPES = new Set([".tif", ".tiff"]);
const UNDECODABLE_TYPES = new Set([".heic", ".heif"]);

export function isPictureFile(target: string): boolean {
  const extension = path.extname(target).toLowerCase();
  return extension in IMAGE_TYPES || CONVERTED_TYPES.has(extension) || UNDECODABLE_TYPES.has(extension);
}

export function startServer(options: ServerOptions): Promise<StartedServer> {
  const app = new DiffMergeApp({ launcher: options.launcher });
  app.setPending(options.pending ?? (options.argv ? parseArguments(options.argv) : null));

  const server = express();
  server.use(express.json({ limit: "64mb" }));

  const wrap = (handler: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(req, res);
      } catch (error) {
        next(error);
      }
    };

  /* ------------------------------------------------------- bootstrap */

  server.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: APP_NAME, version: APP_VERSION });
  });

  server.get("/api/bootstrap", wrap(async (_req, res) => {
    res.json({
      app: {
        name: APP_NAME,
        title: APP_TITLE,
        version: APP_VERSION,
        author: AUTHOR,
        documentExtension: DOC_EXTENSION,
      },
      settings: app.settings.publicView(),
      pending: app.takePending(),
      git: await gitAvailable(),
      launcher: app.launcher,
      platform: process.platform,
      node: process.versions.node,
    });
  }));

  /* ----------------------------------------------- file comparison */

  server.post("/api/compare/files", wrap((req, res) => {
    const session = app.openFiles(
      text(req.body?.left),
      text(req.body?.right),
      req.body?.forceHex === true,
      isFormatId(req.body?.format) ? req.body.format : undefined,
    );
    res.json({ compare: session.summary() });
  }));

  server.post("/api/compare/:id/reload", wrap((req, res) => {
    res.json({ compare: app.reloadCompare(routeId(req)).summary() });
  }));

  server.get("/api/compare/:id/rows", wrap((req, res) => {
    const session = app.compare(routeId(req));
    const start = number(req.query.start, 0);
    const count = Math.min(number(req.query.count, 200), 5000);
    res.json(session.mode === "binary"
      ? { mode: "binary", start, rows: session.hex(start, count) }
      : {
        mode: "text",
        start,
        rows: session.rows(start, count, req.query.words !== "0", req.query.syntax === "1"),
        language: session.language,
      });
  }));

  server.get("/api/compare/:id/text", wrap((req, res) => {
    const session = app.compare(routeId(req));
    const side = req.query.side === "right" ? "right" : req.query.side === "both" ? "both" : "left";
    res.json({ text: session.text(side, number(req.query.start, 0), Math.min(number(req.query.count, 200), 200_000)) });
  }));

  server.delete("/api/compare/:id", wrap((req, res) => {
    app.closeCompare(routeId(req));
    res.json({ ok: true });
  }));

  /* ------------------------------------------ directory comparison */

  server.post("/api/compare/directories", wrap((req, res) => {
    const excludes = Array.isArray(req.body?.excludes) ? req.body.excludes.map(String) : undefined;
    res.json({ directory: app.openDirectories(text(req.body?.left), text(req.body?.right), excludes) });
  }));

  server.post("/api/directory/:id/reload", wrap((req, res) => {
    res.json({ directory: app.reloadDirectory(routeId(req)) });
  }));

  server.post("/api/directory/:id/open", wrap((req, res) => {
    res.json({ compare: app.openDirectoryEntry(routeId(req), text(req.body?.rel)).summary() });
  }));

  server.post("/api/directory/:id/operate", wrap((req, res) => {
    const operation = req.body?.operation;
    if (!isFileOperation(operation)) {
      throw new ApiError(`Unknown operation: ${String(operation)}`, "BAD_REQUEST", 400);
    }
    const relatives = Array.isArray(req.body?.relatives) ? req.body.relatives.map(String) : [];
    res.json(app.applyDirectoryOperation(routeId(req), operation, relatives));
  }));

  server.post("/api/compare/remote", wrap(async (req, res) => {
    res.json({
      directory: await app.openRemoteDirectories(
        text(req.body?.local),
        text(req.body?.remote),
        text(req.body?.password),
      ),
    });
  }));

  server.post("/api/directory/:id/rename", wrap((req, res) => {
    const side = req.body?.side === "right" ? "right" : "left";
    res.json(app.renameDirectoryEntry(routeId(req), side, text(req.body?.rel), text(req.body?.name)));
  }));

  server.post("/api/directory/:id/sync/plan", wrap((req, res) => {
    const mode = req.body?.mode;
    if (!isSyncMode(mode)) throw new ApiError(`Unknown sync mode: ${String(mode)}`, "BAD_REQUEST", 400);
    res.json({
      plan: app.planSync(routeId(req), mode, {
        toleranceMs: number(req.body?.toleranceMs, undefined as unknown as number),
        allowDaylightShift: req.body?.allowDaylightShift === true,
      }),
    });
  }));

  server.post("/api/directory/:id/sync/apply", wrap((req, res) => {
    const plan = req.body?.plan;
    if (!plan || !isSyncMode(plan.mode) || !Array.isArray(plan.actions)) {
      throw new ApiError("That synchronisation plan is not usable.", "BAD_REQUEST", 400);
    }
    res.json(app.applySync(routeId(req), plan));
  }));

  server.get("/api/compare/:id/search", wrap((req, res) => {
    res.json({
      rows: app.search(routeId(req), text(req.query.q), {
        caseSensitive: req.query.case === "1",
        wholeWord: req.query.word === "1",
        regex: req.query.regex === "1",
        side: req.query.side === "left" || req.query.side === "right" ? req.query.side : "both",
      }),
    });
  }));

  server.post("/api/compare/:id/replace", wrap((req, res) => {
    const side = req.body?.side === "right" ? "right" : "left";
    const outcome = app.replaceAll(
      routeId(req),
      side,
      text(req.body?.find),
      text(req.body?.replace),
      {
        caseSensitive: req.body?.caseSensitive === true,
        wholeWord: req.body?.wholeWord === true,
        regex: req.body?.regex === true,
      },
    );
    res.json({ compare: outcome.session.summary(), replaced: outcome.replaced });
  }));

  /* ---------------------------------------------- editing a comparison */

  server.post("/api/compare/:id/take", wrap((req, res) => {
    const target = req.body?.target === "left" ? "left" : "right";
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.map(Number).filter(Number.isFinite) : [];
    res.json({ compare: app.takeRows(routeId(req), target, rows).summary() });
  }));

  server.post("/api/compare/:id/edit", wrap((req, res) => {
    const side = req.body?.side === "right" ? "right" : "left";
    res.json({
      compare: app.editRow(routeId(req), side, number(req.body?.row, -1), text(req.body?.text)).summary(),
    });
  }));

  /* ---------------------------------------------------------- merge */

  server.post("/api/merge/three-way", wrap((req, res) => {
    res.json({
      merge: app.openThreeWay(
        text(req.body?.base),
        text(req.body?.local),
        text(req.body?.remote),
        text(req.body?.merged),
      ),
    });
  }));

  server.post("/api/merge/conflict-file", wrap((req, res) => {
    res.json({ merge: app.openConflictFile(text(req.body?.path)) });
  }));

  server.post("/api/merge/repository-conflict", wrap(async (req, res) => {
    res.json({ merge: await app.openRepositoryConflict(text(req.body?.repository), text(req.body?.file)) });
  }));

  server.post("/api/merge/:id/save", wrap(async (req, res) => {
    const document = req.body?.document as MergeDocument | undefined;
    if (!document || !Array.isArray(document.regions)) {
      throw new ApiError("The merge result was not sent.", "BAD_REQUEST", 400);
    }
    res.json(await app.saveMerge(routeId(req), document, text(req.body?.path) || undefined));
  }));

  /* ------------------------------------------------------------ git */

  server.post("/api/git/open", wrap(async (req, res) => {
    const repo = await app.openRepository(text(req.body?.path));
    const { changes } = await app.changes({ mode: "work" });
    res.json({ repository: repo, changes, conflicted: await app.conflictedFiles() });
  }));

  server.get("/api/git/changes", wrap(async (req, res) => {
    await app.refreshRepository();
    const view = viewOf(req.query);
    const { changes, commit } = await app.changes(view);
    res.json({ repository: app.repository(), changes, commit, conflicted: await app.conflictedFiles() });
  }));

  server.get("/api/git/log", wrap(async (req, res) => {
    res.json({ commits: await app.history(number(req.query.max, 200), text(req.query.file)) });
  }));

  server.post("/api/git/open-change", wrap(async (req, res) => {
    const session = await app.openChange(viewOf(req.body?.view ?? {}), changeOf(req.body?.change));
    res.json({ compare: session.summary() });
  }));

  server.post("/api/git/unified", wrap(async (req, res) => {
    res.json({ text: await app.unifiedDiff(viewOf(req.body?.view ?? {}), changeOf(req.body?.change)) });
  }));

  server.get("/api/git/tools", wrap(async (_req, res) => {
    res.json(await app.toolStatus());
  }));

  server.post("/api/git/tools", wrap(async (req, res) => {
    const which = req.body?.tool === "merge" ? "merge" : "diff";
    const register = req.body?.register !== false;
    const tools = await import("../core/git.js");
    if (which === "merge") {
      await (register ? tools.registerMergeTool(app.launcher) : tools.unregisterMergeTool(app.launcher));
    } else {
      await (register ? tools.registerDiffTool(app.launcher) : tools.unregisterDiffTool(app.launcher));
    }
    res.json(await app.toolStatus());
  }));

  /* ----------------------------------------------- session document */

  server.post("/api/session/save", wrap((req, res) => {
    res.json({ path: app.saveSessionDocument(text(req.body?.path), req.body?.payload ?? null) });
  }));

  server.post("/api/session/load", wrap((req, res) => {
    res.json(app.loadSessionDocument(text(req.body?.path)));
  }));

  /* --------------------------------------------- file system access */

  server.get("/api/fs", wrap((req, res) => {
    res.json(listDirectory(text(req.query.path)));
  }));

  server.get("/api/drives", wrap((_req, res) => {
    res.json({ drives: systemDrives(), home: homeDirectory(), separator: path.sep });
  }));

  server.get("/api/fonts", wrap((req, res) => {
    res.json({ fonts: systemFonts(req.query.refresh === "1") });
  }));

  /** Serves a picture for the picture comparison, converting it if it has to. */
  server.get("/api/image", wrap((req, res) => {
    const target = path.resolve(text(req.query.path));
    const extension = path.extname(target).toLowerCase();
    const type = IMAGE_TYPES[extension];

    if (!type && !CONVERTED_TYPES.has(extension)) {
      if (UNDECODABLE_TYPES.has(extension)) {
        throw new ApiError(
          `${extension.slice(1).toUpperCase()} pictures need a HEVC decoder, which this build does not carry.`,
          "NO_DECODER",
          415,
        );
      }
      throw new ApiError(`Not an image file: ${target}`, "NO_IMAGE", 400);
    }
    if (!fs.existsSync(target)) throw new ApiError(`File not found: ${target}`, "NO_FILE", 404);

    res.setHeader("Cache-Control", "no-cache");
    if (type) {
      res.setHeader("Content-Type", type);
      fs.createReadStream(target).pipe(res);
      return;
    }

    // A TIFF: decode it here and send a PNG, which the browser can draw.
    const decoded = decodeTiff(fs.readFileSync(target));
    res.setHeader("Content-Type", "image/png");
    res.end(encodePng(decoded.width, decoded.height, decoded.rgba));
  }));

  /* -------------------------------------------------------- settings */

  server.get("/api/settings", wrap((_req, res) => {
    res.json(app.settings.publicView());
  }));

  server.put("/api/settings", wrap((req, res) => {
    app.settings.update(settingsPatch(req.body));
    res.json(app.settings.publicView());
  }));

  server.post("/api/settings/reset", wrap((_req, res) => {
    app.settings.resetPreferences();
    res.json(app.settings.publicView());
  }));

  server.post("/api/settings/recent/remove", wrap((req, res) => {
    res.json(removeRecent(app, text(req.body?.key)));
  }));

  server.post("/api/settings/recent/clear", wrap((_req, res) => {
    app.settings.clearRecent();
    res.json(app.settings.publicView());
  }));

  /* ---------------------------------------------------- static files */

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
        app,
        close: () => new Promise((done) => {
          listener.close(() => done());
        }),
      });
    });
  });
}

function removeRecent(app: DiffMergeApp, key: string) {
  app.settings.removeRecent(key);
  return app.settings.publicView();
}

function viewOf(source: unknown): GitView {
  const value = (source ?? {}) as Record<string, unknown>;
  const mode = String(value.mode ?? "work");
  if (mode === "commit") return { mode: "commit", sha: String(value.sha ?? "") };
  if (mode === "range") return { mode: "range", from: String(value.from ?? "HEAD"), to: String(value.to ?? "") };
  return { mode: "work" };
}

function changeOf(source: unknown): GitChange {
  const value = (source ?? {}) as Record<string, unknown>;
  const filePath = String(value.path ?? "");
  if (!filePath) throw new ApiError("No file was selected.", "NO_FILE", 400);
  return {
    path: filePath,
    oldPath: value.oldPath ? String(value.oldPath) : null,
    scope: String(value.scope ?? "unstaged") as GitChange["scope"],
    code: String(value.code ?? "M"),
    status: String(value.status ?? "Modified"),
    added: typeof value.added === "number" ? value.added : null,
    deleted: typeof value.deleted === "number" ? value.deleted : null,
  };
}

/**
 * Settings arrive from the renderer as a partial object. Rather than enumerate every
 * leaf, the patch is merged over the defaults and run through the same `sanitize` the
 * store uses, so an unknown or out-of-range value can never be written to disk.
 */
function settingsPatch(body: unknown): Partial<AppSettings> {
  if (!body || typeof body !== "object") return {};
  const patch = body as Partial<AppSettings>;
  const merged = sanitize({ ...(patch as AppSettings) } as AppSettings);
  const result: Partial<AppSettings> = {};
  for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
    if (key === "lastSession") {
      result.lastSession = patch.lastSession ?? null;
      continue;
    }
    result[key] = merged[key] as never;
  }
  return result;
}

/** Express 5 types a route parameter as `string | string[]`; ours is always one. */
function routeId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] ?? "" : String(value ?? "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
