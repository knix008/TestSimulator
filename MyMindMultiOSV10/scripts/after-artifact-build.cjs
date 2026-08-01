// electron-builder hook: copy every produced installer artifact to the project
// root, regardless of how the build was invoked (npm script or electron-builder
// directly). Runs after all artifacts for the current target are built.
const fs = require('node:fs')
const path = require('node:path')

const INSTALLER = /\.(exe|dmg|AppImage|deb)$/i

exports.default = async function afterAllArtifactBuild(context) {
  const root = process.cwd()
  const artifacts = context.artifactPaths || []
  for (const src of artifacts) {
    if (!INSTALLER.test(src) || src.endsWith('.blockmap')) continue
    const dest = path.join(root, path.basename(src))
    if (path.resolve(src) === path.resolve(dest)) continue
    fs.copyFileSync(src, dest)
    console.log(`[after-artifact-build] copied -> ${path.basename(dest)}`)
  }
  return []
}
