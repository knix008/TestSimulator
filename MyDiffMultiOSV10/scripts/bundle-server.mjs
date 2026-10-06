// Bundles the HTTP/API layer (server/ + core/) into dist-server/, which is what the
// packaged Electron app and the standalone web server both load. Bundling keeps
// node_modules out of the installer: the shipped app is dist/ + dist-server/ + electron/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** core/ and server/ use ESM-style ".js" specifiers for TypeScript sources; esbuild
 *  does not remap those on its own. Dependencies keep their own resolution — the
 *  rewrite only applies where the .ts file actually exists. */
const typescriptSpecifiers = {
  name: "ts-specifiers",
  setup(build) {
    build.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
      const candidate = path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      return fs.existsSync(candidate) ? { path: candidate } : null;
    });
  },
};

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: false,
  minify: false,
  logLevel: "info",
  absWorkingDir: root,
  plugins: [typescriptSpecifiers],
};

await build({
  ...common,
  entryPoints: [path.join(root, "server", "index.ts")],
  outfile: path.join(root, "dist-server", "index.cjs"),
  format: "cjs",
});

// The CLI keeps ESM because it reads import.meta.url to find the static dist/ folder.
await build({
  ...common,
  entryPoints: [path.join(root, "server", "cli.ts")],
  outfile: path.join(root, "dist-server", "cli.mjs"),
  format: "esm",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});
