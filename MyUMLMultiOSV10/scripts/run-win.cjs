const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const distEntry = path.join(root, 'dist', 'app', 'index.html');
const forceRebuild = process.env.FORCE_REBUILD === '1'
  || process.argv.slice(2).includes('--rebuild');

const watchRoots = [
  path.join(root, 'src'),
  path.join(root, 'electron'),
  path.join(root, 'index.html'),
  path.join(root, 'package.json'),
  path.join(root, 'vite.config.ts'),
  path.join(root, 'tsconfig.json'),
  path.join(root, 'assets', 'app-icon.ico'),
  path.join(root, 'assets', 'app-icon.svg'),
  path.join(root, 'assets', 'project-icon.ico'),
  path.join(root, 'assets', 'project-icon.svg')
];

function latestMtime(entryPath) {
  let latest = 0;
  const stack = [entryPath];

  while (stack.length > 0) {
    const current = stack.pop();
    let stats;
    try {
      stats = fs.statSync(current);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      let children;
      try {
        children = fs.readdirSync(current);
      } catch {
        continue;
      }
      for (const child of children) {
        if (child === 'node_modules' || child === 'dist' || child === 'release' || child === '.git') {
          continue;
        }
        stack.push(path.join(current, child));
      }
      continue;
    }

    if (stats.isFile()) {
      latest = Math.max(latest, stats.mtimeMs);
    }
  }

  return latest;
}

function needsRebuild() {
  if (forceRebuild) {
    return true;
  }

  if (!fs.existsSync(distEntry)) {
    return true;
  }

  const distTime = fs.statSync(distEntry).mtimeMs;
  const sourceTime = Math.max(0, ...watchRoots.map(latestMtime));
  return sourceTime > distTime;
}

if (needsRebuild()) {
  console.log(forceRebuild ? 'Rebuilding (forced)...' : 'Source changed — rebuilding...');
  const build = process.platform === 'win32'
    ? spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  if (build.error) {
    console.error(build.error.message);
    process.exit(1);
  }

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
} else {
  console.log('Build is up to date — skipping rebuild.');
}

// Close a previously running source-run window so the current UI is loaded.
if (process.platform === 'win32') {
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Where-Object { $_.CommandLine -like '*MyUMLMultiOSV10*' -or $_.CommandLine -like '*my-uml-multi-os*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    ],
    { stdio: 'ignore' }
  );
}

let electronPath;
try {
  electronPath = require('electron');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const appProcess = spawn(electronPath, ['.'], {
  cwd: root,
  detached: true,
  env: { ...process.env, MY_UML_SOURCE_RUN: '1' },
  stdio: 'ignore'
});

appProcess.unref();
