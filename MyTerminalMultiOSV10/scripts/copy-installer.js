const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

function main() {
  if (!fs.existsSync(distDir)) {
    console.error('dist/ not found. Run the Windows build first.');
    process.exit(1);
  }

  const setup = fs
    .readdirSync(distDir)
    .filter((name) => /^MyTerminal-Setup-.*\.exe$/i.test(name))
    .map((name) => ({
      name,
      full: path.join(distDir, name),
      mtime: fs.statSync(path.join(distDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0];

  if (!setup) {
    console.error('No MyTerminal-Setup-*.exe found in dist/.');
    process.exit(1);
  }

  const dest = path.join(root, setup.name);
  fs.copyFileSync(setup.full, dest);
  console.log(`Installer copied to ${dest}`);
}

main();
