// Compiles the Rust crates the browser build needs to WebAssembly and copies them next to
// the pages: qrcore (the encoder, loaded at start) and qrimage (raster export, loaded on demand).
// The desktop app calls the same crates natively.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const name of ["qrcore", "qrimage"]) {
  const crate = path.join(root, name);
  execFileSync("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown", "--manifest-path", path.join(crate, "Cargo.toml")], {
    cwd: crate,
    stdio: "inherit",
  });
  const built = path.join(crate, "target", "wasm32-unknown-unknown", "release", `${name}.wasm`);
  const dest = path.join(root, "src", "wasm", `${name}.wasm`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(built, dest);
  console.log(`${name}.wasm → ${path.relative(root, dest)} (${fs.statSync(dest).size} bytes)`);
}
