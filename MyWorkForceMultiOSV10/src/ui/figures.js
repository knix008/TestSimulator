import { esc, L } from './bits.js';

const GUIDE = {
  시작하기: 'start',
  'Getting started': 'start',
  '화면 구성': 'shell',
  'The window': 'shell',
  '회사, 팀, 과제': 'home',
  'Company, teams and projects': 'home',
  '보드와 백로그': 'board',
  'Boards and backlog': 'board',
  '로드맵과 타임라인': 'roadmap',
  'Roadmap and timeline': 'roadmap',
  '작업 공간과 페이지': 'knowledge',
  'Workspaces and pages': 'knowledge',
  '댓글, 파일, 함께 쓰기': 'knowledge',
  'Comments, files and writing together': 'knowledge',
  '전체 검색': 'shell',
  'Search everything': 'shell',
  '알림과 Talk': 'shell',
  'Notifications and Talk': 'shell',
  'Reviewing the work': 'reports',
  WQL: 'wql',
  '파일 메뉴': 'files',
  'The File menu': 'files',
  '설정과 관리': 'settings',
  'Settings and administration': 'settings',
  '문제 해결': 'shell',
  Troubleshooting: 'shell',
  시작: 'start',
  Start: 'start',
  '튜토리얼과 예제': 'tutorial',
  'Tutorial and examples': 'tutorial',
  파일: 'files',
  Files: 'files',
  이슈: 'issues',
  Issues: 'issues',
  계획: 'board',
  Planning: 'board',
  살펴보기: 'reports',
  Review: 'reports',
  문서: 'documents',
  Documents: 'documents',
  설정: 'settings',
  Settings: 'settings',
  단축키: 'shortcuts',
  Shortcuts: 'shortcuts',
};

const WQL = {
  필드: 'wql-fields',
  Fields: 'wql-fields',
  연산: 'wql-ops',
  Operators: 'wql-ops',
  함수: 'wql-fn',
  Functions: 'wql-fn',
  기한: 'calendar',
  'Time limits': 'calendar',
  정렬: 'wql-order',
  Order: 'wql-order',
};

/** Pictures for the tutorial document's numbered chapters. */
const TUTORIAL_FIGURES = { 1: 'start', 2: 'tutorial', 3: 'board', 4: 'issues', 5: 'backlog', 6: 'roadmap', 7: 'knowledge', 8: 'knowledge', 9: 'shell', 10: 'home' };

