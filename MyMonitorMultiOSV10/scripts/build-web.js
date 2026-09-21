"use strict";

const fs = require("fs");
const path = require("path");

function defaultRoot() {
  return process.env.MMON_WEB_ROOT || path.join(__dirname, "..");
}

function buildWeb(options = {}) {
  const root = options.root || defaultRoot();
  const dest = options.dest || path.join(root, "web", "dist");
  const renderer = path.join(root, "app", "renderer");
  const assets = path.join(root, "app", "assets");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "app", "package.json"), "utf8"));

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, "assets"), { recursive: true });

  for (const name of fs.readdirSync(renderer)) {
    const src = path.join(renderer, name);
    if (!fs.statSync(src).isFile()) continue;
    let text = fs.readFileSync(src, "utf8");
    if (name.endsWith(".html")) {
      text = text.replace(/\.\.\/assets\//g, "assets/");
      text = text.replace(/MyMonitor MultiOS v[\d.]+/, `MyMonitor MultiOS v${pkg.version}`);
    }
    if (name === "web-bridge.js") {
      text = text.replace(/window\.MMON_WEB_VERSION/g, JSON.stringify(pkg.version));
    }
    fs.writeFileSync(path.join(dest, name), text);
  }

  if (fs.existsSync(assets)) {
    for (const name of fs.readdirSync(assets)) {
      const src = path.join(assets, name);
      if (!fs.statSync(src).isFile()) continue;
      fs.copyFileSync(src, path.join(dest, "assets", name));
    }
  }

  fs.writeFileSync(
    path.join(dest, "version.json"),
    JSON.stringify({ name: "MyMonitor MultiOS", version: pkg.version, author: "SHKWON(knix008@naver.com)" }, null, 2)
  );

  return { dest, version: pkg.version };
}

if (require.main === module) {
  const result = buildWeb();
  console.log(`[build-web] ${result.dest} (v${result.version})`);
}

module.exports = { buildWeb };
