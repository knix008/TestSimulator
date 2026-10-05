const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");

function newestSetup() {
  if (!fs.existsSync(releaseDir)) return "";
  const setups = fs
    .readdirSync(releaseDir)
    .filter((name) => name.toLowerCase().endsWith("setup.exe"))
    .map((name) => ({ name, at: fs.statSync(path.join(releaseDir, name)).mtimeMs }))
    .sort((one, two) => two.at - one.at);
  return setups.length ? setups[0].name : "";
}

const setup = newestSetup();
if (!setup) {
  console.log("\x1b[33mSetup\x1b[0m  release 폴더에 설치 파일이 없습니다.");
  process.exit(0);
}

const from = path.join(releaseDir, setup);
const to = path.join(root, setup);
fs.copyFileSync(from, to);
const bytes = fs.statSync(to).size;
console.log(`\x1b[32mSetup\x1b[0m  ${setup}  ${(bytes / (1024 * 1024)).toFixed(1)} MB`);
