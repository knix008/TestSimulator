/**
 * afterAllArtifactBuild hook — copies the produced installer(s) to dist/installers/
 * with a clean, versioned name for easy distribution.
 */
const fs = require('fs');
const path = require('path');

module.exports = function (context) {
  const outDir = path.join(__dirname, '..', 'dist', 'installers');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const artifacts = context.artifactPaths || [];
  const wanted = /\.(exe|dmg|AppImage|deb)$/i;
  const copied = [];
  for (const p of artifacts) {
    if (!wanted.test(p)) continue;
    const dest = path.join(outDir, path.basename(p));
    try { fs.copyFileSync(p, dest); copied.push(path.basename(p)); } catch (e) {
      console.warn('설치 파일 복사 실패:', p, e.message);
    }
  }
  if (copied.length) console.log('설치 파일 복사됨 → dist/installers/\n  ' + copied.join('\n  '));
  return [];
};
