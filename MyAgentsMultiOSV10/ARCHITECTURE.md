# MyAgents — Architecture

## 1. Overview

```text
src/ (UI, Vite)  ──HTTP + SSE──▶  server/ (node:http)  ──▶  core/ (plain ESM JavaScript)
   app.js shell                        desktop.js  (127.0.0.1, token)        engine, nodes, providers,
   editor/ canvas, inspector …         web.js      (static dist/ + password)  knowledge, memory, scheduler,
   views/ runs, knowledge, models      api.js      (the same routes)          store (JSON files)
src-tauri/ (Rust) starts `node server/desktop.js` (bundled node + desktop.cjs in installers) and hands the
window its URL and token (core.rs).
```

The UI never calls a model or an outside server itself: everything runs in the core, so the desktop app and the
web server behave the same, webhooks and schedules work, and keys never reach the page.

## 2. Core (`core/`)

| module | role |
| --- | --- |
| `app.js` | `createCore({ mode, dataDir })`: store, settings, credentials, knowledge, memory, agents, engine, scheduler; seeds the sample knowledge base |
| `store.js` | one JSON file per record: `agents/`, `runs/` (newest 500), `knowledge/`, `memory/<agent>/<session>.json`, `credentials.json`, `settings.json`; in memory when `dataDir` is null |
| `services.js` | agents (normalised documents, `rev` optimistic locking, export/import, webhook secret), credentials (masked in the API, environment fallbacks), core settings |
| `engine.js` | runs graphs and emits events (§3) |
| `nodes/defs.js` | node types: category, icon, ports, fields (shared with the UI) |
| `nodes/runtime.js` | what each node does; the calculator and the JavaScript sandbox (`node:vm`) |
| `nodes/defs-more.js`, `nodes/runtime-more.js` | the input/output, form, folder-watch, after-agent, vision, rewrite, keywords, document Q&A, chunk, RAG answer, A/B, quality gate, batch, convert, table, calculated column, pick, flatten, diff, lint, build and RSS nodes |
| `formats.js` | file formats without dependencies: reads text, Markdown, HTML, CSV, JSON, PDF (content streams, FlateDecode, ToUnicode, UCS-2), DOCX, XLSX (own ZIP reader) and pictures (PNG/JPEG/GIF/WebP/BMP/SVG sizes); writes the same plus PDF with the standard Korean CID font (HYGoThic-Medium, UniKS-UCS2-H, not embedded), DOCX and XLSX (own ZIP writer, CRC-32) |
| `triggers.js` | Folder watch (new or changed files, checked on the scheduler's beat; the first look only notes what is there) and After another agent (run.finished; chains stop at 5 and never return to an agent already in the chain) |
| `ollama.js` | local Ollama: installed / running / version / models; install (winget, the official setup run silently, Homebrew, the install script), start (`ollama serve`), pull with byte progress; one job at a time, `ollama.progress` events; refused on the web server |
| `expr.js` | `{{ }}` expressions, filters, condition operators |
| `providers/` | model adapters (§5) and the offline test model |
| `knowledge.js` | text extraction, chunking, BM25 (Korean two-letter pieces) |
| `memory.js` | conversation memory per agent and session |
| `scheduler.js` | schedule triggers of deployed agents (interval, daily, weekly, cron), checked every 20 s |
| `builder.js` | "describe it": a model designs the graph from the node catalogue, or a keyword planner |
| `validate.js` | problems of an agent (shared with the UI) |
| `layout.js` | auto layout (shared with the UI): columns by longest path with back edges (loops) left out; with an aspect (screen or paper) a long flow wraps into bands |
| `templates.js` | the 95 starter agents (pipelines, developer, office), built in Korean or English |

## 3. Run semantics and events

- A run starts at the trigger matching its kind (manual, chat, webhook, schedule) or a given node.
- A node runs once per arriving input and sends its output on one or more ports. Merge waits for one input per
  incoming edge (or goes on with what it has when nothing else is left). Loop runs its `item` branch to the end
  per item and sends `{ items, count }` on `done`.
- An AI agent's `tools` port does not run on its own: each connected node is a tool (one string argument); a call
  runs that node and what follows it; the last output is the answer. Tool steps carry `toolOf`.
- Human steps pause the run (`waiting`) until `resume()`; they continue on `approved` / `rejected`.
- Per node: retries, retry delay, timeout, `onError` (stop · continue with `{ error }` · `error` port), disabled
  (passes its input through), pinned (uses the pinned output). Limits: 2000 steps, 500 visits per node, 5 levels of
  sub-agents.
- Events (`/api/events`, Server-Sent Events): `run.started`, `run.step` (`start` / `end` / `waiting`, with the
  step), `run.edge`, `run.tool`, `run.log`, `run.loop`, `run.notify`, `run.waiting`, `run.status`, `run.finished`,
  `agent.*`, `kb.*`. The editor draws them: card states, flowing edges, counts, the timeline.

Run record: `{ id, agentId, status, trigger, sessionId, startedAt, endedAt, ms, steps[], output, response,
error, usage { input, output, calls }, waiting, draft, parentRunId }`; a step: `{ id, nodeId, name, type, status,
startedAt, endedAt, ms, input, output, port, error, logs[], usage, model, attempt, loop?, toolOf?, pinned? }`
(long strings shortened to 20 000 characters).

## 4. Expressions

`{{ path | filter:arg }}` where a path starts at `input`, `trigger`, `vars`, `nodes.<name or id>.output`,
`item`, `index`, `run`, `env`; `a || b` falls back. A whole-field expression keeps its type; mixed text becomes
text. JSON text is read like an object along a path. Nothing is evaluated as JavaScript (the Code node is for
that).

## 5. Model providers

`chat({ provider, model, credential, system, messages, tools, json, maxTokens, effort, signal })` →
`{ text, toolCalls, usage, stop, raw, rawProvider, model }`. Messages are provider-neutral (`user`, `assistant`
with `toolCalls` and the provider's own `raw` content, `tool` results); an assistant turn goes back to its
provider unchanged (Claude thinking blocks, Gemini thought signatures).

| provider | how |
| --- | --- |
| anthropic | `@anthropic-ai/sdk`, Messages API; default model `claude-opus-5-5`; `output_config.effort`; no sampling parameters; server-side refusal fallbacks (`fallbacks: "default"`) on models that support them; a `refusal` stop is an error |
| openai / compatible | `/chat/completions` with function tools, `response_format` JSON |
| gemini | `generateContent` with function declarations |
| ollama | `/api/chat` with tools and `images`; a missing model names the installed ones |
| cursor | Cloud Agents API v1: each call starts a cloud agent (`POST /v1/agents`, Basic auth with the key), polls its run until it ends and returns `run.result`; an optional repository rides on the base URL after `#` (`…#https://github.com/org/repo@branch`); one-shot agents are archived |
| mock | offline, deterministic: calls a tool when the request plainly asks for one, classifies by words |

Model references are `provider:model`; an empty model uses the default from the core settings. A user message may
carry `images: [{ mime, data }]` (base64): Claude image blocks, OpenAI `image_url`, Gemini `inlineData`, Ollama
`images`, Cursor `prompt.images`.

## 6. HTTP API (`server/api.js`)

`/api/info`, `/api/catalog`, `/api/settings`, `/api/agents[/:id[/export|duplicate|secret|deploy|run|chat|memory]]`,
`/api/agents/import`, `/api/run-draft`, `/api/runs[/:id[/cancel|resume]]`, `/api/runs/active`, `/api/events`,
`/api/hooks/:agent/:secret` (public), `/api/problems`, `/api/credentials`, `/api/models`, `/api/models/test`,
`/api/kbs[/:id[/docs[/:doc]|search]]`, `/api/templates[/:id]`, `/api/build`, `/api/schedules`,
`/api/ollama[/job|install|start|pull]`.
Errors: `{ error: { code, message, details } }`. Desktop: bearer token (`?token=` for the event stream). Web:
an optional password and a session cookie; the Run command node is off.

## 7. UI (`src/`)

- `app.js` — the shell: menus (popup windows), toolbar folding into », panels with grips, views, status bar,
  start page (vertical by default, `ui/startboard.js`), settings, themes, the event stream.
- `editor/editor.js` — the open agent, Undo/Redo (document snapshots, consecutive edits of one field join),
  live runs, chat tester, palette, problems, history, menus.
- `editor/canvas.js` — DOM cards and an SVG edge layer in one transformed world; pan, zoom at the cursor, box
  selection, port dragging, drop from the palette, minimap; `markNode`, `markEdge`, `flow` for runs.
- `editor/inspector.js` — fields from `defs.js`, expression previews against the shown run, variable picker.
- `editor/runpanel.js` — the timeline, the step detail, the waiting card, history rows.
- `views/` — Runs, Knowledge, Models & keys (a model picker per provider; Ollama's state with Install / Start /
  Download).
- `print/` — the print window (`popup.js`), what it prints (`host.js`: overview, flow SVG, nodes, last run) and the
  pages (`pages.js`, millimetre boxes so preview and paper match); `src-tauri/src/printing.rs` prints through
  WebView2 to the chosen printer.
- Popups as OS windows (web: frames): settings, confirm, form, progress, print, the run result (`rundone`).
- Folded panels keep a rail with their icon and title; each panel header folds it with the toolbar's icon.

## 8. Files

`.myagent` = `{ format: "myagents", version: 1, exportedAt, agent }` (the webhook secret is left out).
