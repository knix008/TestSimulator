// Linux installers (.deb, .rpm, .AppImage) from Windows or macOS with Docker:
// the project is copied into a Debian container that has Rust, Node.js and the
// Tauri Linux libraries, `npm run build:linux` runs there, and the installers
// land in release/ here. Caches (cargo registry, target) live in Docker volumes,
// so the second run is much faster.
//
//   node scripts/build-linux-docker.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });

const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (docker.status !== 0) {
  console.error('Docker 가 실행 중이 아닙니다. Docker Desktop 을 켠 뒤 다시 실행하세요.');
  process.exit(1);
}

const script = [
  'set -e',
  'export DEBIAN_FRONTEND=noninteractive',
  'apt-get update -qq',
  'apt-get install -y -qq libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf rpm libssl-dev file curl xdg-utils ca-certificates >/dev/null',
  'if ! command -v node >/dev/null; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null; fi',
  'mkdir -p /work && cd /src',
  'tar --exclude=./node_modules --exclude=./src-tauri/target --exclude=./release --exclude=./dist --exclude=./test-results --exclude="./MyPhotoManager-*" -cf - . | (cd /work && tar xf -)',
  'cd /work',
  'npm ci --no-audit --no-fund',
  'npm run build:linux',
  'cp release/*.deb release/*.rpm release/*.AppImage /out/',
  'ls -la /out',
].join('\n');

const args = [
  'run', '--rm',
  '-v', `${root}:/src:ro`,
  '-v', `${release}:/out`,
  '-v', 'myphotomanager-cargo:/usr/local/cargo/registry',
  '-v', 'myphotomanager-target:/work/src-tauri/target',
  '-e', 'APPIMAGE_EXTRACT_AND_RUN=1',
  'rust:1-bookworm',
  'bash', '-c', script,
];
console.log('> docker run rust:1-bookworm … npm run build:linux');
const result = spawnSync('docker', args, { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of fs.readdirSync(release).filter((f) => /\.(deb|rpm|AppImage)$/.test(f))) fs.copyFileSync(path.join(release, file), path.join(root, file));
console.log('리눅스 설치 파일을 release/ 에 만들었습니다.');