const rect = (x, y, w, h, fill, rx = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;

function windowFrame(body) {
  return `${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(0, 0, 320, 18, '#d5e2f6', 0)}
    ${rect(8, 5, 28, 8, '#3a6cf0', 2)}${rect(40, 5, 16, 8, '#f59e0b', 2)}${rect(60, 5, 16, 8, '#30a46c', 2)}
    ${body}`;
}

const SCENES = {
  shell: () => windowFrame(`
    ${rect(0, 18, 54, 132, '#f8fafc', 0)}
    ${rect(8, 28, 38, 8, '#3a6cf0', 2)}${rect(8, 42, 38, 6, '#94a3b8', 2)}${rect(8, 54, 38, 6, '#94a3b8', 2)}${rect(8, 66, 38, 6, '#94a3b8', 2)}
    ${rect(64, 28, 70, 110, '#fff')}${rect(142, 28, 70, 110, '#fff')}${rect(220, 28, 86, 110, '#fff')}
    ${rect(72, 38, 54, 22, '#dbeafe', 3)}${rect(72, 66, 54, 22, '#fde68a', 3)}${rect(150, 38, 54, 22, '#bbf7d0', 3)}
    ${rect(228, 40, 70, 6, '#1e293b', 2)}${rect(228, 52, 70, 6, '#94a3b8', 2)}${rect(228, 68, 70, 16, '#e2e8f0', 3)}
  `),
  start: () => `
    ${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(12, 12, 296, 42, '#fff', 8)}
    ${rect(22, 22, 22, 22, '#3a6cf0', 6)}
    ${rect(52, 24, 90, 8, '#1e293b', 2)}${rect(52, 36, 120, 6, '#94a3b8', 2)}
    ${rect(12, 62, 92, 36, '#fff', 8)}${rect(112, 62, 92, 36, '#fff', 8)}${rect(212, 62, 96, 36, '#fff', 8)}
    ${rect(20, 72, 16, 16, '#f59e0b', 4)}${rect(120, 72, 16, 16, '#30a46c', 4)}${rect(220, 72, 16, 16, '#7c3aed', 4)}
    ${rect(12, 106, 296, 32, '#fff', 8)}
  `,
  tutorial: () => windowFrame(`
    ${rect(0, 18, 320, 132, '#f8fafc', 0)}
    ${rect(168, 48, 140, 78, '#fff', 8)}
    ${rect(178, 58, 70, 7, '#1e293b', 2)}
    ${rect(178, 72, 120, 5, '#94a3b8', 2)}${rect(178, 82, 100, 5, '#94a3b8', 2)}
    ${rect(248, 104, 48, 12, '#3a6cf0', 4)}
  `),
  home: () => windowFrame(`
    ${rect(14, 32, 140, 48, '#fff', 8)}${rect(164, 32, 140, 48, '#fff', 8)}
    ${rect(24, 42, 18, 18, '#f59e0b', 4)}${rect(174, 42, 18, 18, '#3a6cf0', 4)}
    ${rect(48, 44, 70, 7, '#1e293b', 2)}${rect(48, 56, 50, 5, '#94a3b8', 2)}
    ${rect(198, 44, 70, 7, '#1e293b', 2)}${rect(198, 56, 50, 5, '#94a3b8', 2)}
  `),
  board: () => windowFrame(`
    ${rect(12, 30, 92, 104, '#fff', 6)}${rect(112, 30, 92, 104, '#fff', 6)}${rect(212, 30, 92, 104, '#fff', 6)}
    ${rect(20, 38, 36, 8, '#94a3b8', 3)}${rect(120, 38, 36, 8, '#3a6cf0', 3)}${rect(220, 38, 36, 8, '#30a46c', 3)}
    ${rect(20, 54, 76, 24, '#dbeafe', 4)}${rect(20, 84, 76, 24, '#fde68a', 4)}
    ${rect(120, 54, 76, 24, '#e9d5ff', 4)}
    ${rect(220, 54, 76, 24, '#bbf7d0', 4)}${rect(220, 84, 76, 24, '#bbf7d0', 4)}
  `),
  backlog: () => windowFrame(`
    ${rect(12, 30, 296, 40, '#fff', 6)}${rect(20, 40, 80, 8, '#3a6cf0', 2)}${rect(200, 38, 40, 12, '#30a46c', 4)}
    ${rect(20, 54, 180, 6, '#e2e8f0', 2)}
    ${rect(12, 78, 296, 52, '#fff', 6)}${rect(20, 90, 80, 8, '#64748b', 2)}
    ${rect(20, 106, 200, 6, '#e2e8f0', 2)}${rect(20, 116, 160, 6, '#e2e8f0', 2)}
  `),
  roadmap: () => windowFrame(`
    ${rect(16, 36, 70, 8, '#7c3aed', 2)}${rect(96, 34, 200, 12, '#ede9fe', 4)}${rect(96, 34, 120, 12, '#7c3aed', 4)}
    ${rect(16, 64, 70, 8, '#3a6cf0', 2)}${rect(96, 62, 200, 12, '#dbeafe', 4)}${rect(96, 62, 70, 12, '#3a6cf0', 4)}
    ${rect(16, 92, 70, 8, '#30a46c', 2)}${rect(96, 90, 200, 12, '#dcfce7', 4)}${rect(96, 90, 180, 12, '#30a46c', 4)}
  `),
  issues: () => windowFrame(`
    ${rect(12, 28, 180, 12, '#fff', 4)}${rect(18, 31, 70, 6, '#64748b', 2)}
    ${rect(12, 46, 180, 18, '#fff', 3)}${rect(18, 51, 28, 8, '#3a6cf0', 2)}${rect(52, 52, 90, 6, '#1e293b', 2)}
    ${rect(12, 68, 180, 18, '#fff', 3)}${rect(18, 73, 28, 8, '#e5484d', 2)}${rect(52, 74, 80, 6, '#1e293b', 2)}
    ${rect(12, 90, 180, 18, '#fff', 3)}${rect(18, 95, 28, 8, '#f59e0b', 2)}${rect(52, 96, 100, 6, '#1e293b', 2)}
    ${rect(202, 28, 104, 100, '#fff', 6)}${rect(212, 40, 84, 8, '#1e293b', 2)}${rect(212, 56, 84, 28, '#e2e8f0', 4)}
  `),
  reports: () => windowFrame(`
    ${rect(20, 100, 16, 28, '#3a6cf0', 2)}${rect(44, 78, 16, 50, '#3a6cf0', 2)}${rect(68, 88, 16, 40, '#30a46c', 2)}
    ${rect(92, 64, 16, 64, '#3a6cf0', 2)}${rect(116, 84, 16, 44, '#30a46c', 2)}
    <circle cx="230" cy="84" r="36" fill="#dbeafe"/>
    <path d="M230 84 L230 48 A36 36 0 0 1 260 100 Z" fill="#3a6cf0"/>
    <path d="M230 84 L260 100 A36 36 0 0 1 206 108 Z" fill="#30a46c"/>
  `),
  knowledge: () => windowFrame(`
    ${rect(12, 28, 100, 106, '#fff', 6)}
    ${rect(22, 40, 70, 7, '#1e293b', 2)}${rect(32, 54, 58, 6, '#64748b', 2)}${rect(32, 66, 50, 6, '#64748b', 2)}
    ${rect(22, 84, 70, 7, '#f59e0b', 2)}
    ${rect(122, 28, 184, 106, '#fff', 6)}
    ${rect(134, 40, 120, 10, '#1e293b', 2)}${rect(134, 58, 156, 6, '#94a3b8', 2)}${rect(134, 70, 140, 6, '#94a3b8', 2)}${rect(134, 82, 150, 6, '#94a3b8', 2)}
  `),
  documents: () => `
    ${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(12, 14, 92, 58, '#fff', 8)}${rect(112, 14, 92, 58, '#fff', 8)}${rect(212, 14, 96, 58, '#fff', 8)}
    ${rect(22, 24, 16, 16, '#14b8a6', 4)}${rect(122, 24, 16, 16, '#3a6cf0', 4)}${rect(222, 24, 16, 16, '#f59e0b', 4)}
    ${rect(22, 46, 60, 6, '#1e293b', 2)}${rect(122, 46, 60, 6, '#1e293b', 2)}${rect(222, 46, 64, 6, '#1e293b', 2)}
    ${rect(12, 82, 296, 54, '#fff', 8)}${rect(24, 94, 140, 8, '#1e293b', 2)}${rect(24, 110, 220, 6, '#94a3b8', 2)}
  `,
  calendar: () => windowFrame(`
    ${rect(16, 32, 36, 40, '#fff', 4)}${rect(58, 32, 36, 40, '#fff', 4)}${rect(100, 32, 36, 40, '#fff', 4)}${rect(142, 32, 36, 40, '#fff', 4)}${rect(184, 32, 36, 40, '#fff', 4)}
    ${rect(226, 32, 36, 40, '#fee2e2', 4)}${rect(268, 32, 36, 40, '#fee2e2', 4)}
    ${rect(16, 86, 288, 40, '#fff', 6)}${rect(28, 100, 18, 14, '#f59e0b', 3)}${rect(54, 102, 120, 8, '#1e293b', 2)}
  `),
  settings: () => windowFrame(`
    ${rect(16, 30, 288, 28, '#fff', 6)}${rect(26, 40, 70, 8, '#64748b', 2)}${rect(220, 38, 28, 12, '#30a46c', 6)}
    ${rect(16, 66, 288, 28, '#fff', 6)}${rect(26, 76, 90, 8, '#64748b', 2)}
    ${rect(16, 102, 88, 28, '#fff', 6)}${rect(112, 102, 88, 28, '#fff', 6)}${rect(208, 102, 96, 28, '#fff', 6)}
    ${rect(28, 112, 16, 8, '#7c3aed', 2)}${rect(124, 112, 16, 8, '#3a6cf0', 2)}${rect(220, 112, 16, 8, '#eab308', 2)}
  `),
  files: () => windowFrame(`
    ${rect(16, 28, 160, 104, '#fff', 6)}
    ${rect(28, 40, 16, 12, '#30a46c', 3)}${rect(50, 42, 90, 7, '#1e293b', 2)}
    ${rect(28, 60, 16, 12, '#f59e0b', 3)}${rect(50, 62, 80, 7, '#1e293b', 2)}
    ${rect(28, 80, 16, 12, '#3a6cf0', 3)}${rect(50, 82, 96, 7, '#1e293b', 2)}
    ${rect(28, 100, 16, 12, '#14b8a6', 3)}${rect(50, 102, 70, 7, '#1e293b', 2)}
    ${rect(190, 40, 110, 70, '#fff', 6)}${rect(202, 54, 86, 8, '#1e293b', 2)}${rect(202, 70, 70, 6, '#94a3b8', 2)}
  `),
  shortcuts: () => `
    ${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(24, 36, 54, 28, '#fff', 6)}${rect(86, 36, 54, 28, '#fff', 6)}${rect(148, 36, 54, 28, '#3a6cf0', 6)}
    ${rect(36, 46, 30, 8, '#64748b', 2)}${rect(98, 46, 30, 8, '#64748b', 2)}${rect(160, 46, 30, 8, '#fff', 2)}
    ${rect(24, 78, 270, 16, '#fff', 4)}${rect(24, 102, 220, 16, '#fff', 4)}
    ${rect(36, 82, 40, 8, '#1e293b', 2)}${rect(36, 106, 70, 8, '#1e293b', 2)}
  `,
  wql: () => windowFrame(`
    ${rect(16, 36, 288, 28, '#fff', 6)}
    ${rect(26, 46, 12, 8, '#30a46c', 2)}${rect(46, 45, 180, 9, '#1e293b', 2)}
    ${rect(16, 76, 88, 48, '#fff', 6)}${rect(112, 76, 88, 48, '#fff', 6)}${rect(208, 76, 96, 48, '#fff', 6)}
    ${rect(26, 90, 60, 8, '#e5484d', 3)}${rect(122, 90, 60, 8, '#3a6cf0', 3)}${rect(218, 90, 70, 8, '#f59e0b', 3)}
  `),
  'wql-fields': () => `
    ${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(16, 24, 70, 22, '#dbeafe', 11)}${rect(94, 24, 78, 22, '#fde68a', 11)}${rect(180, 24, 70, 22, '#bbf7d0', 11)}
    ${rect(16, 58, 90, 22, '#e9d5ff', 11)}${rect(114, 58, 80, 22, '#fecaca', 11)}${rect(202, 58, 96, 22, '#cffafe', 11)}
    ${rect(16, 92, 120, 22, '#fff', 11)}${rect(144, 92, 70, 22, '#fff', 11)}${rect(222, 92, 80, 22, '#fff', 11)}
  `,
  'wql-ops': () => `
    ${rect(0, 0, 320, 150, '#e8eef8', 10)}
    ${rect(18, 40, 52, 36, '#fff', 8)}${rect(80, 40, 52, 36, '#fff', 8)}${rect(142, 40, 52, 36, '#fff', 8)}${rect(204, 40, 96, 36, '#fff', 8)}
    <text x="36" y="64" font-size="16" font-family="Segoe UI, sans-serif" fill="#3a6cf0">=</text>
    <text x="92" y="64" font-size="16" font-family="Segoe UI, sans-serif" fill="#e5484d">!=</text>
    <text x="160" y="64" font-size="16" font-family="Segoe UI, sans-serif" fill="#7c3aed">~</text>
    <text x="220" y="64" font-size="13" font-family="Segoe UI, sans-serif" fill="#0f766e">AND</text>
    ${rect(18, 92, 282, 28, '#fff', 6)}
  `,
  'wql-fn': () => windowFrame(`
    ${rect(20, 40, 130, 28, '#fff', 8)}${rect(160, 40, 140, 28, '#fff', 8)}
    ${rect(30, 50, 100, 8, '#3a6cf0', 2)}${rect(170, 50, 116, 8, '#30a46c', 2)}
    ${rect(20, 82, 120, 28, '#fff', 8)}${rect(30, 92, 80, 8, '#f59e0b', 2)}
  `),
  'wql-order': () => windowFrame(`
    ${rect(16, 32, 90, 96, '#fff', 6)}${rect(114, 32, 90, 96, '#fff', 6)}${rect(212, 32, 92, 96, '#fff', 6)}
    ${rect(26, 42, 40, 8, '#1e293b', 2)}<path d="M78 44 l6 8 h-12 z" fill="#3a6cf0"/>
    ${rect(124, 42, 40, 8, '#1e293b', 2)}<path d="M184 52 l6 -8 h-12 z" fill="#e5484d"/>
    ${rect(222, 42, 50, 8, '#1e293b', 2)}
    ${rect(26, 62, 70, 8, '#e2e8f0', 2)}${rect(26, 78, 60, 8, '#e2e8f0', 2)}${rect(26, 94, 66, 8, '#e2e8f0', 2)}
  `),
};

function plain(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** A small picture of one screen, used beside a guide, tutorial, or query section. */
export function figure(id, label, options = {}) {
  const draw = SCENES[id] || SCENES.shell;
  const caption = options.caption === false ? '' : `<figcaption>${esc(label)}</figcaption>`;
  return `<figure class="doc-figure"><svg viewBox="0 0 320 150" role="img" aria-label="${esc(label)}">${draw()}</svg>${caption}</figure>`;
}

/** Place a picture beside every section of a rendered guide or query page. */
export function illustrate(html, kind = 'guide') {
  const map = kind === 'wql' ? WQL : GUIDE;
  const fallback = kind === 'wql' ? 'wql' : 'shell';
  return String(html || '').split(/(?=<h2>)/).filter((chunk) => chunk.trim()).map((chunk) => {
    const title = plain(chunk.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] || '');
    // The tutorial's chapters are numbered ("3. …"): the number picks the picture.
    const id = kind === 'tutorial' ? (TUTORIAL_FIGURES[Number(/^(\d+)\./.exec(title)?.[1])] || 'start') : (map[title] || fallback);
    return `<section class="doc-block">${figure(id, title || (kind === 'wql' ? 'WQL' : 'MyWorkForce'))}<div class="doc-copy">${chunk}</div></section>`;
  }).join('');
}
