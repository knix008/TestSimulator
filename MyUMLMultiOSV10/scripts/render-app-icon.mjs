/**
 * Renders assets/app-icon.svg into a multi-size Windows .ico.
 * Run: node scripts/render-app-icon.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'assets', 'app-icon.svg');
const icoPath = join(root, 'assets', 'app-icon.ico');

execSync('npm install --no-save --no-package-lock @resvg/resvg-js png-to-ico', {
  cwd: root,
  stdio: 'inherit'
});

const require = createRequire(import.meta.url);
const { Resvg } = require(join(root, 'node_modules', '@resvg/resvg-js'));
const pngToIcoModule = require(join(root, 'node_modules', 'png-to-ico'));
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default;

const svg = readFileSync(svgPath);
const sizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = sizes.map((size) => {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)'
  });
  return Buffer.from(resvg.render().asPng());
});

const ico = await pngToIco(pngBuffers);
writeFileSync(icoPath, ico);
console.log('Wrote', icoPath, `(${ico.length} bytes)`);
