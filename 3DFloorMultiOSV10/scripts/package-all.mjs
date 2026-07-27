import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseRoot = path.join(root, 'release');

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

fs.mkdirSync(releaseRoot, { recursive: true });

const failures = [];
const tasks = [
  ['node', ['scripts/dist-desktop.mjs', 'auto']],
];

if (process.platform === 'win32' || process.platform === 'darwin') {
  // Attempt Linux packages from non-Linux hosts when tooling allows
  tasks.push(['node', ['scripts/dist-desktop.mjs', 'linux']]);
}

tasks.push(['node', ['scripts/package-web.mjs']]);

for (const [cmd, args] of tasks) {
  try {
    run(cmd, args);
  } catch (err) {
    console.warn(String(err.message || err));
    failures.push(`${cmd} ${args.join(' ')}`);
  }
}

const files = fs.existsSync(releaseRoot)
  ? fs.readdirSync(releaseRoot).filter((name) => name !== 'README.md' && name !== 'INSTALLERS.md')
  : [];

const manifest = `# FloorPlanTo3D installers

Generated on: ${new Date().toISOString()}
Host platform: ${process.platform}

## Artifacts currently in \`release/\`

${files.length ? files.map((f) => `- \`${f}\``).join('\n') : '- (none yet)'}

## Expected matrix

| Platform | Command | Typical files |
|---|---|---|
| Windows | \`npm run dist:win\` | \`FloorPlanTo3D-*-Setup-win-x64.exe\`, \`FloorPlanTo3D-*-portable-win-x64.exe\` |
| macOS | \`npm run dist:mac\` | \`FloorPlanTo3D-*-mac-*.dmg\`, \`*.zip\` (build on macOS) |
| Linux | \`npm run dist:linux\` | \`FloorPlanTo3D-*-linux-*.AppImage\`, \`*.deb\` |
| Web | \`npm run dist:web\` | \`web/FloorPlanTo3D-*-web.zip\` |

## Notes
- Desktop builds stage in a temp directory then copy into \`release/\` (avoids file-lock issues under some IDEs).
- macOS installers must be built on a Mac.
- Unsigned builds may show OS security prompts on first launch.
${failures.length ? `\n## Warnings\n${failures.map((f) => `- ${f}`).join('\n')}\n` : ''}
`;

fs.writeFileSync(path.join(releaseRoot, 'INSTALLERS.md'), manifest);
console.log(`\nWrote ${path.join(releaseRoot, 'INSTALLERS.md')}`);
