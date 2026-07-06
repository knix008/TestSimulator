const fs = require('fs');
const path = require('path');

const WIN_TEMPLATE_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  'MyWorkspaceWinV10',
  'src',
  'MyWorkspace.Win',
  'Templates',
  'Pages'
);
const BUNDLED_TEMPLATE_ROOT = path.join(__dirname, '..', 'src', 'renderer', 'templates', 'pages');

function copyDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }
    if (entry.name.endsWith('.mdtemplate')) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function syncLanguageDir(language) {
  const sourceDir = path.join(WIN_TEMPLATE_ROOT, language);
  const targetDir = path.join(BUNDLED_TEMPLATE_ROOT, language);
  if (!fs.existsSync(sourceDir)) {
    console.warn(`[sync-page-templates] Missing source folder: ${sourceDir}`);
    return 0;
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  copyDir(sourceDir, targetDir);
  const count = fs.readdirSync(targetDir).filter((file) => file.endsWith('.mdtemplate')).length;
  console.log(`[sync-page-templates] ${language}: ${count} template(s)`);
  return count;
}

function main() {
  if (!fs.existsSync(WIN_TEMPLATE_ROOT)) {
    console.warn(`[sync-page-templates] WinV10 templates not found: ${WIN_TEMPLATE_ROOT}`);
    process.exit(0);
  }

  fs.mkdirSync(BUNDLED_TEMPLATE_ROOT, { recursive: true });
  const koCount = syncLanguageDir('ko');
  const enCount = syncLanguageDir('en');
  console.log(`[sync-page-templates] Done (${koCount + enCount} total).`);
}

main();
