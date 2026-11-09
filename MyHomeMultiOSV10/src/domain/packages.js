// Packages: tools the program fetches from the internet when they are first needed, instead of
// carrying them in the installer. Each is a set of browser builds from the npm registry's CDN
// (jsDelivr, with unpkg as the second address), checked against its SHA-256 before it is kept.
// The code editor uses them: Prettier tidies HTML, CSS and JavaScript; JSHint and HTMLHint check
// JavaScript and HTML. Without them everything else works; the editor says what is missing.
//
// Pure data and arithmetic: platform/packages.js downloads, keeps and loads them.

export const PACKAGES = [
  {
    id: 'prettier',
    name: 'Prettier',
    version: '3.3.3',
    ko: '코드 정리 (HTML · CSS · JavaScript 들여쓰기와 줄 바꿈)',
    en: 'Code formatting (indentation and line breaks for HTML, CSS and JavaScript)',
    license: 'MIT',
    homepage: 'https://prettier.io',
    globals: ['prettier', 'prettierPlugins'],
    files: [
      { name: 'standalone.js', path: 'prettier@3.3.3/standalone.js', size: 79270, sha256: '0127d72f138eec832f4068ab60f4531d24d3060b0ece9739cc36b91b1c1d7dd4' },
      { name: 'plugins/html.js', path: 'prettier@3.3.3/plugins/html.js', size: 151970, sha256: '86dedc37483a899fb86729ffb929865b5c5c1d22538412e43cd8d73c83cad340' },
      { name: 'plugins/postcss.js', path: 'prettier@3.3.3/plugins/postcss.js', size: 151337, sha256: 'cb13d68446c453654c00a2e95b9449bc4a22cff6a8f58ab1ff3e174339d744a2' },
      { name: 'plugins/babel.js', path: 'prettier@3.3.3/plugins/babel.js', size: 313919, sha256: '3a8bf48f17fc69ca14a8b41032ef4d14343be2dba186c44aa6f467e97b78f65a' },
      { name: 'plugins/estree.js', path: 'prettier@3.3.3/plugins/estree.js', size: 199072, sha256: 'e8085abd6f2573d71a8149bc7c6c9f709d18b32681ff0b0a4a568a418320fb4c' },
    ],
  },
  {
    id: 'jshint',
    name: 'JSHint',
    version: '2.13.6',
    ko: 'JavaScript 검사 (문법 오류와 실수를 줄 번호와 함께)',
    en: 'JavaScript check (syntax errors and slips, with line numbers)',
    license: 'MIT',
    homepage: 'https://jshint.com',
    globals: ['JSHINT'],
    files: [
      { name: 'jshint.js', path: 'jshint@2.13.6/dist/jshint.js', size: 1286205, sha256: '0ec5d400207b5447ab927c05bfb3cec3020b46a1de97d98b7a36011d93a7531f' },
    ],
  },
  {
    id: 'htmlhint',
    name: 'HTMLHint',
    version: '1.1.4',
    ko: 'HTML 검사 (닫히지 않은 태그, 중복 id, 빠진 속성)',
    en: 'HTML check (unclosed tags, duplicate ids, missing attributes)',
    license: 'MIT',
    homepage: 'https://htmlhint.com',
    globals: ['HTMLHint'],
    files: [
      { name: 'htmlhint.min.js', path: 'htmlhint@1.1.4/dist/htmlhint.min.js', size: 30565, sha256: 'cb524b496b103a3225991aa36235958950ec7eb69da3889159fddb0dee513116' },
    ],
  },
];

/** Where a file comes from: the first address, then the second when the first fails or gives the wrong bytes. */
export const PACKAGE_MIRRORS = ['https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/'];

export const packageById = (id) => PACKAGES.find((pkg) => pkg.id === id) ?? null;

export const packageSize = (pkg) => pkg.files.reduce((sum, file) => sum + file.size, 0);

/** The addresses of one file, in the order they are tried. `base` (tests) replaces the real ones. */
export const fileUrls = (file, base = null) => (base ? [`${String(base).replace(/\/?$/, '/')}${file.path}`] : PACKAGE_MIRRORS.map((mirror) => mirror + file.path));

/** Downloaded share 0…1 of a package from the bytes of its files so far (a file never counts for more than its size). */
export function packageProgress(pkg, received = {}) {
  const total = packageSize(pkg);
  if (!total) return 1;
  const done = pkg.files.reduce((sum, file) => sum + Math.min(file.size, Math.max(0, Number(received[file.name]) || 0)), 0);
  return Math.min(1, done / total);
}

/** The state of a package as kept: installed only when every file is there at the version this program wants. */
export function packageState(pkg, meta) {
  if (!meta) return 'missing';
  if (meta.version !== pkg.version) return 'outdated';
  if (pkg.files.some((file) => !meta.files?.includes(file.name))) return 'missing';
  return 'installed';
}

/** Hex SHA-256 of bytes (Web Crypto, in every window and in Node). */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bytes as "1.2 MB" / "300 KB". */
export const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
