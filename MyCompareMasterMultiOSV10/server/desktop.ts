/**
 * The desktop core: what the Tauri shell starts behind its window.
 *
 *   node desktop.cjs --port N --static DIR --launcher EXE --parent-pid PID -- [app args]
 *
 * It is the same server the web build runs, on a port the shell picked, serving the
 * built UI so the window, its menus and its dialogs all load from one origin and call
 * `/api` relatively. It prints one `MCM_READY <port> <node version>` line once it
 * listens, and exits when the shell does, so a crashed or killed window never leaves
 * it running.
 */
import fs from "node:fs";
import { parseArguments } from "../core/cli.js";
import { startServer, type StartedServer } from "./index.js";

const args = process.argv.slice(2);
const split = args.indexOf("--");
const own = split >= 0 ? args.slice(0, split) : args;
const appArgs = split >= 0 ? args.slice(split + 1) : [];

function option(name: string): string | undefined {
  const index = own.indexOf(name);
  return index >= 0 ? own[index + 1] : undefined;
}

const port = Number(option("--port") || 0);
const staticDir = option("--static");
const launcher = option("--launcher");
const parentPid = Number(option("--parent-pid") || 0);

function ready(started: StartedServer): void {
  process.stdout.write(`MCM_READY ${started.port} ${process.version}\n`);

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
}

// No top-level await: this is bundled as CommonJS (scripts/bundle-server.mjs).
startServer({
  port,
  host: "127.0.0.1",
  staticDir: staticDir && fs.existsSync(staticDir) ? staticDir : undefined,
  pending: parseArguments(appArgs),
  launcher,
}).then(ready, (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
