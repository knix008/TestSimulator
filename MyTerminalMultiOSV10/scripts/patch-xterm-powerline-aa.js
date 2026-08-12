/**
 * xterm powerline tip maintenance:
 * 1) Restore upstream atlas bg if an old AA patch is still present.
 * 2) Slightly overdraw the solid right triangle (U+E0B0) vertically so
 *    transparent end tips (esp. red/magenta) fill the cell top/bottom like green.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const atlasTarget = path.join(
  root,
  'node_modules/@xterm/addon-canvas/lib/addon-canvas.js'
);

const atlasPatched =
  '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency&&!e)return n.NULL_COLOR;';
const atlasUpstream =
  '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency)return n.NULL_COLOR;';

if (fs.existsSync(atlasTarget)) {
  let src = fs.readFileSync(atlasTarget, 'utf8');
  if (src.includes(atlasPatched)) {
    fs.writeFileSync(atlasTarget, src.replace(atlasPatched, atlasUpstream), 'utf8');
    console.log('[patch-xterm-powerline] restored upstream atlas background');
  } else if (src.includes(atlasUpstream)) {
    console.log('[patch-xterm-powerline] atlas upstream OK');
  } else {
    console.warn('[patch-xterm-powerline] atlas snippet not found — skip');
  }
} else {
  console.warn('[patch-xterm-powerline] addon-canvas not found, skip atlas');
}

/** Upstream solid right tip (normalized 0–1). */
const TIP_PATH_UPSTREAM = 'M0,0 L1,.5 L0,1';
/** Overdraw ~8% past top/bottom; clip keeps edges filled after AA. */
const TIP_PATH_OVERDRAW = 'M0,-.08 L1,.5 L0,1.08';

const tipTargets = [
  path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'),
  path.join(root, 'node_modules/@xterm/addon-canvas/lib/addon-canvas.js'),
  path.join(root, 'node_modules/@xterm/addon-webgl/src/CustomGlyphs.ts'),
  path.join(
    root,
    'node_modules/@xterm/xterm/src/browser/renderer/shared/CustomGlyphs.ts'
  ),
];

for (const target of tipTargets) {
  if (!fs.existsSync(target)) {
    console.warn('[patch-xterm-powerline] missing', path.relative(root, target));
    continue;
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes(TIP_PATH_OVERDRAW)) {
    console.log(
      '[patch-xterm-powerline] tip overdraw OK:',
      path.relative(root, target)
    );
    continue;
  }
  if (!src.includes(TIP_PATH_UPSTREAM)) {
    console.warn(
      '[patch-xterm-powerline] tip path not found:',
      path.relative(root, target)
    );
    continue;
  }
  src = src.replace(TIP_PATH_UPSTREAM, TIP_PATH_OVERDRAW);
  fs.writeFileSync(target, src, 'utf8');
  console.log(
    '[patch-xterm-powerline] overdrew E0B0 tip:',
    path.relative(root, target)
  );
}
