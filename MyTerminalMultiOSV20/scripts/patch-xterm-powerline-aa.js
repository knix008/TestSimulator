/**
 * xterm powerline tip maintenance (prestart):
 * 1) Restore upstream atlas bg if an old AA patch is still present.
 * 2) Overdraw E0B0 path vertically so tip triangles fill the cell.
 * 3) Force full-cell atlas bounds for restricted powerline glyphs so
 *    content-based crop/offset cannot shrink tips (esp. vs green).
 * 4) Strip any leftover red/magenta Y/height nudges (they are undone by
 *    atlas offset and make tips shorter).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function write(p, s) {
  fs.writeFileSync(p, s, 'utf8');
}

// --- 1) Atlas restore ---
{
  const target = path.join(root, 'node_modules/@xterm/addon-canvas/lib/addon-canvas.js');
  if (fs.existsSync(target)) {
    let src = read(target);
    const patched =
      '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency&&!e)return n.NULL_COLOR;';
    const upstream =
      '_getBackgroundColor(e,t,i,s){if(this._config.allowTransparency)return n.NULL_COLOR;';
    if (src.includes(patched)) {
      write(target, src.replace(patched, upstream));
      console.log('[patch-xterm-powerline] restored upstream atlas background');
    } else if (src.includes(upstream)) {
      console.log('[patch-xterm-powerline] atlas upstream OK');
    } else {
      console.warn('[patch-xterm-powerline] atlas snippet not found — skip');
    }
  }
}

// --- 2) E0B0 vertical overdraw (all tips) ---
{
  const TIP_PATH_UPSTREAM = 'M0,0 L1,.5 L0,1';
  const TIP_PATH_OVERDRAW = 'M0,-.12 L1,.5 L0,1.12';
  const tipTargets = [
    path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'),
    path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs'),
    path.join(root, 'node_modules/@xterm/addon-canvas/lib/addon-canvas.js'),
    path.join(root, 'node_modules/@xterm/addon-webgl/src/CustomGlyphs.ts'),
    path.join(
      root,
      'node_modules/@xterm/xterm/src/browser/renderer/shared/CustomGlyphs.ts'
    ),
  ];
  for (const target of tipTargets) {
    if (!fs.existsSync(target)) continue;
    let src = read(target);
    if (src.includes(TIP_PATH_OVERDRAW)) {
      console.log('[patch-xterm-powerline] tip overdraw OK:', path.relative(root, target));
      continue;
    }
    const olds = ['M0,-.08 L1,.5 L0,1.08', TIP_PATH_UPSTREAM];
    let next = src;
    let replaced = false;
    for (const old of olds) {
      if (next.includes(old)) {
        next = next.replace(old, TIP_PATH_OVERDRAW);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      console.warn('[patch-xterm-powerline] tip path not found:', path.relative(root, target));
      continue;
    }
    write(target, next);
    console.log('[patch-xterm-powerline] overdrew E0B0 tip:', path.relative(root, target));
  }
}

// --- 3) Strip leftover red/magenta draw nudges → baseline draw ---
const baselineMjs =
  'let A=ce?0:rt*2,se=!1;this._config.customGlyphs!==!1&&(se=yn(this._tmpCtx,a,A,A,this._config.deviceCellWidth,this._config.deviceCellHeight,this._config.fontSize,this._config.devicePixelRatio));';
const baselineJs =
  'const U=I?0:4;let k=!1;!1!==this._config.customGlyphs&&(k=(0,n.tryDrawCustomChar)(this._tmpCtx,c,U,U,this._config.deviceCellWidth,this._config.deviceCellHeight,this._config.fontSize,this._config.devicePixelRatio));';

const stripSpecs = [
  {
    file: path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs'),
    strip:
      /let A=ce\?0:rt\*2,(?:me\/\*myterm-rm-(?:nudge|fill|bottom|shift)\*\/=A,)?(?:mh\/\*myterm-rm-(?:fill|bottom|shift)\*\/=this\._config\.deviceCellHeight;)?ce&&\(16777216===W\|\|33554432===W\)&&\(1===S\|\|5===S\|\|9===S\|\|13===S\)&&\([^;]+\);let se=!1;this\._config\.customGlyphs!==!1&&\(se=yn\(this\._tmpCtx,a,A,(?:A|me),this\._config\.deviceCellWidth,(?:this\._config\.deviceCellHeight|mh),this\._config\.fontSize,this\._config\.devicePixelRatio\)\);/,
    baseline: baselineMjs,
  },
  {
    file: path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'),
    strip:
      /const U=I\?0:4;let (?:\$\/\*myterm-rm-(?:nudge|fill|bottom|shift)\*\/=U,)?mh\/\*myterm-rm-(?:fill|bottom|shift)\*\/=this\._config\.deviceCellHeight;I&&\(16777216===A\|\|33554432===A\)&&\(1===L\|\|5===L\|\|9===L\|\|13===L\)&&\([^;]+\);let k=!1;!1!==this\._config\.customGlyphs&&\(k=\(0,n\.tryDrawCustomChar\)\(this\._tmpCtx,c,U,(?:U|\$),this\._config\.deviceCellWidth,(?:this\._config\.deviceCellHeight|mh),this\._config\.fontSize,this\._config\.devicePixelRatio\)\);/,
    baseline: baselineJs,
  },
];

for (const { file, strip, baseline } of stripSpecs) {
  if (!fs.existsSync(file)) continue;
  let src = read(file);
  if (strip.test(src)) {
    write(file, src.replace(strip, baseline));
    console.log(
      '[patch-xterm-powerline] stripped rm nudge:',
      path.relative(root, file)
    );
  } else if (src.includes(baseline)) {
    console.log(
      '[patch-xterm-powerline] draw baseline OK:',
      path.relative(root, file)
    );
  } else {
    console.warn(
      '[patch-xterm-powerline] draw baseline not found:',
      path.relative(root, file)
    );
  }
}

// --- 4) Full-cell bbox for restricted powerline glyphs ---
const fullcellMarker = 'myterm-fullcell';
const bboxSpecs = [
  {
    file: path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs'),
    from: '_findGlyphBoundingBox(e,t,n,s,o,r){t.top=0;let a=s?this._config.deviceCellHeight:this._tmpCanvas.height,l=s?this._config.deviceCellWidth:n,u=!1;',
    to: `_findGlyphBoundingBox(e,t,n,s,o,r){t.top=0;let a=s?this._config.deviceCellHeight:this._tmpCanvas.height,l=s?this._config.deviceCellWidth:n;if(s/*${fullcellMarker}*/){t.left=0,t.right=l-1,t.bottom=a-1;return{texturePage:0,texturePosition:{x:0,y:0},texturePositionClipSpace:{x:0,y:0},size:{x:l,y:a},sizeClipSpace:{x:l,y:a},offset:{x:-t.left+r+(s||o?Math.floor((this._config.deviceCellWidth-this._config.deviceCharWidth)/2):0),y:-t.top+r+(s||o?this._config.lineHeight===1?0:Math.round((this._config.deviceCellHeight-this._config.deviceCharHeight)/2):0)}}}let u=!1;`,
  },
  {
    file: path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'),
    from: '_findGlyphBoundingBox(e,t,i,s,n,r){t.top=0;const o=s?this._config.deviceCellHeight:this._tmpCanvas.height,a=s?this._config.deviceCellWidth:i;let l=!1;',
    to: `_findGlyphBoundingBox(e,t,i,s,n,r){t.top=0;const o=s?this._config.deviceCellHeight:this._tmpCanvas.height,a=s?this._config.deviceCellWidth:i;if(s/*${fullcellMarker}*/){t.left=0,t.right=a-1,t.bottom=o-1;return{texturePage:0,texturePosition:{x:0,y:0},texturePositionClipSpace:{x:0,y:0},size:{x:a,y:o},sizeClipSpace:{x:a,y:o},offset:{x:-t.left+r+(s||n?Math.floor((this._config.deviceCellWidth-this._config.deviceCharWidth)/2):0),y:-t.top+r+(s||n?1===this._config.lineHeight?0:Math.round((this._config.deviceCellHeight-this._config.deviceCharHeight)/2):0)}}}let l=!1;`,
  },
];

for (const { file, from, to } of bboxSpecs) {
  if (!fs.existsSync(file)) {
    console.warn('[patch-xterm-powerline] missing', path.relative(root, file));
    continue;
  }
  let src = read(file);
  if (src.includes(fullcellMarker)) {
    console.log(
      '[patch-xterm-powerline] full-cell bbox OK:',
      path.relative(root, file)
    );
    continue;
  }
  if (!src.includes(from)) {
    console.warn(
      '[patch-xterm-powerline] bbox needle not found:',
      path.relative(root, file)
    );
    continue;
  }
  write(file, src.replace(from, to));
  console.log(
    '[patch-xterm-powerline] applied full-cell bbox:',
    path.relative(root, file)
  );
}

// --- 5) Long (two-cell) powerline arrow: U+E0D0 (left half) + U+E0D1 (tip) ---
// MyTerminal draws segment ends with this pair so the tip protrudes twice as
// far as the single-cell E0B0. Both are inside xterm's powerline range
// (E0A4-E0D6), so they get powerline placement; the halves meet at x=1 / x=0
// (y .19 / .81, the same vertical overdraw as E0B0).
{
  const E0B0 = String.fromCharCode(0xe0b0);
  const E0D0 = String.fromCharCode(0xe0d0);
  const E0D1 = String.fromCharCode(0xe0d1);
  const tipDef = 'M0,-.12 L1,.5 L0,1.12';
  // The .mjs build keys the table with escaped "" strings, the .js builds with raw characters.
  const variants = [
    { key: (ch) => ch, label: 'raw' },
    { key: (ch) => '\\u' + ch.charCodeAt(0).toString(16).toUpperCase(), label: 'escaped' },
  ];
  const targets = [
    path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js'),
    path.join(root, 'node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs'),
    path.join(root, 'node_modules/@xterm/addon-canvas/lib/addon-canvas.js'),
  ];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const src = read(target);
    let done = false;
    for (const v of variants) {
      const anchor = `"${v.key(E0B0)}":{d:"${tipDef}",type:0,rightPadding:2},`;
      const marker = `"${v.key(E0D0)}":{d:"M0,-.12 L1,.19 L1,.81 L0,1.12",type:0}`;
      if (src.includes(marker)) {
        console.log('[patch-xterm-powerline] long arrow OK:', path.relative(root, target));
        done = true;
        break;
      }
      if (!src.includes(anchor)) continue;
      const defs = `${marker},"${v.key(E0D1)}":{d:"M0,.19 L1,.5 L0,.81",type:0,rightPadding:2},`;
      write(target, src.replace(anchor, anchor + defs));
      console.log(`[patch-xterm-powerline] added long arrow glyphs (${v.label}):`, path.relative(root, target));
      done = true;
      break;
    }
    if (!done) console.warn('[patch-xterm-powerline] long arrow anchor not found:', path.relative(root, target));
  }
}
