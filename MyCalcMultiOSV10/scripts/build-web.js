const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist", "web");

function walk(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).flatMap((name) => walk(path.join(rel, name)));
}

const files = ["index.html", ...walk("style"), ...walk("src"), ...walk("assets")];

fs.rmSync(outDir, { recursive: true, force: true });
for (const rel of files) {
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dest);
}

const bytes = files.reduce((sum, rel) => sum + fs.statSync(path.join(outDir, rel)).size, 0);
console.log(`\x1b[32mWeb\x1b[0m  dist/web  ${files.length}개 파일, ${bytes} bytes`);
