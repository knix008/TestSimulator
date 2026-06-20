import { NextFunction, Request, Response, Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { authMiddleware, requireAdmin } from "../auth";
import { loadPersistedSettings, savePersistedSettings } from "../configStore";
import { requireConsoleAuth } from "../consoleAuth";
import { connect, getActiveSettings, getKnex, isConnected } from "../db";
import { getTables } from "../schema";
import { ConnectionSettings } from "../types";

const router = Router();

// Before the server has ever connected to a database there is no users table to log in
// against, so the only credential available is the console-level Basic Auth (already
// required to load /admin in the first place). Once connected, switch to the normal
// DB-backed admin JWT — these two schemes share the same Authorization header, so only
// one of them can be required for any given request, never both.
function requireAdminIfAlreadyConnected(req: Request, res: Response, next: NextFunction) {
  if (!isConnected()) {
    requireConsoleAuth(req, res, next);
    return;
  }
  authMiddleware(req, res, () => requireAdmin(req, res, next));
}

router.get(
  "/info",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const db = getKnex();
    const settings = getActiveSettings();
    const t = getTables();

    const count = async (table: string) => Number((await db(table).count<{ count: string }[]>("* as count").first())?.count ?? 0);

    const [requirementCount, testCaseCount, testRunCount, userCount, roleRows] = await Promise.all([
      count(t.requirements),
      count(t.testCases),
      count(t.testRuns),
      count("users"),
      db("users").select("role").count<{ role: string; count: string }[]>("* as count").groupBy("role")
    ]);

    const usersByRole = { admin: 0, editor: 0, viewer: 0 };
    for (const row of roleRows) {
      if (row.role in usersByRole) usersByRole[row.role as keyof typeof usersByRole] = Number(row.count);
    }

    res.json({
      connection: {
        provider: settings?.provider ?? null,
        server: settings?.provider === "sqlite" ? null : settings?.server ?? null,
        database: settings?.provider === "sqlite" ? settings.sqliteFilePath : settings?.database ?? null
      },
      counts: {
        requirements: requirementCount,
        testCases: testCaseCount,
        testRuns: testRunCount,
        users: userCount,
        usersByRole
      },
      server: {
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
      }
    });
  })
);

router.get("/connection", requireAdminIfAlreadyConnected, (_req, res) => {
  const settings = getActiveSettings() ?? loadPersistedSettings();
  res.json({
    connected: isConnected(),
    bootstrap: !isConnected(),
    settings: settings ? { ...settings, password: "" } : null
  });
});

router.put(
  "/connection",
  requireAdminIfAlreadyConnected,
  asyncHandler(async (req, res) => {
    const body = req.body as ConnectionSettings;
    if (!body.provider) {
      res.status(400).json({ error: "provider is required." });
      return;
    }

    // An empty password in the form means "keep the previously stored password" so the
    // admin doesn't have to retype it just to change, say, the port.
    const previous = getActiveSettings() ?? loadPersistedSettings();
    const settings: ConnectionSettings = {
      ...body,
      password: body.password || previous?.password || ""
    };

    try {
      await connect(settings);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    savePersistedSettings(settings);
    res.json({ success: true });
  })
);

export default router;
