const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const releaseDirs = [
  path.join(root, "src-tauri", "target", "release", "bundle", "nsis"),
  path.join(root, "release"),
];

function newestSetup() {
  const setups = [];
  for (const dir of releaseDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.toLowerCase().endsWith("setup.exe")) continue;
      const file = path.join(dir, name);
      setups.push({ name, file, at: fs.statSync(file).mtimeMs });
    }
  }
  setups.sort((one, two) => two.at - one.at);
  return setups[0] || null;
}

const setup = newestSetup();
if (!setup) {
  console.log("\x1b[33mSetup\x1b[0m  설치 파일이 없습니다.");
  process.exit(0);
}

const to = path.join(root, setup.name);
fs.copyFileSync(setup.file, to);
const bytes = fs.statSync(to).size;
console.log(`\x1b[32mSetup\x1b[0m  ${setup.name}  ${(bytes / (1024 * 1024)).toFixed(1)} MB`);
