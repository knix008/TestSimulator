const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web-dist');

async function main() {
  execSync('node scripts/build-renderer.js', { cwd: root, stdio: 'inherit' });

  await fs.remove(out);
  await fs.ensureDir(out);

  await fs.copy(path.join(root, 'src/renderer/css'), path.join(out, 'css'));
  await fs.copy(path.join(root, 'src/renderer/shared'), path.join(out, 'shared'));
  await fs.copy(path.join(root, 'assets/icons'), path.join(out, 'assets/icons'));
  await fs.copy(path.join(root, 'src/renderer/js/app.bundle.js'), path.join(out, 'js/app.bundle.js'));
  if (await fs.pathExists(path.join(root, 'src/renderer/js/app.bundle.js.map'))) {
    await fs.copy(
      path.join(root, 'src/renderer/js/app.bundle.js.map'),
      path.join(out, 'js/app.bundle.js.map')
    );
  }
  await fs.copy(
    path.join(root, 'node_modules/@xterm/xterm/css/xterm.css'),
    path.join(out, 'vendor/xterm.css')
  );

  let html = await fs.readFile(path.join(root, 'src/renderer/index.html'), 'utf8');
  html = html
    .replace('../../node_modules/@xterm/xterm/css/xterm.css', './vendor/xterm.css')
    .replace('../../assets/icons/icon.png', './assets/icons/icon.png')
    .replace('src="../../assets/icons/icon.png"', 'src="./assets/icons/icon.png"');
  await fs.writeFile(path.join(out, 'index.html'), html);

  console.log(`Web build ready: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
