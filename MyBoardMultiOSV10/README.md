# MyBoard

Kanban boards and issue tracking for Windows, macOS, Linux (Tauri 2) and the web, storing its data in SQLite,
MySQL, MariaDB, PostgreSQL or SQL Server through a Node core. 칸반 보드와 이슈 관리 — 데스크톱(Windows·macOS·Linux)과 웹.

- How it is put together: [ARCHITECTURE.md](ARCHITECTURE.md) (the contract between the core, the API and the UI)
- How to use it: [USERSGUIDE.md](USERSGUIDE.md) (한국어 / English); the same pages are in the app (Help › User's guide)

## Requirements

- Node.js ≥ 22.13 (`node:sqlite`), npm
- Desktop builds: Rust (stable) and the Tauri 2 prerequisites of your OS (WebView2 on Windows)
- Headless Edge or Chrome for the browser tests and `npm run build:icons`

## Run

| command | what it does |
|---|---|
| `npm install` | dependencies |
| `npm start` | the desktop app in development: Vite on a free port (from 5520) + `tauri dev`; the app starts its own core (`node server/desktop.js`) |
| `npm run dev:web` | the web UI in development: a web core (`server/web.js`, data in `data/`) and Vite on free ports, Vite proxying `/api` and `/api/live` |
| `npm run web` | the web server: serves `dist/` and the API (`npm run build:web` first) |
| `npm run dev` | Vite alone (the UI shows "core not reachable" without a core) |

Ports are always free ones (checked on 127.0.0.1 and ::1): a server another program runs is never reused or stopped.

## Build

| command | output |
|---|---|
| `npm run build:web` | `dist/` (the web UI) |
| `npm run build:win` / `build:mac` / `build:linux` | installers in `release/` and the project root (`MyBoard-Setup-<version>.exe`, `.dmg`, `.deb`/`.rpm`/`.AppImage`) |
| `npm run stage` | `src-tauri/runtime/`: the Node executable + the core bundled by esbuild (`desktop.cjs`); build:* runs it |
| `npm run build:icons` | app icon (3D tile with a kanban board) and the `.myboard` document icon from `assets/*.svg` |
| `npm run build:docs` | `public/doc/` help pages from `USERSGUIDE.md` and the tutorial steps |
| `npm run clean` / `clean:all` | removes build output, test results (and `node_modules/`) — never the database |

The installed app needs no Node.js: it carries its own (`runtime/`). Never run `vite build` while a Tauri build is
compiling (the program would embed an empty page; `build.mjs` checks it).

## Test

`npm test` runs every category with a coloured line per test, a summary table and a saved report
(`test-results/results.json`, `test-results/report.txt`):

| category | what |
|---|---|
| core | `test/core` — database layer, services, query language, API (also `npm run test:core`) |
| ui | `test/unit` — icons, IconRefs, icon picker, emoji, texts, no leftovers |
| i18n | every text key in Korean and English (`npm run i18n:check`) |
| rust | `cargo test --lib` (core start-up, files, fonts, window place, several copies) |
| web | headless Edge on the real shell (its own Vite and web core on free ports) |
| tutorial | every tutorial step in the real app |
| desktop | opt-in: `npm run test:desktop` (the debug exe from `npm start`, WebView2 over CDP) |

`npm test -- --quick` runs core, ui, i18n and rust only; `--only web` / `--skip rust` pick categories.

## Layout

```
core/        Node core: database dialects, schema, services, query language (ARCHITECTURE §1–3)
server/      HTTP API, desktop entry (desktop.js), web server (web.js)
src/         UI shell (vanilla JS + Vite), forked from MySketchBook: see ARCHITECTURE "UI shell"
src-tauri/   Tauri 2 shell: windows, popups as OS windows, the core process (core.rs)
scripts/     start, dev-web, build, stage-runtime, render-icons, build-docs, test, smoke-web, clean
test/        core/ (core), unit/ (UI), e2e/ (browser and desktop)
assets/      icon sources (icon.svg, project.svg) and rendered icons
public/      favicon and the generated help pages (doc/)
```
