// Rewrites the feature table of docs/ACDSee-gap.md from test/features.mjs:
// every ACDSee feature with its ID and the tests that check it.
//
//   node scripts/feature-table.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, ID_PATTERN } from '../test/features.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = path.join(root, 'docs', 'ACDSee-gap.md');
const START = '<!-- feature-table:start -->';
const END = '<!-- feature-table:end -->';

const LABELS = { 'unit': '단위', 'static': '정적', 'desktop.suite': '데스크톱 E2E', 'web.suite': '웹 E2E', 'features.suite': '기능 E2E' };
const covered = new Map();
for (const folder of ['test/unit', 'test/static', 'test/e2e']) {
  for (const name of fs.readdirSync(path.join(root, folder))) {
    if (!/\.test\.js$|\.suite\.mjs$/.test(name) || name === 'features.test.js') continue;
    const kind = folder === 'test/e2e' ? LABELS[name.replace(/\.mjs$/, '')] : LABELS[folder.split('/')[1]];
    for (const id of new Set(fs.readFileSync(path.join(root, folder, name), 'utf8').match(ID_PATTERN) ?? [])) {
      if (!covered.has(id)) covered.set(id, new Set());
      covered.get(id).add(kind);
    }
  }
}

const AREAS = { BROWSE: '관리 · 탐색', ORG: '관리 · 정리·사람·비공개', META: '메타데이터', FILE: '파일·가져오기·공유', VIEW: '보기', EDIT: '현상·편집', CREATE: '만들기', BATCH: '일괄 처리', FMT: '형식', APP: '앱' };
const ORDER = ['단위', '정적', '웹 E2E', '데스크톱 E2E', '기능 E2E'];
let table = '';
let area = null;
for (const { id, title } of FEATURES) {
  const prefix = id.split('-')[0];
  if (prefix !== area) {
    area = prefix;
    table += `\n### ${AREAS[prefix]}\n\n| ID | 기능 | 테스트 |\n| --- | --- | --- |\n`;
  }
  const tests = [...(covered.get(id) ?? [])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  table += `| \`${id}\` | ${title} | ${tests.join(' · ') || '**없음**'} |\n`;
}

const text = fs.readFileSync(doc, 'utf8');
const block = `${START}\n${table}\n${END}`;
const next = text.includes(START) ? text.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block) : `${text.trimEnd()}\n\n${block}\n`;
fs.writeFileSync(doc, next);
console.log(`${FEATURES.length} features, ${FEATURES.filter((f) => covered.has(f.id)).length} with tests → docs/ACDSee-gap.md`);
