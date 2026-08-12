/**
 * Previously patched addon-canvas atlas AA for powerline tips. That change
 * corrupted glyph rendering with allowTransparency, so the patch is no longer
 * applied. This script only restores the upstream snippet if an old patch
 * is still present (e.g. after switching branches).
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '../node_modules/@xterm/addon-canvas/lib/addon-canvas.js'
);

if (!fs.existsSync(target)) {
  console.warn('[patch-xterm-powerline-aa] addon-canvas not found, skip');
  process.exit(0);
}

const src = fs.readFileSync(target, 'utf8');
const patched =
  '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency&&!e)return n.NULL_COLOR;';
const upstream =
  '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency)return n.NULL_COLOR;';

if (src.includes(patched)) {
  fs.writeFileSync(target, src.replace(patched, upstream), 'utf8');
  console.log('[patch-xterm-powerline-aa] restored upstream atlas background');
  process.exit(0);
}

if (src.includes(upstream)) {
  console.log('[patch-xterm-powerline-aa] upstream OK (no patch)');
  process.exit(0);
}

console.warn('[patch-xterm-powerline-aa] expected atlas snippet not found — skip');
