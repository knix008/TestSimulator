const fs = require('fs');
const path = require('path');
const { readFile, writeFile } = require('fs/promises');
const rcedit = require('rcedit');
const { computeData } = require('app-builder-lib/out/asar/integrity');
const { NtExecutable, NtExecutableResource, Resource } = require('resedit');

/**
 * Re-embed ASAR integrity after rcedit modifies the PE (rcedit runs in afterPack,
 * after electron-builder already added the INTEGRITY resource).
 */
async function refreshWinAsarIntegrity(executablePath, asarIntegrity) {
  const buffer = await readFile(executablePath);
  const executable = NtExecutable.from(buffer);
  const resource = NtExecutableResource.from(executable);
  const versionInfo = Resource.VersionInfo.fromEntries(resource.entries);

  if (versionInfo.length !== 1) {
    throw new Error(`Failed to parse version info in ${executablePath}`);
  }

  const languages = versionInfo[0].getAllLanguagesForStringValues();
  if (languages.length !== 1) {
    throw new Error(`Failed to locate languages in ${executablePath}`);
  }

  resource.entries = resource.entries.filter(
    (entry) => !(entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR')
  );

  const integrityList = Array.from(Object.entries(asarIntegrity)).map(([file, { algorithm: alg, hash: value }]) => ({
    file,
    alg,
    value
  }));

  resource.entries.push({
    type: 'INTEGRITY',
    id: 'ELECTRONASAR',
    bin: Buffer.from(JSON.stringify(integrityList)),
    lang: languages[0].lang,
    codepage: languages[0].codepage
  });

  resource.outputResource(executable);
  await writeFile(executablePath, Buffer.from(executable.generate()));
}

/**
 * Embed app icon and version metadata into the Windows executable.
 * Used instead of signAndEditExecutable (which pulls winCodeSign and can fail on symlink creation).
 */
async function embedWinExeIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const { packager, appOutDir } = context;
  const appInfo = packager.appInfo;
  const exePath = path.join(appOutDir, `${appInfo.productFilename}.exe`);

  if (!fs.existsSync(exePath)) {
    console.warn(`[embed-win-exe-icon] Executable not found: ${exePath}`);
    return;
  }

  const iconPath = await packager.getIconPath();
  if (!iconPath || !fs.existsSync(iconPath)) {
    console.warn('[embed-win-exe-icon] icon.ico not found; skipping embed');
    return;
  }

  const versionStrings = {
    FileDescription: appInfo.description || appInfo.productName,
    ProductName: appInfo.productName,
    LegalCopyright: appInfo.copyright || ''
  };

  if (appInfo.companyName) {
    versionStrings.CompanyName = appInfo.companyName;
  }

  const internalName = path.basename(exePath, '.exe');
  versionStrings.InternalName = internalName;
  versionStrings.OriginalFilename = '';

  const fileVersion = appInfo.shortVersion || appInfo.buildVersion;
  const productVersion = appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm();

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': versionStrings,
    'file-version': fileVersion,
    'product-version': productVersion
  });

  const resourcesPath = path.join(appOutDir, 'resources');
  const asarIntegrity = await computeData({
    resourcesPath,
    resourcesRelativePath: 'resources'
  });
  await refreshWinAsarIntegrity(exePath, asarIntegrity);

  const icuPath = path.join(appOutDir, 'icudtl.dat');
  if (!fs.existsSync(icuPath)) {
    console.warn(`[embed-win-exe-icon] icudtl.dat missing beside executable: ${icuPath}`);
  }

  console.log(`[embed-win-exe-icon] Embedded icon into ${exePath}`);
}

module.exports = embedWinExeIcon;
module.exports.default = embedWinExeIcon;
