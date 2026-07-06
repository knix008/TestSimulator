const path = require('path');
const { generateAppIcons } = require('./generate-app-icon');

const buildDir = path.join(__dirname, '..', 'build');

async function main() {
  const result = await generateAppIcons({ buildDir });
  console.log(`[sync-build-assets] icon.ico (${result.appResult}): ${result.iconIco}`);
  console.log(`[sync-build-assets] icon.png: ${result.iconPng}`);
  console.log(`[sync-build-assets] icon.icns: ${result.iconIcns}`);
  console.log(`[sync-build-assets] wsp.ico (${result.wspResult}): ${result.wspIco}`);
  console.log(`[sync-build-assets] wsp.icns: ${result.wspIcns}`);
  console.log(`[sync-build-assets] Build assets ready in ${buildDir}`);
}

main().catch((error) => {
  console.error('[sync-build-assets]', error);
  process.exit(1);
});
