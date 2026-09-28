const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const release = path.join(root, 'release')
if (!fs.existsSync(release)) process.exit(0)
for (const name of fs.readdirSync(release)) {
  if (/\.(exe|dmg|AppImage|deb|rpm)$/i.test(name)) {
    fs.copyFileSync(path.join(release, name), path.join(root, name))
    console.log('copied', name)
  }
}
