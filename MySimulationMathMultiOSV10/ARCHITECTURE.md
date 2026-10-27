# MySimulationMath — 구조 / Architecture

## 큰 그림 / Overview

```
┌──────────────────────── page (React, src/) ─────────────────────────┐
│ App.jsx: title bar + ribbon, Current Folder, document tabs          │
│ (editor · variables · figures · models), Command Window, Workspace, │
│ Command History, status bar                                         │
│        │ engine (src/engine/client.js)          │ fetch /api/*      │
│        ▼ postMessage + SharedArrayBuffer         ▼                  │
│ ┌──────────── Web Worker (src/engine/worker.js) ─────┐              │
│ │ router.js → core/session.js (M language)           │              │
│ │ ctx.fs = fs-http.js (synchronous XHR) ─────────────┼──┐           │
│ └────────────────────────────────────────────────────┘  │           │
└─────────────────────────────────────────────────────────┼───────────┘
                                                          ▼
              host API (CONTRACT §6): /api/fs/*, /api/host/info, /api/settings/*
              web:     server/fs-api.js (server/server.js, Vite middleware), jailed work folder
              desktop: src-tauri/src/host.rs (127.0.0.1, random port, bearer token)
```

- `core/` is platform-free ES modules (language, libraries, graphics, simulation). The app owns `core/fs-node.js` (Node file system for the CLI and tests).
- `src/engine/` is the bridge: `worker.js` (the Web Worker), `router.js` (message routing, testable in Node), `protocol.js` (SharedArrayBuffer reply channel, output batching, multi-line rule, file:line links), `fs-http.js` (synchronous file system over the host API), `client.js` (the `engine` object the GUI uses).
- `src/graphics/` (FigureArea) and `src/sim/` (ModelEditor) belong to other areas. `src/panes/Guarded.jsx` finds them with `import.meta.glob`, so the app builds and runs while either is missing and shows why in its tab.

## 엔진 메시지 / Engine messages (CONTRACT §8)

| GUI → engine | answer |
|---|---|
| `init { api: { base, token, system }, cwd, channel }` | `ready { ok, error, cwd, shared }` |
| `eval { id, code, opts }`, `runFile { id, path }` | `event busy`, `out …`, `done { id, result, variables, cwd }` |
| `complete`, `variables`, `variable.get`, `variable.set`, `clear`, `help`, `cwd` | `reply { id, data, error }` |
| `breakpoints { file, lines }` | — |
| `graphics.*`, `sim.*`, anything else | `session.handleMessage(msg)` |

The engine posts `out`, `event` (session events: workspace, cwd, busy, openFile, clc, history), `request` and whatever the libraries post (`graphics.*`, `sim.*`, `audio.play`).

### 동기 요청 / Synchronous requests

`ctx.host.request(msg)` blocks the worker: it posts `{ type: 'request', id, msg }` and waits with `Atomics.wait` on a shared control block. The GUI answers (`engine.onRequest(type, fn)`), writes JSON into a 1 MB shared buffer (bigger answers go in chunks: the worker asks with `request.more`). Answered by the GUI: `input`, `dialog.open` / `dialog.save` / `dialog.folder` (system dialogs on the desktop, the in-page chooser on the web), `debug.paused` (the editor shows the line; Continue / Step / Step In / Step Out / Stop or a K>> command answer it), `http` (fetch). Ctrl+C sets the shared interrupt flag (`session.setInterruptFlag`) and answers a waiting request with `null`.

SharedArrayBuffer needs cross-origin isolation: every server sends COOP `same-origin` + COEP `require-corp` (`ISOLATION_HEADERS` in server/fs-api.js, `app.security.headers` in tauri.conf.json); the host API answers with `Cross-Origin-Resource-Policy: cross-origin` and CORS.

After every command the worker calls the `__graphics_flush__` builtin when it exists, so figures redraw once per command.

## 데스크톱 셸 / Desktop shell (src-tauri)

- `lib.rs`: frameless main window (the title bar is the app's toolbar), shown after the first paint (`renderer_ready`), minimum size 1024×640, position / size / maximised state in `window-state.json` (config folder), files given on the command line (`.m`, `.msim`, `.smdl`, `.mat`) handed to the page as `window.__MSM_OPEN__`, the optional per-user `.m` association (`m_association`, `set_m_association`).
- `host.rs`: the host API in Rust (tiny_http): the same calls as server/fs-api.js on real absolute paths, `system()` through cmd.exe or /bin/sh, settings in `settings.json`. A random token protects it; the page gets `{ port, token }` through the initialisation script or `host_info`.
- Config folder: `%APPDATA%\MySimulationMath`, `~/Library/Application Support/MySimulationMath`, `~/.config/MySimulationMath` (`MSM_USER_DATA` overrides).
- NSIS: model files (`.msim`, `.smdl`) and data files (`.mat`) are associated; `windows/hooks.nsh` sets the model icon and the installer language.

## GUI 구성 / GUI pieces

| File | What |
|---|---|
| `src/App.jsx` | layout, documents, ribbon actions, engine requests, close prompt, shortcuts |
| `src/components/TitleBar.jsx`, `Ribbon.jsx` | title bar with ribbon tabs; ribbon rows (labels hide when narrow) |
| `src/panes/CommandWindow.jsx` | prompt, output, history, completion, input(), K>> |
| `src/panes/EditorDoc.jsx`, `src/lib/editor.js` | CodeMirror 6 editor for M files |
| `src/panes/Workspace.jsx`, `CommandHistory.jsx`, `CurrentFolder.jsx`, `VariableEditor.jsx` | the panes |
| `src/lib/settings.js` | defaults, deep merge, store (`/api/settings/*`) |
| `src/lib/popups.js`, `src/views/PopupWindow.jsx` | desktop child windows (menus, settings, about) |
| `src/lib/menu.js`, `prompt.js`, `ui.js`, `history.js`, `dirty.js` | menus, input dialogs, confirmations / toasts, Undo / Redo, unsaved-change tracking |
| `src/lib/i18n.js`, `src/themes.js` | ko / en texts, 40 themes |

## 시험 / Tests

`npm test` runs `test/*.test.mjs` with `test/reporter.mjs` (progress per file, a summary table, failures). The app's own tests: `app-fs` (fs-node, the host API in-process and over HTTP), `app-engine` (reply channel, output batching, router with a stand-in session), `app-gui` (value display / editing, file kinds, sections, settings, dictionary, name rule), `app-cli` (scripts/msm.mjs). The Rust host has a unit test (`cargo test --lib host`).
