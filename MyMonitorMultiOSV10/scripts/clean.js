"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = [
  path.join(root, "agent", "build"),
  path.join(root, "app", "release"),
  path.join(root, "web", "dist"),
  path.join(root, "test", ".tmp")
];

for (const dir of targets) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("removed", path.relative(root, dir) || dir);
}

const installer = /^(MyMonitor)[-_].+\.(exe|dmg|AppImage|deb|rpm)$/i;
for (const name of fs.readdirSync(root)) {
  if (!installer.test(name)) continue;
  const full = path.join(root, name);
  if (!fs.statSync(full).isFile()) continue;
  fs.unlinkSync(full);
  console.log("removed", name);
}
