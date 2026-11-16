# MyAgents

A no-code / low-code **AI agent builder** for Windows, macOS, Linux (Tauri 2) and the web. Agents are workflows
drawn on a canvas — triggers, LLM and agent nodes with tools, knowledge search (RAG), branches, loops, code,
HTTP, files, commands and human approval — and every run is shown live on the canvas.
노드를 끌어다 놓아 AI 에이전트를 만들고 실행 과정을 눈으로 보는 노코드 빌더 — 데스크톱과 웹.

- How it is put together: [ARCHITECTURE.md](ARCHITECTURE.md)
- How to use it: [USERSGUIDE.md](USERSGUIDE.md) (한국어 / English); the same pages are in the app (Help › User's guide)

## Features

- **Canvas editor**: 70 node types in 10 groups, drag from the palette (open / close all groups), connect ports,
  box selection, copy/paste, Undo/Redo, auto arrange that wraps a long flow into rows shaped like the screen,
  fit (centred both ways), a faint 5 × 5 grid on the rulers, minimap, sticky notes, "describe it"
- **Input and output in many formats**: Read (file, URL, text, the previous step) and Save nodes for text,
  Markdown, HTML, CSV, JSON, PDF (Korean included), Word (.docx), Excel (.xlsx) and pictures — no extra programs;
  Convert, table, calculated column, pick, flatten; picture analysis with every vision-capable provider
- **Print**: its own window with printer, copies, paper, orientation, margins, scale, colour, header/footer and a
  live preview (overview, flow diagram laid out for the paper, nodes and settings, the last run); prints straight
  to the chosen printer on the desktop, or saves a PDF
- **Runs you can see**: nodes glow while running, turn green/red/orange, data dots travel along edges, loop counts,
  tool calls above agent nodes; a timeline with a time bar per step and each step's input, output and log
- **AI**: Anthropic Claude (official SDK), OpenAI, Google Gemini, Ollama (installed, started and given models from
  the app when they are missing), Cursor (Cloud Agents API), any OpenAI-compatible server, and an offline test
  model; agents with built-in tools, graph nodes as tools (multi-agent), conversation memory
- **Developer tools**: JavaScript code node, `{{ expressions }}` with filters and live previews, HTTP, webhooks,
  JSON, shell commands, pinned outputs, "run to here", retries / timeouts / error ports
- **Office work**: 95 templates (15 end-to-end workflows, 40 developer, 40 office), approval and form steps,
  form / folder-watch / after-another-agent triggers, chat tester, schedules; a result window when a run ends
- **Knowledge bases**: local BM25 search (Korean-aware), files, pasted text, web pages
- **Storage**: plain JSON files in the data folder; agents export as `.myagent`

## Requirements

- Node.js ≥ 22.13, npm
- Desktop builds: Rust (stable) and the Tauri 2 prerequisites of your OS (WebView2 on Windows)
- Headless Edge or Chrome for the browser tests and `npm run build:icons`

## Run

| command | what it does |
| --- | --- |
| `npm install` | dependencies |
| `npm start` | the desktop app in development: Vite on a free port (from 5560) + `tauri dev`; the app starts its own core (`node server/desktop.js`) |
| `npm run dev:web` | the web UI in development: a web core (`server/web.js`, data in `data/`) and Vite on free ports |
| `npm run web` | the web server: serves `dist/` and the API (`npm run build:web` first); `--password <pw>` to require a password |

Ports are always free ones (checked on 127.0.0.1 and ::1): a server another program runs is never reused or stopped.

## Build

| command | output |
| --- | --- |
| `npm run build:web` | `dist/` — the web app (served by `server/web.js`) |
| `npm run build:win` / `build:mac` / `build:linux` | the installer; the core and a Node runtime are bundled (`npm run stage`) |
| `npm run build:icons` | app and document icons from `assets/*.svg` |
| `npm run build:docs` | `public/doc/` help pages from `USERSGUIDE.md` |

## Test

`npm test` runs every category and prints a colour summary table (details in `test-results/`):

| category | what |
| --- | --- |
| core | expressions, the engine (branches, loops, merge, retries, error ports, pins, approval, cancel), every node type against a local HTTP server, the four model APIs against local stand-ins (tool-call round trips), knowledge, schedules, every template in both languages, the HTTP API, webhooks, the event stream, web password |
| ui | icons, texts, canvas geometry, auto layout, run timeline, the vertical start page, settings |
| i18n | every used text exists in Korean and English |
| rust | the Tauri shell's unit tests |
| web | the real app in headless Edge with a web core: start page, canvas editing by pointer, runs on the canvas, approval, chat, views, popups, and every command |
| desktop (`--desktop`) | the same in the real debug exe (WebView2), popups as OS windows |

`npm test -- --only core,web`, `--skip rust`, `--quick`, `--desktop`.
