// Fetches the LVGL sources the engines are built from into third_party/lvgl-<version>.
// Only needed to rebuild the engines; the app downloads its own copies at run time.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_ENGINES } from "../src/lvgl/versions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const version of BUNDLED_ENGINES) {
  const dir = path.join(root, "third_party", `lvgl-${version}`);
  if (fs.existsSync(path.join(dir, "lvgl.h"))) {
    console.log(`lvgl ${version}: present`);
    continue;
  }
  execFileSync("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", `v${version}`, "https://github.com/lvgl/lvgl.git", dir], { stdio: "inherit" });
  fs.rmSync(path.join(dir, ".git"), { recursive: true, force: true });
  console.log(`lvgl ${version}: fetched`);
}
