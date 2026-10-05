import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4760);
const host = process.env.HOST || "127.0.0.1";

const args = process.argv.slice(2).filter((item) => !item.startsWith("-"));
const pending = args.length >= 2 ? { left: args[0], right: args[1] } : fromEnvironment();

/** The Electron dev launcher forwards `mydiff LEFT RIGHT` through the environment. */
function fromEnvironment(): { left: string; right: string } | null {
  try {
    const value = JSON.parse(process.env.MYDIFF_PENDING || "null");
    return value && typeof value.left === "string" && typeof value.right === "string" ? value : null;
  } catch {
    return null;
  }
}

const started = await startServer({
  port,
  host,
  staticDir: fs.existsSync(path.join(dist, "index.html")) ? dist : undefined,
  pending,
});

console.log(`MyDiff  http://${host}:${started.port}`);
if (pending) console.log(`Comparing  ${pending.left}  <->  ${pending.right}`);
