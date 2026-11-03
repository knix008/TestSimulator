/* Copies the files the desktop build ships into dist/app, the folder tauri.conf.json embeds
 * (build.frontendDist). Only the application: no node_modules, tests or samples.
 * Run by `tauri build` (beforeBuildCommand) and before `cargo build` / `cargo test`. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "dist", "app");

/* What the app needs at run time. guide.html and guide/ are the user guide pages opened
 * with desktop.openWindow; they are copied when they exist. */
const FILES = ["index.html", "popup.html", "menu.html", "guide.html"];
const FOLDERS = ["style", "src", "assets", "guide"];
const REQUIRED = ["index.html", "popup.html", "menu.html", "style", "src", "assets"];

function stage() {
  REQUIRED.forEach((name) => {
    if (!fs.existsSync(path.join(root, name))) throw new Error(name + " is missing; nothing to stage.");
  });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const copied = [];
  FILES.concat(FOLDERS).forEach((name) => {
    const from = path.join(root, name);
    if (!fs.existsSync(from)) return;
    fs.cpSync(from, path.join(dest, name), { recursive: true });
    copied.push(name);
  });
  return copied;
}

if (require.main === module) {
  try {
    const copied = stage();
    console.log("staged " + copied.join(", ") + " -> " + path.relative(root, dest));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { stage: stage, FILES: FILES, FOLDERS: FOLDERS, dest: dest };
