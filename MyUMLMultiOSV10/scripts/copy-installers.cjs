const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const installerExtensions = new Set(['.exe', '.msi', '.dmg', '.pkg', '.AppImage', '.deb', '.rpm', '.snap', '.zip']);

function collectInstallers(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory() || entry.name.endsWith('.blockmap')) {
      return [];
    }

    return installerExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

const installers = collectInstallers(releaseDir);

for (const installer of installers) {
  const destination = path.join(root, path.basename(installer));

  if (path.resolve(installer) !== path.resolve(destination)) {
    fs.copyFileSync(installer, destination);
    console.log(`Copied ${path.relative(root, installer)} -> ${path.basename(destination)}`);
  }
}

if (installers.length === 0) {
  console.log('No installer artifacts found to copy.');
}
