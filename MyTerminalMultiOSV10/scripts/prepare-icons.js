const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const srcPng = path.join(root, 'assets/icons/icon.png');
const buildDir = path.join(root, 'build');
const linuxIcons = path.join(buildDir, 'icons');

async function main() {
  if (!fs.existsSync(srcPng)) {
    throw new Error(`Missing icon: ${srcPng}`);
  }

  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(linuxIcons, { recursive: true });
  fs.copyFileSync(srcPng, path.join(buildDir, 'icon.png'));
  fs.copyFileSync(srcPng, path.join(root, 'assets/icons/icon.png'));

  const ico = await pngToIco(srcPng);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  fs.writeFileSync(path.join(root, 'assets/icons/icon.ico'), ico);

  // Linux icon sizes (same source; electron-builder scales as needed).
  [16, 32, 48, 64, 128, 256, 512].forEach((size) => {
    fs.copyFileSync(srcPng, path.join(linuxIcons, `${size}x${size}.png`));
  });

  console.log('Icons prepared in build/ and assets/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
