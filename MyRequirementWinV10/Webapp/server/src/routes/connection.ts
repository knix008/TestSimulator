import { Router } from "express";
import { getActiveSettings, isConnected } from "../db";

const router = Router();

// Read-only: the client can check whether the server is connected to a database, but
// cannot configure or change the connection — that's server-side setup (env vars), not
// something exposed over the API.
router.get("/status", (_req, res) => {
  const settings = getActiveSettings();
  res.json({
    connected: isConnected(),
    provider: settings?.provider ?? null,
    database: settings?.provider === "sqlite" ? settings.sqliteFilePath : settings?.database ?? null
  });
});

export default router;
