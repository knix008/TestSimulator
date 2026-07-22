const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const productName = packageJson.build?.productName || packageJson.productName || packageJson.name;
const version = packageJson.version;
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

    if (!installerExtensions.has(path.extname(entry.name))) {
      return [];
    }

    // Keep only the current product's installer (ignore leftovers from renamed builds).
    const isCurrentProduct =
      entry.name.startsWith(`${productName} `)
      || entry.name.startsWith(`${productName}-`)
      || /^UML-Editor-Setup-/i.test(entry.name);
    if (!isCurrentProduct) {
      return [];
    }

    return [fullPath];
  });
}

const installers = collectInstallers(releaseDir);
const copiedNames = new Set();

for (const installer of installers) {
  const destination = path.join(root, path.basename(installer));
  copiedNames.add(path.basename(destination));

  if (path.resolve(installer) !== path.resolve(destination)) {
    fs.copyFileSync(installer, destination);
    console.log(`Copied ${path.relative(root, installer)} -> ${path.basename(destination)}`);
  }
}

// Remove stale root copies left over from older product names / versions.
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name.endsWith('.blockmap')) {
    continue;
  }
  if (!installerExtensions.has(path.extname(entry.name))) {
    continue;
  }
  if (copiedNames.has(entry.name)) {
    continue;
  }
  // electron-builder NSIS / similar: "<Product> Setup <version>.ext" or UML-Editor-Setup-*.ext
  if (!/ Setup \d/.test(entry.name) && !/^UML-Editor-Setup-/i.test(entry.name)) {
    continue;
  }
  fs.unlinkSync(path.join(root, entry.name));
  console.log(`Removed stale installer ${entry.name}`);
}

if (installers.length === 0) {
  console.log(`No installer artifacts found for "${productName}" ${version}.`);
} else if (installers.length > 1) {
  console.warn(`Copied ${installers.length} installer artifacts for "${productName}".`);
}
