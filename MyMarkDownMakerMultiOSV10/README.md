# MyMarkDownMaker

Merge many Markdown files into one document, see its structure, number its headings, edit it, and export it
to Markdown, HTML, PDF or Word — with a cover, contents (dotted leaders and real page numbers), a list of
figures, headers, footers, page numbers and a logo. Windows, macOS, Linux (Tauri 2) and the web.

여러 Markdown 파일을 하나의 문서로 병합하고, 구조를 보며 번호를 매기고, 고치고, 표지·목차·그림 목차·머리글·
바닥글·로고와 함께 Markdown, HTML, PDF, Word 로 내보냅니다.

## Features

- **Collect**: add folders (with sub-folders) and files, drop them on the window; local pictures are embedded.
- **Merge**: ordered, ticked files; optional file-name headings; hierarchical numbering 1, 1.1, 1.1.1; edits by hand
  are kept (the merge stops and offers "Merge again").
- **Edit**: CodeMirror editor with Markdown colouring, formatting bar, find / replace, pictures shown inline (one
  character each, resize by dragging, picture menu, drag & drop from outside), side-by-side preview.
- **Structure / Figures** tabs, **Problems** (skipped heading levels, missing pictures, unclosed code blocks …).
- **Document**: cover (title, version, author, date, logo), contents and list of figures with centred-dot leaders and
  page numbers, each chapter on a new page, heading sizes per level, export font / size / line spacing, header,
  footer, page numbers, logo in headers / footers.
- **Export**: Markdown (pictures inside or as separate files), HTML, PDF (Windows: written directly), Word (.doc).
- **Print window**: printer, copies, colour, paper, orientation, margins, page range, live paginated preview;
  Print prints at once without the system dialog (Windows).
- **Shell** (MySketchBook style): menu bar as title bar, toolbar folding into », side and bottom panels, start page of
  movable cards over 16 moving document backgrounds, 20 dark + 20 light themes and a custom one, colourful icons,
  Korean / English, Undo / Redo of text and file-list changes, window place remembered, tutorial, user's guide.
- **Installer** (NSIS): Korean / English selector — the program starts in that language; an earlier installation is
  found and the user is asked whether to remove it and install again (and whether to delete the user data);
  desktop / Start menu shortcuts.

## Running

```bash
npm install
npm start            # the desktop app in development (Vite + tauri dev, a free port from 5610)
npm run dev          # the web version only (Vite)
npm test             # unit · texts · Rust · web E2E · tutorial (npm test -- --desktop adds the desktop E2E)
npm run build:win    # MyMarkDownMaker-Setup-<version>.exe in release/ and the project root
npm run build:mac / build:linux
npm run build:icons  # assets/icon.svg → every icon size and the installer pictures
npm run build:docs   # USERSGUIDE.md → public/doc/*.html (the help window and the installed guide)
```

See [USERSGUIDE.md](USERSGUIDE.md) for using it and [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built.

Copyright © 2026 SHKWON (<knix008@naver.com>) · MIT
