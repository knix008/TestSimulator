// Syncs public/favicon.svg from the app mark. Edit asset/app-icon.svg
// (and asset/tray-icon.svg) then run `node scripts/make-app-icon.mjs`.
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
copyFileSync(join(root, 'asset', 'app-icon.svg'), join(root, 'public', 'favicon.svg'))
console.log('wrote public/favicon.svg from asset/app-icon.svg')
console.log('rasters: node scripts/make-app-icon.mjs')
