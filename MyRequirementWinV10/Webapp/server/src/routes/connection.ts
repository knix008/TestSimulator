import { Router } from "express";
import { connect, getActiveSettings, isConnected } from "../db";
import { ConnectionSettings } from "../types";

const router = Router();

router.get("/status", (_req, res) => {
  const settings = getActiveSettings();
  res.json({
    connected: isConnected(),
    provider: settings?.provider ?? null,
    database: settings?.provider === "sqlite" ? settings.sqliteFilePath : settings?.database ?? null
  });
});

router.post("/", async (req, res) => {
  const settings = req.body as ConnectionSettings;
  try {
    await connect(settings);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
