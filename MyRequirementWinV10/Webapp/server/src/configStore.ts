import fs from "fs";
import path from "path";
import { ConnectionSettings } from "./types";

// Server-local persistence for the DB connection settings configured through the admin
// console, so they survive a restart without requiring env vars. Lives under server/data/,
// which is gitignored — this file can contain a DB password, just like a .env file would.
const CONFIG_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "connection-config.json");

export function loadPersistedSettings(): ConnectionSettings | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as ConnectionSettings;
  } catch {
    return null;
  }
}

export function savePersistedSettings(settings: ConnectionSettings): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), "utf-8");
}
