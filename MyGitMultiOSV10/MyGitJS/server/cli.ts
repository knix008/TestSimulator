import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4730);

const started = await startServer({
  port,
  staticDir: fs.existsSync(path.join(dist, "index.html")) ? dist : undefined,
});

console.log(`MyGit API http://127.0.0.1:${started.port}`);
