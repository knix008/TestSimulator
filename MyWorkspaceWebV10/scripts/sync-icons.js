const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const winRoot = path.resolve(__dirname, '..', '..', 'MyWorkspaceWinV10');
const iconProject = path.join(winRoot, 'tools', 'IconGenerator', 'IconGenerator.csproj');
const sourceIcons = path.join(winRoot, 'src', 'MyWorkspace.Win', 'Assets', 'Icons');
const targetIcons = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'icons');

function copyIcons() {
  if (!fs.existsSync(sourceIcons)) {
    console.warn('WinV10 icon folder not found. Run IconGenerator in MyWorkspaceWinV10 first.');
    return false;
  }

  fs.mkdirSync(targetIcons, { recursive: true });
  for (const sizeDir of fs.readdirSync(sourceIcons)) {
    const fromDir = path.join(sourceIcons, sizeDir);
    if (!fs.statSync(fromDir).isDirectory()) {
      continue;
    }
    const toDir = path.join(targetIcons, sizeDir);
    fs.mkdirSync(toDir, { recursive: true });
    for (const file of fs.readdirSync(fromDir)) {
      if (file.endsWith('.png')) {
        fs.copyFileSync(path.join(fromDir, file), path.join(toDir, file));
      }
    }
  }
  console.log(`Synced icons to ${targetIcons}`);
  backfillIconSizes();
  return true;
}

function backfillIconSizes() {
  for (const sourceSize of ['s16', 's20', 's28']) {
    const sourceDir = path.join(targetIcons, sourceSize);
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    for (const targetSize of ['s16', 's20', 's28']) {
      if (targetSize === sourceSize) {
        continue;
      }
      const targetDir = path.join(targetIcons, targetSize);
      fs.mkdirSync(targetDir, { recursive: true });
      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith('.png')) {
          continue;
        }
        const targetPath = path.join(targetDir, file);
        if (!fs.existsSync(targetPath)) {
          fs.copyFileSync(path.join(sourceDir, file), targetPath);
        }
      }
    }
  }
}

try {
  if (fs.existsSync(iconProject)) {
    console.log('Generating WinV10 icons...');
    execSync(`dotnet run --project "${iconProject}" -c Release`, {
      cwd: winRoot,
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.warn('Icon generation skipped:', error.message);
}

copyIcons();
