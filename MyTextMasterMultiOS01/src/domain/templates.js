// "New" on the start page and in File › New from template: a document kind and its first text,
// in the UI language. {date} becomes today's date.
const today = () => new Date().toISOString().slice(0, 10);

export const TEMPLATES = [
  { id: 'markdown', kind: 'markdown', icon: 'mdFile', ko: ['빈 Markdown', '제목 하나로 시작하는 .md 문서'], en: ['Blank Markdown', 'A .md document with one heading'],
    text: { ko: '# 제목\n\n', en: '# Title\n\n' } },
  { id: 'html', kind: 'html', icon: 'htmlFile', ko: ['빈 HTML', 'HTML5 기본 뼈대'], en: ['Blank HTML', 'The HTML5 skeleton'],
    text: { ko: html5('새 문서', 'ko', '<h1>새 문서</h1>\n    <p>내용을 입력하세요.</p>'), en: html5('New document', 'en', '<h1>New document</h1>\n    <p>Start typing here.</p>') } },
  { id: 'text', kind: 'text', icon: 'txtFile', ko: ['빈 텍스트', '서식 없는 .txt 문서'], en: ['Blank text', 'A plain .txt document'], text: { ko: '', en: '' } },
  { id: 'readme', kind: 'markdown', icon: 'userGuide', ko: ['README', '프로젝트 소개·설치·사용법'], en: ['README', 'Project intro, install and usage'],
    text: {
      ko: '# 프로젝트 이름\n\n한 줄로 프로젝트를 소개합니다.\n\n## 기능\n\n- 기능 1\n- 기능 2\n\n## 설치\n\n```bash\nnpm install\n```\n\n## 사용법\n\n```bash\nnpm start\n```\n\n## 라이선스\n\nMIT\n',
      en: '# Project name\n\nOne line about the project.\n\n## Features\n\n- Feature 1\n- Feature 2\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\n```bash\nnpm start\n```\n\n## License\n\nMIT\n',
    } },
  { id: 'meeting', kind: 'markdown', icon: 'calendar', ko: ['회의록', '참석자·안건·결정·할 일'], en: ['Meeting notes', 'Attendees, agenda, decisions, actions'],
    text: {
      ko: '# 회의록 — {date}\n\n**참석자:** \n**장소:** \n\n## 안건\n\n1. \n2. \n\n## 논의 내용\n\n\n## 결정 사항\n\n- \n\n## 할 일\n\n- [ ] 담당자 — 내용 (기한)\n- [ ] \n',
      en: '# Meeting notes — {date}\n\n**Attendees:** \n**Location:** \n\n## Agenda\n\n1. \n2. \n\n## Discussion\n\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] Owner — task (due)\n- [ ] \n',
    } },
  { id: 'blog', kind: 'markdown', icon: 'edit', ko: ['블로그 글', '머리말(front matter)이 있는 글'], en: ['Blog post', 'A post with front matter'],
    text: {
      ko: '---\ntitle: 글 제목\ndate: {date}\ntags: [메모, 일상]\n---\n\n# 글 제목\n\n도입 문단을 씁니다.\n\n## 본문\n\n> 인용문\n\n![그림 설명](image.png)\n\n## 마무리\n\n',
      en: '---\ntitle: Post title\ndate: {date}\ntags: [notes, life]\n---\n\n# Post title\n\nAn opening paragraph.\n\n## Body\n\n> A quote\n\n![Picture](image.png)\n\n## Wrap-up\n\n',
    } },
  { id: 'todo', kind: 'markdown', icon: 'listTask', ko: ['할 일 목록', '체크박스 목록'], en: ['To-do list', 'A checklist'],
    text: { ko: '# 할 일 — {date}\n\n## 오늘\n\n- [ ] \n- [ ] \n\n## 이번 주\n\n- [ ] \n\n## 완료\n\n- [x] 할 일 목록 만들기\n', en: '# To do — {date}\n\n## Today\n\n- [ ] \n- [ ] \n\n## This week\n\n- [ ] \n\n## Done\n\n- [x] Make a to-do list\n' } },
  { id: 'changelog', kind: 'markdown', icon: 'recent', ko: ['변경 기록', 'Keep a Changelog 형식'], en: ['Changelog', 'Keep a Changelog format'],
    text: { ko: '# 변경 기록\n\n## [Unreleased]\n\n### 추가\n\n- \n\n### 수정\n\n- \n\n## [1.0.0] - {date}\n\n### 추가\n\n- 첫 출시\n', en: '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- \n\n### Fixed\n\n- \n\n## [1.0.0] - {date}\n\n### Added\n\n- First release\n' } },
  { id: 'webpage', kind: 'html', icon: 'globe', ko: ['웹 페이지', '머리글·본문·바닥글과 스타일'], en: ['Web page', 'Header, main, footer and a style'],
    text: { ko: webpage('ko', '내 웹 페이지', '소개', '여기에 내용을 씁니다.'), en: webpage('en', 'My web page', 'About', 'Write the content here.') } },
  { id: 'letter', kind: 'text', icon: 'notes', ko: ['편지', '날짜·인사·본문·맺음말'], en: ['Letter', 'Date, greeting, body, closing'],
    text: { ko: '{date}\n\n받는 분께,\n\n안녕하세요.\n\n\n\n감사합니다.\n\n보내는 사람 드림\n', en: '{date}\n\nDear ,\n\n\n\nKind regards,\n\n\n' } },
];

function html5(title, lang, body) {
  return `<!doctype html>\n<html lang="${lang}">\n  <head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <title>${title}</title>\n  </head>\n  <body>\n    ${body}\n  </body>\n</html>\n`;
}

function webpage(lang, title, about, text) {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; color: #1d2433; background: #f5f7fb; }
      header { padding: 48px 24px; text-align: center; color: #fff; background: linear-gradient(135deg, #3a6cf0, #7b5cff); }
      main { max-width: 760px; margin: 32px auto; padding: 0 24px; }
      section { padding: 20px 24px; margin-bottom: 18px; border-radius: 12px; background: #fff; box-shadow: 0 4px 16px rgba(20, 30, 60, 0.08); }
      footer { padding: 24px; text-align: center; color: #667085; }
    </style>
  </head>
  <body>
    <header>
      <h1>${title}</h1>
    </header>
    <main>
      <section>
        <h2>${about}</h2>
        <p>${text}</p>
      </section>
    </main>
    <footer>© {date}</footer>
  </body>
</html>
`;
}

export const templateById = (id) => TEMPLATES.find((template) => template.id === id);

/** The template's text in the language, with today's date filled in. */
export const templateText = (template, language) => (template.text[language] ?? template.text.ko).replaceAll('{date}', today());
