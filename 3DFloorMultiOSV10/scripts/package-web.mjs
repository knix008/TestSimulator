import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release', 'web');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zipName = `FloorPlanTo3D-${version}-web.zip`;
const zipPath = path.join(releaseDir, zipName);
const rootZipPath = path.join(root, zipName);

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });

const readme = `# FloorPlanTo3D Web Package

Version: ${version}

## Install / Run

### Option A — Any static host
Upload the extracted folder contents to Nginx, Apache, GitHub Pages, S3, etc.

### Option B — Local preview (Node.js)
\`\`\`bash
npx --yes serve .
\`\`\`

### Option C — Python
\`\`\`bash
python -m http.server 8080
\`\`\`

Then open http://localhost:8080

## Notes
- This is a static SPA (Vite build). No server-side runtime is required.
- Optional Mask R-CNN API can still be configured in the app UI.
`;

fs.writeFileSync(path.join(distDir, 'WEB-INSTALL.txt'), readme);

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const isWin = process.platform === 'win32';
if (isWin) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: distDir, stdio: 'inherit' });
}

fs.writeFileSync(path.join(releaseDir, 'README.md'), readme);
fs.copyFileSync(zipPath, rootZipPath);
console.log(`Web package created: ${zipPath}`);
console.log(`Copied ${zipName} -> project root`);
