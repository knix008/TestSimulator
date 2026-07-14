'use strict';
/**
 * Build a static browser package into dist-web/.
 * Usage: node scripts/build-web.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const OUT = path.join(ROOT, 'dist-web');

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function injectShim(html) {
  const shimTag = '<script src="./js/electron-api-shim.js"></script>\n';
  if (html.includes('electron-api-shim.js')) return html;
  if (html.includes('<script type="module" src="./js/app.js"></script>')) {
    return html.replace(
      '<script type="module" src="./js/app.js"></script>',
      `${shimTag}<script type="module" src="./js/app.js"></script>`
    );
  }
  return html.replace('</body>', `  ${shimTag}  <script type="module" src="./js/app.js"></script>\n</body>`);
}

function patchCsp(html) {
  // Allow blob media, wasm (mediainfo / Whisper), HF model download, same-origin fetch.
  return html.replace(
    /http-equiv="Content-Security-Policy"\s+content="[^"]*"/,
    `http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co blob: data:; img-src 'self' data: blob:; worker-src 'self' blob:;"`
  );
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[build:web] Renderer not found:', SRC);
    process.exit(1);
  }

  // Ensure Whisper browser build exists under renderer/vendor before copy
  try {
    require('./sync-transformers-vendor.js').main();
  } catch (err) {
    console.warn('[build:web] Transformers vendor sync failed:', err?.message || err);
  }

  console.log('[build:web] Cleaning dist-web/…');
  rmrf(OUT);
  console.log('[build:web] Copying renderer…');
  copyDir(SRC, OUT);

  const samplesSrc = path.join(ROOT, 'samples');
  if (fs.existsSync(samplesSrc)) {
    console.log('[build:web] Copying samples…');
    copyDir(samplesSrc, path.join(OUT, 'samples'));
  }

  const mediaInfoSrc = path.join(ROOT, 'node_modules', 'mediainfo.js', 'dist');
  if (fs.existsSync(mediaInfoSrc)) {
    console.log('[build:web] Copying mediainfo.js…');
    copyDir(mediaInfoSrc, path.join(OUT, 'mediainfo'));
  }

  const hlsSrc = path.join(ROOT, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  if (fs.existsSync(hlsSrc)) {
    console.log('[build:web] Copying hls.js…');
    fs.mkdirSync(path.join(OUT, 'hls'), { recursive: true });
    fs.copyFileSync(hlsSrc, path.join(OUT, 'hls', 'hls.min.js'));
    const worker = path.join(ROOT, 'node_modules', 'hls.js', 'dist', 'hls.worker.js');
    if (fs.existsSync(worker)) {
      fs.copyFileSync(worker, path.join(OUT, 'hls', 'hls.worker.js'));
    }
  }

  const indexPath = path.join(OUT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = patchCsp(html);
  html = injectShim(html);
  // Mark document for web styling hooks if needed
  html = html.replace('<body class="theme-dark">', '<body class="theme-dark is-web">');
  fs.writeFileSync(indexPath, html);

  const readme = `# AV Editor — Web Build

Serve this folder over HTTP (ES modules require a web server):

\`\`\`bash
npx --yes serve dist-web
# or
npx --yes http-server dist-web -p 4173
\`\`\`

Then open the printed URL in the browser.

## Notes
- Sample media under \`samples/\` appears in **Library** automatically when present.
- Use **Add media…** (+), toolbar Import, or drag files onto the left Library panel.
- Project Save downloads a \`.avp\` JSON file.
- Export is a placeholder in the web build.

## Stream links (YouTube / HTTPS / RTSP)

A static file server cannot resolve YouTube or convert RTSP. For full stream parity with Electron, run:

\`\`\`bash
npm run web
\`\`\`

That starts \`scripts/start-web.js\` with \`/api/media/*\` (YouTube proxy, HTTPS CORS proxy, RTSP→HLS via FFmpeg).
Set \`FFMPEG_PATH\` or install FFmpeg on PATH for RTSP.
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme);

  console.log('[build:web] Done → dist-web/');
  console.log('[build:web] Streams need: npm run web  (not a bare static server)');
  console.log('[build:web] Preview: npx --yes serve dist-web');
}

main();
