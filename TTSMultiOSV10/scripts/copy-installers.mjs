import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const args = process.argv.slice(2);
const platformIndex = args.findIndex((arg) => arg === '--platform');
const platform = platformIndex >= 0 ? args[platformIndex + 1] : null;

const platformMatchers = {
  win: ['.exe', '.msi'],
  mac: ['.dmg', '.pkg'],
  linux: ['.AppImage', '.deb', '.rpm', '.snap'],
};

function isInstallerFile(fileName) {
  const ext = path.extname(fileName);
  if (platform && platformMatchers[platform]) {
    return platformMatchers[platform].includes(ext);
  }
  return Object.values(platformMatchers).some((extensions) => extensions.includes(ext));
}

async function main() {
  try {
    const distEntries = await fs.readdir(distDir, { withFileTypes: true });
    const installers = distEntries
      .filter((entry) => entry.isFile() && isInstallerFile(entry.name))
      .map((entry) => path.join(distDir, entry.name));

    if (!installers.length) {
      console.log('[copy-installers] 복사할 설치 파일을 찾지 못했습니다.');
      return;
    }

    await Promise.all(
      installers.map(async (srcPath) => {
        const destPath = path.join(projectRoot, path.basename(srcPath));
        await fs.copyFile(srcPath, destPath);
        console.log(`[copy-installers] copied: ${path.relative(projectRoot, srcPath)} -> ${path.basename(destPath)}`);
      })
    );

    console.log(`[copy-installers] 총 ${installers.length}개 설치 파일을 루트로 복사했습니다.`);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.log('[copy-installers] dist 폴더가 없어 복사를 건너뜁니다.');
      return;
    }
    console.error('[copy-installers] 설치 파일 복사 중 오류:', error);
    process.exitCode = 1;
  }
}

main();
