# MyChartMaster documents · 문서

| Document | 한국어 | English |
| --- | --- | --- |
| User's guide · 사용 설명서 — every window, menu, setting and shortcut | [UserGuide.md](UserGuide.md) | [UserGuide.en.md](UserGuide.en.md) |
| Tutorial · 튜토리얼 — 13 hands-on lessons with the sample charts | [Tutorial.md](Tutorial.md) | [Tutorial.en.md](Tutorial.en.md) |

- `images/ko/`, `images/en/` — the pictures of the documents, the same file names in both languages. They are taken
  from the real program by `npm run doc:images` (`scripts/doc-images.mjs`: builds the web app into a temporary
  folder and drives it in a headless Edge / Chrome). Options: `-- --lang ko`, `-- --only 04,export`.
- `npm run build:docs` turns these Markdown files into HTML pages in `docs/` (and `public/docs/` for the web build),
  which the program opens from **Help › User's Guide** and **Help › Tutorial Document**.

그림을 다시 찍으려면 `npm run doc:images`, HTML을 다시 만들려면 `npm run build:docs`를 실행하세요.
