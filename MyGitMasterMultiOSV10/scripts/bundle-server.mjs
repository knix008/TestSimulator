// Bundles the HTTP/API layer (server/ + core/) into dist-server/:
//
//   index.cjs    startServer(), for anything that embeds the server
//   desktop.cjs  what the Tauri shell starts (src-tauri/src/core.rs); staged into
//                src-tauri/runtime/ by stage-runtime.mjs
//   cli.cjs      the standalone web server (`npm run serve`)
//
// All CommonJS: express 4 does a dynamic require of node:path that breaks in an ESM
// bundle. node-pty is native and stays outside; stage-runtime.mjs ships it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ENTRIES = {
  "index.cjs": "server/index.ts",
  "desktop.cjs": "server/desktop.ts",
  "cli.cjs": "server/cli.ts",
};
export const EXTERNAL = ["node-pty", "bufferutil", "utf-8-validate"];

for (const [outfile, entry] of Object.entries(ENTRIES)) {
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, entry)],
    outfile: path.join(root, "dist-server", outfile),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    logLevel: "warning",
    external: EXTERNAL,
    banner: {
      js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
    },
    define: {
      "import.meta.url": "__importMetaUrl",
    },
  });
}
console.log(`server  dist-server/{${Object.keys(ENTRIES).join(",")}}`);
