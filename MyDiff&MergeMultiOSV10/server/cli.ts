/**
 * The standalone web server: `npm run serve [-- args]`.
 *
 * Serves the built UI and the API on one port, so My Diff & Merge runs in a browser
 * with no Electron at all. The same argument shapes work here as in the desktop app,
 * which is what makes `git difftool` usable over a remote session.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, APP_VERSION } from "../core/appInfo.js";
import { parseArguments } from "../core/cli.js";
import { startServer } from "./index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4780);
const host = process.env.HOST || "127.0.0.1";

const argv = process.argv.slice(2);
const pending = parseArguments(argv) ?? fromEnvironment();

/** The Electron dev launcher forwards the request through the environment. */
function fromEnvironment() {
  try {
    const value = JSON.parse(process.env.MDM_PENDING || "null");
    return value && typeof value === "object" && typeof value.kind === "string" ? value : null;
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

console.log(`${APP_NAME} V${APP_VERSION}  http://${host}:${started.port}`);
if (pending) console.log(`Opening  ${JSON.stringify(pending)}`);
