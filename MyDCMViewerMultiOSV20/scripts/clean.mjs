// clean.mjs — delete build outputs so the next build starts from scratch.
//
//   npm run clean              dist/, src-tauri/target, src-tauri/resources, src-tauri/gen/schemas,
//                              installers copied to the project root, test scratch folders
//   npm run clean -- --all     the same plus node_modules/ (run `npm install` afterwards)
//   npm run clean -- --dry-run list what would be deleted without deleting it
//
// Source files, samples/, doc/ and the user's settings are never touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run') || args.has('-n');
const ALL = args.has('--all');

const targets = [
  'dist',
  'dist-web',
  'release',
  'out',
  'src-tauri/target',
  'src-tauri/resources',
  'src-tauri/gen/schemas',
  'test/tmp',
  'test/fixtures/generated',
];
if (ALL) targets.push('node_modules');

// Installers that scripts/platform-build.mjs copies to the project root
const INSTALLER = /^MyDCMViewer_.*\.(exe|msi|dmg|AppImage|deb|rpm)$/;
for (const f of fs.readdirSync(ROOT)) if (INSTALLER.test(f)) targets.push(f);

const size = (p) => {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  let n = 0;
  for (const c of fs.readdirSync(p)) { try { n += size(path.join(p, c)); } catch { /* vanished / locked */ } }
  return n;
};
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

let total = 0, failed = 0, removed = 0;
for (const rel of targets) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const bytes = size(p);
  if (DRY) { console.log(`  would delete ${rel} (${mb(bytes)})`); total += bytes; removed++; continue; }
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    console.log(`  deleted ${rel} (${mb(bytes)})`);
    total += bytes; removed++;
  } catch (e) {
    failed++;
    console.error(`  could not delete ${rel}: ${e.code || e.message}${e.code === 'EBUSY' || e.code === 'EPERM' ? ' — is MyDCMViewer (npm start) still running?' : ''}`);
  }
}
console.log(removed
  ? `${DRY ? 'Would free' : 'Freed'} ${mb(total)} in ${removed} item(s).`
  : 'Nothing to clean.');
if (failed) process.exit(1);
