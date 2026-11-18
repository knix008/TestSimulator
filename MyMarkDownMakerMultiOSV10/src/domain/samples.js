// Sample document sets for the start page and the tutorial: a few Markdown files each, in Korean and in
// English, with headings at several levels, lists, a table, code and pictures — enough to see merging,
// numbering, the structure tree, the figure list and every export at work without picking files.
const svg = (label, color) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="480" height="240" rx="18" fill="url(#g)"/><rect x="40" y="150" width="60" height="60" rx="6" fill="#ffffff" opacity=".7"/><rect x="130" y="110" width="60" height="100" rx="6" fill="#ffffff" opacity=".7"/><rect x="220" y="70" width="60" height="140" rx="6" fill="#ffffff" opacity=".7"/><rect x="310" y="40" width="60" height="170" rx="6" fill="#ffffff" opacity=".7"/><text x="240" y="36" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#1f2937">${label}</text></svg>`,
)))}`;

const file = (relPath, content, day) => ({ relPath, name: relPath.split('/').pop(), content, mtime: Date.UTC(2026, 9, day) });

const SETS = {
  manual: {
    glyph: 'userGuide',
    ko: [
      file('01-시작하기.md', `# 시작하기\n\n이 설명서는 **샘플 앱**의 설치와 첫 실행을 안내합니다.\n\n## 설치\n\n1. 설치 파일을 내려받습니다.\n2. 설치 언어를 고르고 안내에 따라 설치합니다.\n3. 바탕 화면의 바로가기로 실행합니다.\n\n## 첫 화면\n\n시작 화면에서 최근 문서와 샘플을 바로 열 수 있습니다.\n\n![첫 화면 구성](${svg('첫 화면', '#60a5fa')})\n`, 1),
      file('02-기본-사용법.md', `# 기본 사용법\n\n## 문서 만들기\n\n새 문서는 *파일 › 새 문서* 로 만듭니다.\n\n### 저장\n\n\`Ctrl+S\` 로 저장합니다. 처음 저장할 때만 위치를 묻습니다.\n\n### 단축키\n\n| 기능 | 단축키 |\n| --- | --- |\n| 저장 | Ctrl+S |\n| 인쇄 | Ctrl+P |\n| 찾기 | Ctrl+F |\n\n## 내보내기\n\nHTML, PDF, Word 로 내보낼 수 있습니다.\n\n> 내보내기 글꼴과 표지는 설정에서 바꿉니다.\n`, 3),
      file('03-문제-해결.md', `# 문제 해결\n\n## 실행되지 않을 때\n\n- 다른 창이 실행 중인지 확인합니다.\n- 컴퓨터를 다시 시작합니다.\n\n## 로그 보기\n\n\`\`\`text\n%APPDATA%\\sample\\crash.log\n\`\`\`\n\n![로그 위치](${svg('로그', '#f472b6')})\n`, 5),
    ],
    en: [
      file('01-getting-started.md', `# Getting started\n\nThis guide covers installing the **sample app** and starting it for the first time.\n\n## Installing\n\n1. Download the installer.\n2. Pick the installer language and follow the steps.\n3. Start the app from the desktop shortcut.\n\n## The first screen\n\nThe start screen opens recent documents and samples at once.\n\n![The first screen](${svg('First screen', '#60a5fa')})\n`, 1),
      file('02-basics.md', `# Basics\n\n## Making a document\n\nMake a new document with *File › New document*.\n\n### Saving\n\nPress \`Ctrl+S\`. Only the first save asks where.\n\n### Shortcuts\n\n| Action | Keys |\n| --- | --- |\n| Save | Ctrl+S |\n| Print | Ctrl+P |\n| Find | Ctrl+F |\n\n## Exporting\n\nExport to HTML, PDF or Word.\n\n> The export font and the cover page are set in Settings.\n`, 3),
      file('03-troubleshooting.md', `# Troubleshooting\n\n## It does not start\n\n- Check whether another window is running.\n- Restart the computer.\n\n## Reading the log\n\n\`\`\`text\n%APPDATA%\\sample\\crash.log\n\`\`\`\n\n![Where the log is](${svg('Log', '#f472b6')})\n`, 5),
    ],
  },
  report: {
    glyph: 'viewReports',
    ko: [
      file('요약.md', `# 요약\n\n올해 3분기 매출은 전 분기보다 **12%** 늘었습니다.\n\n## 핵심 지표\n\n| 지표 | 2분기 | 3분기 |\n| --- | ---: | ---: |\n| 매출 | 120 | 134 |\n| 고객 수 | 830 | 905 |\n\n![분기별 매출](${svg('분기별 매출', '#34d399')})\n`, 2),
      file('분석.md', `# 분석\n\n## 성장 요인\n\n### 신규 고객\n\n신규 고객이 늘었습니다.\n\n### 재구매\n\n재구매율이 4%p 올랐습니다.\n\n## 위험 요인\n\n- 원자재 가격 상승\n- 환율 변동\n`, 4),
      file('제안.md', `# 제안\n\n## 다음 분기 계획\n\n1. 온라인 채널 확대\n2. 고객 지원 시간 연장\n\n## 예산\n\n추가 예산은 **5억 원** 입니다.\n`, 6),
    ],
    en: [
      file('summary.md', `# Summary\n\nThird-quarter revenue grew **12%** over the previous quarter.\n\n## Key figures\n\n| Figure | Q2 | Q3 |\n| --- | ---: | ---: |\n| Revenue | 120 | 134 |\n| Customers | 830 | 905 |\n\n![Revenue by quarter](${svg('Revenue by quarter', '#34d399')})\n`, 2),
      file('analysis.md', `# Analysis\n\n## What drove growth\n\n### New customers\n\nMore new customers signed up.\n\n### Repeat purchases\n\nThe repeat rate rose by 4 points.\n\n## Risks\n\n- Rising material prices\n- Exchange rates\n`, 4),
      file('proposal.md', `# Proposal\n\n## Next quarter\n\n1. Grow the online channels\n2. Longer support hours\n\n## Budget\n\nThe extra budget is **0.4 million USD**.\n`, 6),
    ],
  },
  api: {
    glyph: 'hyperlink',
    ko: [
      file('api/개요.md', `# API 개요\n\n모든 요청은 HTTPS 로 보냅니다.\n\n## 인증\n\n요청마다 \`Authorization\` 헤더에 토큰을 넣습니다.\n\n\`\`\`http\nGET /v1/items\nAuthorization: Bearer <token>\n\`\`\`\n`, 7),
      file('api/항목.md', `# 항목\n\n## 목록\n\n\`GET /v1/items\` 는 항목 목록을 돌려줍니다.\n\n## 만들기\n\n\`\`\`json\n{ "name": "새 항목", "price": 1000 }\n\`\`\`\n\n## 오류 코드\n\n| 코드 | 뜻 |\n| --- | --- |\n| 400 | 잘못된 요청 |\n| 404 | 없음 |\n`, 8),
      file('api/변경-기록.md', `# 변경 기록\n\n## 1.1\n\n- 항목 검색 추가\n\n## 1.0\n\n- 처음 공개\n`, 9),
    ],
    en: [
      file('api/overview.md', `# API overview\n\nEvery request goes over HTTPS.\n\n## Authentication\n\nPut the token in the \`Authorization\` header of each request.\n\n\`\`\`http\nGET /v1/items\nAuthorization: Bearer <token>\n\`\`\`\n`, 7),
      file('api/items.md', `# Items\n\n## Listing\n\n\`GET /v1/items\` returns the items.\n\n## Creating\n\n\`\`\`json\n{ "name": "New item", "price": 1000 }\n\`\`\`\n\n## Error codes\n\n| Code | Meaning |\n| --- | --- |\n| 400 | Bad request |\n| 404 | Not found |\n`, 8),
      file('api/changelog.md', `# Changelog\n\n## 1.1\n\n- Item search\n\n## 1.0\n\n- First release\n`, 9),
    ],
  },
};

export const SAMPLE_IDS = Object.keys(SETS);
export const sampleGlyph = (id) => SETS[id]?.glyph ?? 'samples';

/** The files of a sample set in a language: [{ key, name, relPath, mtime, content, sample: true }]. */
export function sampleFiles(id, language) {
  const set = SETS[id] ?? SETS.manual;
  return (language === 'en' ? set.en : set.ko).map((f) => ({ ...f, key: `sample:${id}:${f.relPath}`, fullPath: '', sample: true }));
}
