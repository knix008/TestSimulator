// Compiles LVGL + engine/runtime.c to public/engine/lvgl-<version>.js for each bundled
// version, or the versions named on the command line. Needs Emscripten; the results are
// committed, so building or running the app itself does not.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_ENGINES } from "../src/lvgl/versions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const emscriptenRoots = [process.env.EMSCRIPTEN, "C:/Msys64/ucrt64/lib/emscripten", "/ucrt64/lib/emscripten", "/usr/lib/emscripten"].filter(Boolean);
const emscripten = emscriptenRoots.find((dir) => fs.existsSync(path.join(dir, "cmake/Modules/Platform/Emscripten.cmake")));
if (!emscripten) throw new Error("Emscripten was not found; set EMSCRIPTEN to its folder");

const toolPath = process.platform === "win32" && fs.existsSync("C:/Msys64/ucrt64/bin") ? `C:\\Msys64\\ucrt64\\bin;${process.env.PATH}` : process.env.PATH;
// Emscripten runs its compiler on the Node that runs this script, not on one it finds.
const env = { ...process.env, PATH: toolPath, Path: toolPath, EMSCRIPTEN: emscripten, EM_NODE_JS: process.execPath, BINARYEN_CORES: "1" };
// BINARYEN_CORES: with its thread pool, the MinGW build of wasm-opt hung without using any CPU.
const run = (args) => execFileSync("cmake", args, { stdio: "inherit", env });

const versions = process.argv.length > 2 ? process.argv.slice(2) : BUNDLED_ENGINES;
const outDir = path.join(root, "public", "engine");
fs.mkdirSync(outDir, { recursive: true });

for (const version of versions) {
  const lvgl = path.join(root, "third_party", `lvgl-${version}`).replaceAll("\\", "/");
  if (!fs.existsSync(path.join(lvgl, "lvgl.h"))) throw new Error(`${lvgl} is missing; run npm run fetch:lvgl`);
  const build = path.join(root, "build", "wasm", version);
  const started = Date.now();
  run([
    "-S", path.join(root, "engine"), "-B", build, "-G", "Ninja",
    `-DCMAKE_TOOLCHAIN_FILE=${emscripten}/cmake/Modules/Platform/Emscripten.cmake`,
    "-DCMAKE_BUILD_TYPE=Release", `-DLVGL_DIR=${lvgl}`, `-DLVGL_VERSION=${version}`,
  ]);
  run(["--build", build]);
  const output = path.join(build, `lvgl-${version}.js`);
  fs.copyFileSync(output, path.join(outDir, `lvgl-${version}.js`));
  const size = fs.statSync(output).size;
  console.log(`engine ${version}: ${(size / 1048576).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
