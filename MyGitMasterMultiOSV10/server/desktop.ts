/**
 * The desktop core: what the Tauri shell starts behind its windows.
 *
 *   node desktop.cjs --port N --static DIR --parent-pid PID
 *
 * It is the same server the web build runs, on a port the shell picked, serving the
 * built UI so the main window and the Diff / Merge tool windows all load from one
 * origin and call `/api` (and the terminal WebSocket) relatively. It prints one
 * `MGM_READY <port> <node version>` line once it listens, and exits when the shell
 * does, so a crashed or killed window never leaves it running.
 */
import fs from "node:fs";
import { startServer } from "./index.js";

const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const port = Number(option("--port") || 0);
const staticDir = option("--static");
const parentPid = Number(option("--parent-pid") || 0);

// No top-level await: this is bundled as CommonJS (scripts/bundle-server.mjs).
startServer({
  port,
  host: "127.0.0.1",
  staticDir: staticDir && fs.existsSync(staticDir) ? staticDir : undefined,
}).then((started) => {
  process.stdout.write(`MGM_READY ${started.port} ${process.version}\n`);

  const stop = () => {
    started.close().catch(() => {}).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };

  if (parentPid > 0) {
    // Signal 0 only asks whether the process exists.
    setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        stop();
      }
    }, 1000).unref();
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}, (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
