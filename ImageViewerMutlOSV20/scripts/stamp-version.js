/**
 * stamp-version.js — keep the build number in step with the build date.
 *
 * Writes today's date (YYYYMMDD) as `buildNumber` into package.json and src/version.json
 * (the about dialog / title bar read it) so a build never carries a stale number.
 * Run automatically by the build:* scripts; `node scripts/stamp-version.js --check` only prints.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

function update(file, mutate) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const data = JSON.parse(raw);
  const before = JSON.stringify(data);
  mutate(data);
  if (JSON.stringify(data) === before) return false;
  if (!check) fs.writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol);
  return true;
}

const pkgPath = path.join(ROOT, 'package.json');
const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
const changedPkg = update(pkgPath, (d) => { d.buildNumber = stamp; });
const changedVer = update(path.join(ROOT, 'src', 'version.json'), (d) => { d.version = version; d.buildNumber = stamp; });
console.log(`[stamp-version] ${version} build ${stamp}${changedPkg || changedVer ? (check ? ' (would update)' : ' (updated)') : ' (unchanged)'}`);
