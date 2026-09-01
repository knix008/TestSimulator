// electron-builder afterAllArtifactBuild hook.
// Copies the final installer(s) from dist/ up to the project top directory so
// the built file is easy to find (not buried under dist/).
const fs = require('fs');
const path = require('path');

// Only these are "final" installer artifacts worth copying to the top.
const INSTALLER_EXT = ['.exe', '.dmg', '.pkg', '.appimage', '.deb', '.rpm', '.snap', '.zip'];

module.exports = async function afterAllArtifactBuild(context) {
  const projectRoot = process.cwd(); // electron-builder runs from the project root
  const copied = [];

  for (const artifact of context.artifactPaths || []) {
    const ext = path.extname(artifact).toLowerCase();
    if (!INSTALLER_EXT.includes(ext)) continue;      // skip blockmap / yml / unpacked
    const dest = path.join(projectRoot, path.basename(artifact));
    if (path.resolve(artifact) === path.resolve(dest)) continue;
    fs.copyFileSync(artifact, dest);
    copied.push(path.basename(artifact));
    console.log(`  • copied installer to top dir: ${path.basename(artifact)}`);
  }

  if (!copied.length) console.log('  • afterAllArtifactBuild: no installer artifacts to copy');
  return []; // no extra artifacts contributed
};
