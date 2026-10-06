import { build } from "esbuild";

const external = ["node-pty", "bufferutil", "utf-8-validate"];

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-server/index.cjs",
  external,
  banner: {
    js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__importMetaUrl",
  },
});

await build({
  entryPoints: ["server/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-server/cli.cjs",
  external,
  banner: {
    js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__importMetaUrl",
  },
});
