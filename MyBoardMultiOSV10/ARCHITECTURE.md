# MyBoard — Architecture & Contract

MyBoard is a Kanban / issue-tracking board with the feature set of a Jira Software Kanban board (plus
Trello-style card extras: covers, checklists). It runs on Windows, macOS, Linux (Tauri 2) and in a browser
(web server). Its look and shell come from MySketchBookMultiOSV10 (start screen of movable cards over a
moving background, popup windows for menus/dialogs, icon+label toolbar that is the title bar, themes,
status bar with grip, Undo/Redo, settings window). No Atlassian names, logos or look are used.

This file is the **contract** between the parts. Change it first when a part needs something new.

## 1. Layout

```
core/                 Node core, platform independent, plain ESM JavaScript (no TypeScript)
  db/                 dialect layer, schema, migrations
    dialects/         sqlite.js (node:sqlite), mysql.js (mysql2: MySQL + MariaDB), postgres.js (pg), mssql.js (mssql/tedious)
    schema.js         the tables, in a dialect-neutral form (§3)
    migrate.js        create/upgrade tables, schema_version in meta
    index.js          openDatabase(config) → Db (§2)
  services/           one module per area; methods take (ctx, …) and read core.db — ctx = { user, clientId, now?(), system? }
    common.js         toApi/fromApi (camelCase), access control, crud() factory, emit()
    users projects config issues parts boards personal icons reports automation exchange search history templates csv
    import/trello.js  card-board JSON importer
  jql/                query language: lexer, parser, compile → SQL WHERE + params, and match(issue) in memory
  rank.js             fractional ordering keys (§3.3)
  ids.js              newId()
  events.js           EventBus (§6)
  realtime/hub.js     WebSocket hub (§6) — enabled only by the web server; pluggable transport (memory now)
  samples.js          createSamples(core, { language: 'ko'|'en' }) — 3 realistic projects with 60 days of history
  version.js          VERSION
  app.js              createCore(config) → { db, services, events, close(), testDb, switchDb, copyDb }
server/
  router.js           tiny router on node:http (no Express)
  api.js              REST routes → services (§5)
  host.js             http server, CORS, static files, arg parsing (shared by desktop/web)
  dbconfig.js         <dataDir>/database.json (+ database.key, AES-256-GCM password)
  desktop.js          entry the Tauri shell spawns (loopback, token, --parent-pid); exports startDesktop()
  web.js              web server entry: static dist/ + /api + /api/live (WebSocket) + login; exports startWeb()
src/                  UI (vanilla JS + Vite), forked from MySketchBook's shell
  api/client.js       fetch wrapper (base URL + token from the shell), typed helpers per resource
  live/channel.js     realtime client: WsChannel (web) or NullChannel (desktop) — same interface
src-tauri/            Tauri 2 shell; spawns the core (core.rs), popups as OS windows
test/                 node:test unit/integration tests; e2e like MySketchBook
  core/               `npm run test:core`: sqlgen (unit, every dialect), jql, integration (every service, per DB),
                      server (web + realtime per DB, desktop), samples, perf (2000-issue board < 300 ms)
```

## 2. Database layer

`openDatabase({ type, ...options })`, `type` ∈ `sqlite` (default) | `mysql` | `mariadb` | `postgres` | `mssql`.

```
sqlite:   { file }                      (':memory:' allowed; default <dataDir>/myboard.sqlite3)
mysql/mariadb/postgres/mssql: { host, port, database, user, password, ssl?: boolean, options?: {} }
any:      { url: 'mysql://u:p@h:3306/db' | 'mariadb://…' | 'postgres://…' | 'mssql://…' | 'sqlite:<file>' }
postgres: { pglite: <PGlite instance> }  (in-process WASM Postgres — used by the tests)
```

`Db` interface (every dialect):

| member | meaning |
|---|---|
| `dialect` | `'sqlite' \| 'mysql' \| 'postgres' \| 'mssql'` (mariadb uses mysql) |
| `all(sql, params) → rows[]` | `?` placeholders in, rewritten per dialect ($1 / @p1) |
| `get(sql, params) → row\|null` | first row |
| `run(sql, params) → { changes }` | |
| `value(sql, params, fallback)` | first column of the first row |
| `tx(async (db) => …)` | transaction; nested calls join the outer one. Uses AsyncLocalStorage: every call on the same `Db` from inside `fn` goes to the pinned connection, so helpers need no handle |
| `afterCommit(fn)` | run after the current transaction commits (dropped on rollback); services emit events this way |
| `insert(table, row)`, `insertMany(table, rows)`, `update(table, id, patch, { rev })`, `remove(table, where)`, `select(table, where, { order, limit, offset, columns })`, `selectOne`, `count(table, where)` | helpers that quote identifiers; `insert` fills schema defaults; `insertMany` chunks under every dialect's parameter limit |
| `limitClause(limit, offset)` | `LIMIT/OFFSET` or `OFFSET … ROWS FETCH NEXT … ROWS ONLY` |
| `close()` | |

Rules that make one set of SQL run everywhere:
- **Ids are strings** (`newId()`: 20-char lowercase base36, time-ordered). No auto-increment anywhere.
- **Times are BIGINT epoch milliseconds**; pure dates (due date, release date) are `'YYYY-MM-DD'` text.
- **Booleans are SMALLINT 0/1**. **JSON is text** (parsed in services).
- Column types are logical (`id`, `string(n)`, `text`, `int`, `bigint`, `float`, `bool`, `json`, `blob`) mapped per dialect:
  text → TEXT / LONGTEXT / TEXT / NVARCHAR(MAX); string(n) → VARCHAR(n) / VARCHAR(n) utf8mb4 / VARCHAR(n) / NVARCHAR(n);
  blob → BLOB / LONGBLOB / BYTEA / VARBINARY(MAX). Indexed columns are always `id`/`string(n≤191)`.
- Identifiers are lowercase snake_case and always quoted by the helpers (`user`, `key`, `order`, `rank`, `read`, `trigger` are reserved somewhere).
- **Portable SQL text**: services write `?` placeholders and `"double-quoted"` identifiers; `core/db/sqlgen.js` rewrites them
  per dialect (`$1` / `@p1`, `` `x` `` / `[x]`), skipping string literals and comments. LIKE always uses `ESCAPE '!'`
  (`likeEscape()`); case-insensitive matches use `LOWER(col)` against a value lower-cased in JS.
- Postgres string columns are `COLLATE "C"`, SQL Server's `COLLATE Latin1_General_100_BIN2`, MySQL tables `utf8mb4_bin`:
  ordering and equality are byte-wise on every database (rank keys, names).
- No foreign keys and no DB defaults: services own cascades; `Db.insert` fills defaults from `schema.js`. Migrations add
  missing tables/indexes/columns (`migrate()` is idempotent) and run versioned data steps (`meta.schema_version`).
- MySQL tables use `utf8mb4` + `utf8mb4_bin` collation for rank/key columns so ordering is byte order everywhere.
- Row-level optimistic locking: mutable rows have `rev INT`; `update(…, { rev })` adds `AND rev = ?`, sets `rev = rev + 1`,
  and a 0-row result raises `ConflictError` (HTTP 409 with the current row). Issue edits check `rev` under a row lock
  (`UPDATE … SET rev = rev WHERE id = ? AND rev = ?`) inside the transaction.

## 3. Data model

All tables have `id` (string pk) unless noted; `created_at`, `updated_at` bigint; `rev` int where mutable.

| table | columns (besides id/created/updated/rev) |
|---|---|
| meta | key pk, value |
| app_settings | key pk, value (json) |
| users | username uniq, display_name, email, password_hash, avatar (IconRef), role ('admin'\|'user'), active, prefs json |
| sessions | token pk, user_id, expires_at |
| icons | kind ('upload'), name, mime, data (blob), width, height, created_by — uploaded pictures (§4) |
| projects | key uniq (A–Z0–9, 2–10), name, description, icon, color, lead_id, issue_seq, default_assignee_id, archived, template |
| project_members | project_id, user_id, role ('admin'\|'member'\|'viewer') — pk(project_id,user_id) |
| issue_types | project_id, name, icon, color, level (0 = standard, 1 = subtask, -1 = epic), workflow_id, position |
| priorities | name, icon, color, position (global) |
| resolutions | name, description, icon (IconRef), color, position (global) — shown with the resolution in the detail panel, on resolved cards and backlog rows |
| statuses | project_id, name, category ('todo'\|'inprogress'\|'done'), color, position |
| workflows | project_id, name, initial_status_id, layout json { &lt;statusId&gt;: { x, y } } (diagram box positions; null = automatic; `INVALID_LAYOUT`) |
| transitions | workflow_id, name, from_status_id (null = from any), to_status_id, rules json {conditions[], validators[], postFunctions[]}, position |
| components | project_id, name, description, lead_id, icon, default_assignee_id (§3.6) |
| versions | project_id, name, description, start_date, release_date, released, archived, position |
| custom_fields | project_id (null = all), name, type ('text'\|'textarea'\|'number'\|'date'\|'select'\|'multiselect'\|'user'\|'checkbox'\|'url'\|'labels'), options json [{id,value,icon,color}], required, position, description, default_value json (a value as the API takes it), issue_type_ids json (null = every type; §3.6) |
| issues | project_id, number, key uniq ('KAN-12'), type_id, status_id, resolution_id, priority_id, summary, description (text, Markdown), assignee_id, reporter_id, parent_id (subtask → parent), epic_id, story_points float, original_estimate, remaining_estimate, time_spent (seconds), due_date, start_date, rank, color, cover json, icon, flagged, archived, resolved_at, status_changed_at |
| issue_labels | issue_id, label — pk both |
| issue_components | issue_id, component_id |
| issue_versions | issue_id, version_id, kind ('fix'\|'affects') |
| issue_watchers | issue_id, user_id |
| issue_votes | issue_id, user_id |
| issue_links | source_id, target_id, kind ('blocks'\|'relates'\|'duplicates'\|'clones'\|'causes'), created_by — "source blocks target" |
| custom_values | issue_id, field_id, value json, **text_value** string(191), **num_value** float — pk both. Query columns written by the services with `customValueColumns()` from core/jql: text lower-cased; multiselect/labels `'\|a\|b\|'`; select = the option's *value* text (API values for select/multiselect are option value texts; an option id is accepted on input); user = user id; date 'YYYY-MM-DD'; number/checkbox in num_value |
| checklist_items | issue_id, text, done, position(rank) |
| comments | issue_id, author_id, body (Markdown) |
| attachments | issue_id, file_name, mime, size, data blob, author_id |
| worklogs | issue_id, author_id, started_at, seconds, comment |
| issue_history | issue_id, user_id, field, from_value, to_value, from_label, to_label, at — append only (reports read it) |
| boards | project_id (null = cross-project by filter), name, icon, filter_jql, settings json (§3.2), created_by |
| board_columns | board_id, name, position, wip_min, wip_max, status_ids json (array) |
| swimlanes | board_id, name, jql, position (for swimlane mode 'queries') |
| quick_filters | board_id, name, jql, icon, position |
| card_colors | board_id, jql, color, position (mode 'queries') |
| saved_filters | owner_id, name, jql, shared, favourite, icon |
| dashboards | owner_id, name, icon, shared, layout json {columns, gadgets:[{id,type,config,col,row}]} |
| automation_rules | project_id, name, enabled, trigger json, conditions json, actions json, run_count, last_run_at, last_error, created_by (§3.4) |
| notifications | user_id, issue_id, kind, payload json, read |
| change_log | seq string (rank-ordered, newId), topic, type, payload json, at — feed for future multi-server realtime |

Issue `cover` json: `{ color: '#rrggbb' }` or `{ attachmentId }` (an image attachment of the same issue, shown from
`GET /attachments/:id?inline=1`); `null` = no cover. The detail view writes both forms.

### 3.1 Defaults created with a project (template 'kanban' | 'software' | 'bugs' | 'simple')
Statuses Backlog / Selected for Development / In Progress / Done; types Epic, Story, Task, Bug, Subtask; one workflow
(all transitions allowed, "Done" sets resolution Done); one board with columns Backlog(kanban backlog) / Selected / In
Progress / Done. Global priorities Highest/High/Medium/Low/Lowest and resolutions Done (`b:done` #2b8a3e) / Won't Do
(`b:ban` #868e96) / Duplicate (`b:files` #7048e8) are created by the first migration (schema v2 gives existing default
resolutions without an icon these icons/colours, once).

| template | statuses (category) | types | board columns (WIP max) | workflow |
|---|---|---|---|---|
| kanban (default) | Backlog, Selected for Development (todo), In Progress, Done | Epic Story Task Bug Subtask | Backlog (kanban backlog), Selected for Development, In Progress (5), Done | any → any |
| software | Backlog, To Do, In Progress, In Review, Done | Epic Story Task Bug Subtask | Backlog (kanban backlog), To Do, In Progress (4), In Review (3), Done | any → any |
| bugs | Open, In Progress, Resolved (done), Closed (done) | Bug Improvement Task Subtask | Open, In Progress (6), Resolved, Closed | Start progress, Stop progress, Resolve, Close, Reopen |
| simple | To Do, Doing, Done | Task Subtask | To Do, Doing, Done | any → any |

`POST /projects` may pass `names` to localise the created statuses / types / columns / board name (the samples do).
The creator becomes the project's admin member.

### 3.2 Board settings json
`{ backlog: { enabled, statusIds }, swimlanes: 'none'|'assignee'|'epic'|'project'|'queries'|'priority'|'type',
  cardColors: 'none'|'type'|'priority'|'assignee'|'queries', cardFields: [up to 3 field ids shown on cards],
  estimation: 'storyPoints'|'originalEstimate'|'count', workingDays: [1..5], doneHideDays: 14,
  subtasks: 'cards'|'parent', columnConstraint: 'issueCount'|'none' }`

Board settings are normalised by the core (missing keys get defaults, invalid values → `INVALID_SETTINGS`).
`doneHideDays: null` shows every done issue. A column is a *done column* when all its statuses are in the done
category; a column is the *backlog column* when all its statuses are in `backlog.statusIds` (its issues are returned
in `backlog`, not in `issues`). A status maps to at most one column (saving a column removes its statuses elsewhere).

### 3.3 Ranking
`core/rank.js`: keys from the alphabet `0-9a-z` only (orders identically under every collation), `between(a, b)`,
`initial(n)` for n evenly spaced keys, `rebalance(keys)` when a key grows past 64 chars. Issues, checklist items and
anything user-ordered use it. Board ordering = `ORDER BY rank`. Issue ranks form **one global order** (all projects),
so cross-project boards sort naturally; new issues go to the bottom.

### 3.4 Workflow rules and automation json
Transition `rules`:
- `conditions` (who may use it; failing ones are listed by `GET /issues/:id/transitions` with `available: false, reason`):
  `{type:'onlyAssignee'}`, `{type:'onlyReporter'}`, `{type:'projectRole', role}`, `{type:'subtasksDone'}`, `{type:'jql', jql, message?}`
- `validators` (checked after the transition's `fields` are applied): `{type:'fieldRequired', field}` (field = assignee,
  resolution, storyPoints, dueDate, description, priority, originalEstimate, labels, components, fixVersions or a custom
  field id), `{type:'commentRequired'}`, `{type:'jql', jql, message?}`
- `postFunctions`: `assignToCurrentUser`, `assignToReporter`, `unassign`, `{type:'setResolution', resolutionId | resolution}`,
  `clearResolution`, `{type:'setField', field, value}`, `{type:'addLabel', label}`, `{type:'addComment', body}`
- Always: entering a done-category status sets a resolution (request `resolutionId` › setResolution › current › first
  resolution) and `resolved_at`; leaving done clears both.

Automation rule:
- `trigger`: `{ type: 'issue.created' | 'issue.transitioned' | 'issue.updated' | 'comment.created' | 'scheduled' | 'manual',
  fromStatusId?, toStatusId? (transitioned), fields?: [history field names] (updated), everyMinutes? (scheduled),
  jql? (scheduled/manual: which issues) }`
- `conditions`: `[{ jql }]` — all must match the issue
- `actions`: `{type:'transition', statusId | transitionId}`, `{type:'assign', userId | 'reporter' | 'currentUser' | null}`,
  `{type:'setField', field (API name such as priorityId, or 'custom:<fieldId>'), value}`, `{type:'comment', body}`,
  `{type:'addLabel', label}`, `{type:'removeLabel', label}`
- Texts may use `{{issue.key}} {{issue.summary}} {{user.name}} {{rule.name}}`. A rule never reacts to its own changes and
  chains stop at depth 3. Scheduled rules run from the core's 60 s scheduler; `POST …/run` runs a rule now over the
  project's issues matching `trigger.jql` + conditions (≤ 500).

### 3.5 issue_history fields
`created` (to = status id), `status`, `resolution`, `assignee`, `reporter`, `type`, `priority`, `summary`, `description`,
`parent`, `epic`, `storyPoints`, `originalEstimate`, `remainingEstimate`, `timeSpent`, `dueDate`, `startDate`, `color`,
`cover`, `icon`, `flagged`, `archived`, `labels` (space separated), `components` / `fixVersions` / `affectedVersions`
(comma separated ids; the labels hold names), `custom:<fieldId>` (JSON values), `attachment`, `link`. `from_label` /
`to_label` hold display names (status name, user display name, issue key …).

### 3.6 Defaults on create, field applicability, workflow layout
- **Assignee on create** (`POST /issues`, also CSV import / clone / automation, which use the same service): an explicit
  `assigneeId` (also `null` = unassigned) wins; without one, the first of `componentIds` (in the order given) whose
  component has an active `defaultAssigneeId`, else the project's `defaultAssigneeId`. Like the project default this
  happens only on creation — setting components later on an unassigned issue does not assign it.
- **Custom field defaults** (`defaultValue`, checked and normalised like a value: select = option value text, which
  follows a renamed option and is dropped with a deleted one; checkbox `false` = no default): on create, a field that
  applies to the type and is not named in `custom` (by id or name) gets its default; an explicit `null`/`''` stays empty.
  CSV import empty cells get defaults; clone copies the source's values only (no defaults).
- **Applies to** (`issueTypeIds`, ids of the project's types; `[]`/null = every type): the detail panel and the board's
  create form show a field only for those types; a value that would change a field that does not apply is refused with
  400 `FIELD_NOT_APPLICABLE` (create and PATCH) — sending back an unchanged value or clearing one is allowed, so values
  stay stored when an issue changes type (as Jira keeps them). Not applicable = not required. CSV import leaves such
  cells out; clone copies applicable fields only. Deleting an issue type removes it from the lists (the replacement
  takes its place; an emptied list = every type).
- **Workflow layout**: `PATCH /projects/:id/workflows/:wid { layout, rev }`; the settings editor saves it on drag end
  / after arrow keys rest (undo-able) and moves a layout older versions kept in localStorage into the DB on the first
  save. `.myboard` export/import maps the status-id keys (json keys that are ids are re-mapped), DB copy carries it.

## 4. Icons (input everywhere)

An **IconRef** is a string stored in any `icon`/`avatar` column and usable in Markdown text as `:icon[<ref>]`:

| form | meaning |
|---|---|
| `b:<name>` | built-in vector icon from the app's catalogue (src/icons*.js; several hundred, colourable) — names the core/samples write are listed below |
| `b:<name>#<rrggbb>` | built-in icon tinted |
| `e:<emoji>` | an emoji (rendered with the system emoji font) |
| `u:<iconId>` | an uploaded picture from the `icons` table, served at `GET /api/icons/<id>` |
| `l:<text>#<rrggbb>` | a letter avatar (1–2 letters on a colour) |

Upload accepts PNG, JPEG, GIF, WebP, BMP, ICO, SVG (and AVIF where the webview decodes it). Rasters are decoded in
the UI, scaled to ≤256 px and stored as PNG (animated GIF/WebP kept as is ≤512 KB). SVG is sanitised by the core
(no script, foreignObject, event attributes, external href, `javascript:`) and stored as SVG. The icon picker
(one component used by every icon field) has tabs: Built-in (search + categories), Emoji (search + categories),
Uploaded (library of the DB's icons, upload / drop / paste), Letters, plus colour.

**Built-in names the core writes** (templates, migrations, samples) — the UI catalogue must provide all of them:
`bug story task epic subtask check flag star rocket bolt user folder calendar clock tag link comment paperclip chart
shield gear home heart fire bookmark lightning cloud database code globe lock bell search layers target trophy
priority-highest priority-high priority-medium priority-low priority-lowest done ban files`.
Templates: Epic `b:epic`, Story `b:story`, Task `b:task`, Bug `b:bug`, Subtask `b:subtask`, Improvement `b:rocket`,
boards `b:layers`; priorities `b:priority-*`. Uploads: `POST /icons` checks the bytes (magic numbers), ≤ 512 KB.

## 5. HTTP API

JSON, base `/api`. Desktop: base URL + token from the shell (`Authorization: Bearer <token>`), CORS allowed for the
Tauri origins only. Web: same origin, session cookie `myboard_session` (HttpOnly, SameSite=Lax) or bearer token.
Errors: `{ error: { code, message, details? } }` with 400 validation, 401, 403, 404, 409 conflict (`details.current`).
Lists: `?limit&offset` → `{ items, total }`. Updates are `PATCH` with `rev` in the body.

**JSON casing: the API is camelCase.** Every row is returned with its columns converted snake → camel
(`project_id` → `projectId`, `status_ids` → `statusIds`, `created_at` → `createdAt`), `bool` columns as `true/false`,
`json` columns parsed, `blob` columns omitted. Request bodies use the same camelCase names (snake_case is accepted too).
Error `code`s are stable UPPER_SNAKE strings (e.g. `ISSUE_NOT_FOUND`, `CONFLICT`, `JQL_SYNTAX`, `WIP_LIMIT`) — translate by code.

Auth per mode (desktop details in §7):
- **web**: session cookie `myboard_session` or `Authorization: Bearer <session token>` (both come from login).
- **desktop**: `Authorization: Bearer <shell token>` on every request, plus `X-Session: <session token>` only when
  `info.needsLogin` is true.
- Any GET may carry `?token=` instead of the header (for `<img src>`, downloads and the WebSocket URL).
  `GET /icons/:id` is public.
- Send `X-Client-Id: <per-tab id>` with mutations so the tab can ignore its own realtime echoes.
- Responses are JSON (`204` when there is no body); binary routes set `Content-Type` / `Content-Disposition`.

| area | routes (all under `/api`) |
|---|---|
| info | `GET /info` → { version, mode 'desktop'\|'web', realtime, db: { type, label }, needsLogin, setupRequired (web: no users yet), user, dbError? (desktop: the stored DB was unreachable, the core fell back to the local file) } |
| auth | `POST /auth/login` {username (or e-mail), password} → { token, expiresAt, user } (+ cookie on web); `POST /auth/logout`; `GET /auth/me`; `POST /auth/password` {currentPassword, newPassword, userId? (admin)}; `POST /auth/setup` {username, password, displayName} (web first run → admin + login) |
| db (admin) | `GET /db/config` (no password, `hasPassword`); `POST /db/test` {config} → { ok, type, label, schemaVersion, tables, users, projects, empty } or { ok: false, error }; `POST /db/switch` {config} (connect, migrate, persist to `<dataDir>/database.json`); `POST /db/copy` { target: config, overwrite? } → { tables: { name: rows }, total } (the target must be empty unless overwrite) |
| users | `GET /users[?all=1]`, `POST /users` (admin), `GET/PATCH/DELETE /users/:id` (DELETE deactivates) |
| icons | `GET /icons` → [{ id, ref 'u:<id>', name, mime, width, height }]; `POST /icons` {name, data base64, width?, height?}; `GET /icons/:id` (bytes, public, immutable cache); `DELETE /icons/:id` |
| settings | `GET /settings` → { key: value }; `PATCH /settings` { key: value \| null } (admin) |
| projects | `GET /projects[?archived=1]` (rows + issueCount, myRole); `POST /projects` {key, name, template, description?, icon?, color?, leadId?, names?: { statuses[], types { epic, story, … }, columns[], board }} → project + boardId; `GET/PATCH/DELETE /projects/:idOrKey`; `GET /projects/:id/config` → { project, types, statuses, workflows (with transitions), components, versions, fields, priorities, resolutions, boards, members } |
| members | `GET /projects/:id/members`; `POST /projects/:id/members` {userId, role}; `PATCH/DELETE /projects/:id/members/:userId` |
| project config | for `types statuses workflows components versions fields`: `GET/POST /projects/:id/<x>`, `GET/PATCH/DELETE /projects/:id/<x>/:itemId` (DELETE with `?replaceWith=<id>` when the item is in use, otherwise 409 `IN_USE`), `POST /projects/:id/<x>/order` {ids}; `POST /projects/:id/versions/:vid/release` {releaseDate?, moveUnresolvedTo?} |
| transitions | `GET /projects/:id/transitions[?workflowId]`; `POST /projects/:id/transitions` {workflowId, name, fromStatusId \| null, toStatusId, rules}; `PATCH/DELETE /projects/:id/transitions/:tid` |
| automation | `GET/POST /projects/:id/automation`; `GET/PATCH/DELETE /projects/:id/automation/:ruleId`; `POST /projects/:id/automation/:ruleId/run` → { matched, acted, errors } |
| global | `GET/POST /priorities`, `PATCH/DELETE /priorities/:id`, `POST /priorities/order`; the same for `/resolutions` |
| issues | `GET /issues?jql=&limit=&offset=&includeArchived=` (or `POST /issues/search` with that body) → { items (issue rows + labels), total, limit, offset } |
| | `POST /issues` {projectId \| projectKey, typeId?, summary, description?, statusId?, priorityId?, assigneeId?, reporterId?, parentId?, epicId?, storyPoints?, originalEstimate?, remainingEstimate?, dueDate?, startDate?, color?, cover?, icon?, flagged?, labels?, componentIds?, fixVersionIds?, affectedVersionIds?, custom? { fieldId \| name: value }, checklist? [text \| {text, done}], afterId?, beforeId?} |
| | `GET/PATCH/DELETE /issues/:idOrKey` (PATCH takes the same fields + `rev`; a `statusId` in PATCH runs a transition) |
| | `GET /issues/:id/transitions`; `POST /issues/:id/transition` {transitionId \| statusId, resolutionId?, comment?, fields?, rev?} |
| | `POST /issues/:id/move` {boardId, columnId?, statusId?, afterId?, beforeId?, swimlane?, rev?} → { issue, warnings: [{ code: 'WIP_LIMIT', columnId, max, count }] } — afterId = the card above, beforeId = the card below; in the assignee/epic/priority lane modes `swimlane` (a lane id, 'none' = empty) sets that field |
| | `POST /issues/:id/clone`; `POST /issues/bulk` {ids, patch \| transition \| delete: true} → { ok: [ids], failed: [{ id, error }] } |
| issue (full) | `GET /issues/:id` → row + labels, componentIds, fixVersionIds, affectedVersionIds, custom { fieldId: value }, epic, parent, subtasks[], links [{ id, kind, direction 'outward'\|'inward', label, issue }], checklist[], watcherCount, watching, voteCount, voted, commentCount, attachmentCount, childCount |
| issue parts | `GET/POST /issues/:id/comments`, `PATCH/DELETE /comments/:id` |
| | `GET/POST /issues/:id/attachments` (JSON {fileName, mime, data base64} or raw bytes with `X-File-Name` (URI-encoded) + Content-Type; ≤ 50 MB), `GET /attachments/:id[?inline=1]` (bytes), `DELETE /attachments/:id` |
| | `GET/POST /issues/:id/worklogs` {timeSpent '1h 30m' \| seconds, startedAt?, comment?, remainingEstimate? 'auto' \| duration}, `PATCH/DELETE /worklogs/:id` (1d = 8h, 1w = 5d) |
| | `GET/POST /issues/:id/links` {targetId \| targetKey, kind}, `DELETE /links/:id` |
| | `GET/POST /issues/:id/checklist` {text, done?, afterId?, beforeId?}, `PATCH/DELETE /checklist/:id` (PATCH can also move with afterId/beforeId) |
| | `GET/POST /issues/:id/watchers` {userId? (default: me)}, `DELETE /issues/:id/watchers[/:userId]`; `GET/POST/DELETE /issues/:id/votes`; `GET /issues/:id/history` |
| boards | `GET /boards[?projectId]`; `POST /boards` {name, projectId? \| filterJql, icon?, settings?, columns?}; `GET /boards/:id` (+ columns, swimlanes, quickFilters, cardColors); `PATCH /boards/:id` {name?, icon?, filterJql?, settings? (merged), rev}; `DELETE /boards/:id`; children `columns swimlanes quickfilters cardcolors`: `GET/POST /boards/:id/<x>`, `PATCH/DELETE /boards/:id/<x>/:itemId`, `POST /boards/:id/<x>/order` {ids} |
| board data | `GET /boards/:id/data?quick=<id,id>&search=<text>&includeAllDone=1` → { board (settings normalised), columns [{ id, name, position, wipMin, wipMax, statusIds, backlog, done, count, points, overMax, underMin }], swimlanes [{ id, name, count, … mode extras; lane ids 'none' / 'other' / 'all' are the empty / rest / single lanes }], quickFilters, cardColors, issues [cards], backlog [cards], statuses, types, priorities, resolutions, fields (custom fields of the board's projects + global ones, for the create form), users, epics, versions, components, projects, elapsedMs } |
| | card = { id, key, projectId, summary, typeId, statusId, priorityId, assigneeId, epicId, parentId, storyPoints, originalEstimate, remainingEstimate, timeSpent, dueDate, rank, color, cover, icon, flagged, resolutionId, resolvedAt, statusChangedAt, createdAt, updatedAt, rev, labels, componentIds, fixVersionIds, subtasks { total, done } \| null, checklist { total, done } \| null, commentCount, attachmentCount, columnId, lane, cardColor } |
| search | `POST /jql/validate` {jql} → { ok } or { ok: false, error { code, message, details { position, length, expected? } } }; `GET /jql/suggest?text=&caret=` → { kind, prefix, start, end, field?, items [{ label, insert, detail? }] }; `GET /jql/fields`; `GET/POST /filters`, `GET/PATCH/DELETE /filters/:id` (rows + `mine`) |
| dashboards | `GET/POST /dashboards`, `GET/PATCH/DELETE /dashboards/:id`; gadget types: filterResults, pie, createdVsResolved, cfd, control, throughput, workload, version, assignedToMe, activity, markdown |
| reports | scope `boardId` or `projectId` (+ `jql`); `from` / `to` as YYYY-MM-DD or epoch ms. **Board scope: the board's rightmost column is the reference "done" column** of every report and dashboard gadget, whatever its statuses' categories or the column's `done` flag say; it follows column reordering. "Done" = the issue's current status is in that column, dated by its *last* entry into it (from `issue_history` status changes mapped to columns at report time; an issue that left it again is not done). Board-scoped answers carry `referenceColumn` { id, name, icon } (the UI shows it as the "기준 열" chip and refreshes on `board.updated` / `column.*`). Project scope (no board): done = done-category statuses / the resolution (unchanged), `referenceColumn: null`. The board view's own done columns (`doneHideDays`, card styling) stay category based (§3.2) |
| | `GET /reports/cfd` → { days[], columns[] (board order, left → right), series [{ columnId, values[] }], referenceColumn, doneColumnId } — the UI stacks the rightmost (done) band at the bottom |
| | `GET /reports/control?startColumnIds&endColumnIds` (defaults: end = the rightmost column; start = the in-progress-category columns other than the end, else the columns after the leading backlog / to-do ones) → { referenceColumn, startColumnIds, endColumnIds, points [{ issueId, key, summary, typeId, completedAt, cycleTime, leadTime }] (ms), cycle / lead { count, average, median, min, max, stddev }, rolling [{ at, average }], window } |
| | `GET /reports/throughput?interval=week\|day` (issues entering the end column — board: the rightmost — per bucket, not by resolution) → { referenceColumn, buckets [{ start, date, count, points }], average } |
| | `GET /reports/created-resolved` (board: resolved = entered the rightmost column; project: `resolved_at`) → { referenceColumn, resolvedBy: 'column'\|'resolution', days [{ date, created, resolved, cumulativeCreated, cumulativeResolved }] } |
| | `GET /reports/workload` (board: open = not in the rightmost column; project: unresolved) → { referenceColumn, items [{ userId, name, avatar, count, points, remaining }] } |
| | `GET /reports/version/:id?boardId` (with `boardId`: done = in that board's rightmost column, a done-category status elsewhere counts as in progress, for byCategory / points / burn-up) → { referenceColumn, version, total, byCategory, points, issues, burnup [{ date, scope, done }], unit, predictedReleaseDate } |
| | `GET /reports/breakdown?jql&field=status\|assignee\|priority\|type\|project\|reporter\|epic\|resolution\|labels\|component` → { items [{ key, count }], total } |
| notifications | `GET /notifications?unread=1&limit&offset` → { items, total, unread } (kinds: assigned, updated, transitioned, commented, mentioned; payload { key, summary, by, … }); `POST /notifications/read` {ids?} (none = all) |
| exchange | `GET /projects/:id/export` (.myboard JSON download); `POST /import/myboard` {file (object or text), key?, name?} (409 `PROJECT_KEY_TAKEN` with `details.suggested`) |
| | `POST /import/csv` {projectId, csv, mapping? { header: field }, delimiter?, dryRun?, createMissing?} — without mapping → { headers, rowCount, sample, suggestedMapping, fields }; with → { created, issues [{ row, id, key }], errors [{ row, code, message }] }. Fields: summary description type status priority assignee reporter labels components fixVersions affectedVersions dueDate startDate storyPoints originalEstimate created key epic parent custom:&lt;fieldId&gt; |
| | `GET /export/csv?jql=`; `POST /import/trello` {board (the JSON export), key?, name?} → project + boardId + imported { issues, checklistItems, comments } |
| samples | `POST /samples` {language 'en'\|'ko'} (admin) → { projects [{ id, key, name, boardId, issueCount }], users } |

Common error codes: `UNAUTHORIZED LOGIN_REQUIRED BAD_TOKEN BAD_LOGIN FORBIDDEN ADMIN_REQUIRED PROJECT_PERMISSION
NOT_OWNER NOT_AUTHOR`, `<THING>_NOT_FOUND` (PROJECT ISSUE BOARD USER COMMENT ATTACHMENT WORKLOG LINK VERSION RULE ICON
FILTER DASHBOARD COLUMN …), `CONFLICT DUPLICATE REQUIRED TOO_LONG`, `INVALID_<THING>` (NUMBER DATE OPTION USER STATUS TYPE
PARENT EPIC PROJECT_KEY SETTINGS RULES …), `PARENT_REQUIRED PROJECT_KEY_TAKEN USERNAME_TAKEN IN_USE TRANSITION_NOT_ALLOWED`,
`CONDITION_*`, `VALIDATOR_*`, `JQL_SYNTAX JQL_UNKNOWN_FIELD JQL_BAD_OPERATOR JQL_BAD_VALUE JQL_UNKNOWN_FUNCTION`,
`FILE_TOO_LARGE EMPTY_FILE UNSUPPORTED_IMAGE INVALID_SVG`, `DB_CONNECT_FAILED DB_NOT_EMPTY DB_TYPE_UNKNOWN DB_CONFIG_INVALID`,
`SETUP_DONE LAST_ADMIN LAST_PROJECT_ADMIN CANNOT_VOTE_OWN LINK_EXISTS INVALID_JSON BODY_TOO_LARGE METHOD_NOT_ALLOWED INTERNAL`.

Permissions: global admins can do everything. Otherwise a project role is needed: `viewer` reads, `member` edits
issues, comments and the other issue parts, `admin` configures the project (types, statuses, workflows, boards,
automation, members). A project the user has no role in reads as 404. The project creator becomes its admin.
Cross-project boards are visible to everybody (issues filtered by access) and configured by their owner or an admin.

## 6. Events and realtime

Every service mutation emits on the in-process `EventBus` (after its transaction commits):
`{ type, topics, id, rev, data, by: userId, at, client: <X-Client-Id of the request>, depth, ruleId }`.

| topic | events |
|---|---|
| `project:<id>` | `issue.created/updated/transitioned/moved/deleted` (data = the full issue; `updated` adds `changes: [{ field, from, to }]`, `transitioned` adds `fromStatusId, toStatusId`, `moved` adds `columnId, boardId`); `comment.* attachment.* worklog.* link.* checklist.* watcher.* vote.*` (also on `issue:<id>`); `project.updated/deleted`, `member.*`; `issueType.* status.* workflow.* transition.* component.* version.* field.*` (+ `.reordered`); `rule.*`; `board.created/updated/deleted` |
| `board:<id>` | `board.updated/deleted`, `column.* swimlane.* quickFilter.* cardColor.*` |
| `issue:<id>` | every event of that issue and its parts |
| `user:<id>` | `notification.created/read`, `filter.*`, `dashboard.*` of that user (every socket is subscribed to its own user topic) |
| `projects` `users` `icons` `settings` `db` | `project.created/updated/deleted`, `user.*`, `icon.*`, `settings.updated`, `db.switched` |

Subscribers: the automation engine, notifications and — **only in web mode** — the realtime hub and the `change_log`
writer. The history writer is not a subscriber: services write `issue_history` inside the same transaction.

Realtime (web): WebSocket `GET /api/live` (session cookie or `?token=`; without a valid session the upgrade gets HTTP 401).
Client → server: `{op:'hello', clientId}`, `{op:'sub', topics:[…]}`, `{op:'unsub', topics}`,
`{op:'presence', topic, state:{ view:'board'|'issue', issueId?, editing?: field }}` (`state: null` leaves), `{op:'ping'}`.
Server → client: `{op:'hello', userId}`, `{op:'subscribed', topics, denied}`, `{op:'event', event}`,
`{op:'presence', topic, users:[{userId, name, avatar, state, clientId}]}` (on every change and after subscribing),
`{op:'pong'}`, `{op:'error', code: 'NOT_SUBSCRIBED'|'BAD_MESSAGE'|'UNKNOWN_OP', message}`.
Subscriptions are authorised per topic (project role; board → its project; issue → its project; own user topic only).
A client ignores events whose `client` is its own id (its optimistic change is already shown); on reconnect it
re-subscribes and reloads the board. Edits carry `rev`; a 409 shows "changed by X" and merges.

Extension path (not built now): `realtime.transport` is pluggable — the hub publishes through an adapter
(`memory` now; `pg-notify`, `redis`, or polling `change_log` later) so several web servers, or desktop apps on one
shared database, can share events. The desktop UI already uses `live/channel.js`; enabling it there means giving the
desktop core a hub + transport, no UI change.

## 7. Desktop shell ↔ core

`core.rs` spawns `node server/desktop.js --port 0 --data <appDataDir> --parent-pid <pid> [--packaged]` (debug: the
checkout's node; release: `runtime/node(.exe)` + `runtime/desktop.cjs` bundled by esbuild, `\\?\` stripped from paths)
and waits for `MYBOARD_READY <port> <token>` on stdout (on failure: `MYBOARD_FAILED <code> <message>` on stderr, exit 1).
Tauri command `core_info` → `{ url, token }`.
- Windows load the UI from the app's dist (tauri://), so the core sends CORS headers for `http://tauri.localhost`,
  `https://tauri.localhost`, `tauri://localhost` and — unless `--packaged` (or env `MYBOARD_PACKAGED=1`) — for the Vite
  dev origins `http://127.0.0.1:*` / `http://localhost:*`.
- Listens on 127.0.0.1 only; exits when the parent pid disappears (checked every 2 s) or on SIGINT/SIGTERM.
- The bundle works as CommonJS (`esbuild server/desktop.js --bundle --platform=node --format=cjs` — no `import.meta`
  in core/ or server/; `isMain` is detected from `process.argv[1]` ending in `desktop.js/.cjs/.mjs`).
- Desktop has a local user (`local`, admin) created on the first start (no login) unless the database is shared and has
  more than one active user with a password; then `info.needsLogin` is true and the UI logs in and sends `X-Session`.
- If the stored database cannot be reached, the core starts on the local SQLite file and reports `info.dbError`.

Database config on desktop lives in `<dataDir>/database.json` (password encrypted with AES-256-GCM using the
per-install key file `<dataDir>/database.key`); `POST /db/switch` writes it.

The web server (`npm run web` → `node server/web.js [--config file] [--port 8080] [--host 0.0.0.0] [--data ./data]
[--static ./dist]`) reads `--config myboard.config.json` ({ port, host, dataDir, staticDir, db: {…} | { url },
sessionDays, secureCookies, corsOrigins }) or env `MYBOARD_PORT / HOST / DATA / STATIC`, `MYBOARD_DB_URL` or
`MYBOARD_DB_TYPE / _HOST / _PORT / _NAME / _USER / _PASSWORD / _FILE / _SSL`. Without either it uses
`<dataDir>/database.json` (written by /db/switch), else SQLite in dataDir. It serves `dist/` (SPA fallback to
index.html, immutable caching under `assets/`) next to the API. Exported `startWeb(cfg)` / `startDesktop(opts)` are used
by the tests.

Tests: `npm run test:core`. The MySQL / MariaDB / SQL Server suites run when `MYBOARD_TEST_MYSQL`,
`MYBOARD_TEST_MARIADB`, `MYBOARD_TEST_MSSQL` hold connection URLs to **empty test databases** (every MyBoard table is
dropped first); otherwise they are reported as skipped ("not configured").

## 8. UI shell (src/, src-tauri/)

Forked from MySketchBook's shell; the 3D/interior parts were left out. Every window runs `index.html` →
`src/main.js`, which loads one of: `app.js` (the main window), `popup.js` (`?popup=<kind>` or an OS window
`popup-<kind>`), `viewer.js` (help documents, `?viewer=<kind>` or `doc-<kind>`).

| file | role |
|---|---|
| `app.js` | main window: menu bar (= title bar), toolbar (icon + label; folds into » when narrow; language, theme, min/max/close never hidden), sidebar, `#workspace`, `#detail`, bottom panel (Activity · Messages · Information), status bar with grip; commands, menus, context menus, start page wiring, settings, progress, recent list, Undo/Redo, tutorial; test hook `window.__myboard` |
| `popup.js` | popups: settings (general, start page, theme, font, background, board, database, recent, shortcuts), about, confirm, error, progress, recent, menu (with submenus; the toolbar theme ▾ is a menu with dark/light submenus of swatches), colour, prompt, welcome, login, iconpicker, form |
| `api/client.js` | `api()` → ApiClient: base + token from `core_info` (desktop) or same origin (web); `X-Client-Id`; errors → `ApiError { code, status, details }` (no JSON answer / nothing behind a proxy → `code: 'unreachable'`); typed helpers per §5 resource |
| `live/channel.js` | §6: `WsChannel` (web: reconnect with backoff, hello + re-subscribe + presence again, own events dropped, `state` with `resync`) and `NullChannel` (desktop) — same interface |
| `views/registry.js` | where the workspace views plug in: `registerView(id, { mount(host, ctx), update?, unmount?, commands? })`, ids `board`, `backlog`, `reports`, `projectSettings` (centre `#workspace`) and `detail` (right `#detail`); placeholders until registered. Optional `sidebar: { icon, title(ctx), mount, update?, unmount? }` = the view's own selection list in the **lower part of the left panel** under its own title (app.js `renderSide`; helpers `views/shared/sidebar.js` `linkSidebar`): board — quick filters, swimlane mode, columns to jump to; backlog — saved filters, epics, versions; reports — reports and dashboards; project settings — the sections. The tree on top takes only its height; the divider is draggable (`leftViewHeight`) |
| `ui/iconref.js` | `renderIconRef(ref, { size, title, fallback })` for `b:` `e:` `u:` `l:`; built-in names are lowerCamelCase, hyphenated spellings and `ICON_ALIASES` resolve (`b:priority-highest` → `highest`); `:icon[ref]` in HTML text |
| `ui/iconpicker.js` | the icon picker component (popup `iconpicker`, `app.pickIcon(value)` → ref / '' / null): built-in (search ko/en + categories), emoji, uploaded (GET/POST/DELETE `/api/icons`, button/drop/paste, rasters → ≤256 px PNG, animated GIF/WebP ≤512 KB kept, SVG raw), letters, colour, recent |
| `views/shared/` | helpers for every view (import `views/shared/index.js`): `createLookups(boardData)`, `cardHtml(card, L, opts)`, `issueToCard`, `avatarHtml`, `typeIconHtml`, `priorityIconHtml`, `labelChipsHtml`, `epicChipHtml`, `dueChipHtml`, `progressHtml`, dates/durations (`formatDate`, `relativeTime`, `formatDuration`, `parseDuration`, `dueState`), `errorMessage(error, t)` (by code), `openRefList` / `refButtonHtml` (IconRef dropdown) |
| `ui/formpopup.js` | popup `form`: `popups.open('form', { title, icon, intro?, submitLabel?, fields: [{ name, type: text\|textarea\|number\|select\|multiselect\|user\|date\|icon\|checkbox\|duration\|color, label, value, options [{ value, label, iconRef?, glyph?, when? }], required, placeholder, hint, min/max/step, allowNew, when { field: value(s) } }] })` → `{ values }` or null; IconRef dropdowns (`views/shared/refdropdown.js`), −/+ steppers, icon fields ask the host (`form-pick-icon`); date → 'YYYY-MM-DD'\|null, duration → seconds, empty number → null |
| `icons.js`, `icon-tones.js` | the app's own command icons (coloured by meaning) |
| `icons-catalog.js`, `ui/emoji-data.js` | IconRef data: 421 built-in icons in 17 categories (ko/en names + keywords), 1029 emoji with en/ko keywords |
| `ui/startpage.js`, `startboard.js`, `startlayout.js`, `background.js` | start page: moving background, movable/resizable translucent cards (hero, start, database, recent, templates, samples, background); no side/bottom panels there |
| `domain/` | settings (localStorage `myboard.settings.v1`), recent boards (`board:<id>@<db>`), command-based undo history, starters (templates, samples), help docs |
| `i18n.js`, `i18n/{ko,en,board}.js` | texts; `registerTexts({ ko, en })` for feature modules |

Desktop (`src-tauri/`): `lib.rs` (windows, popups as OS windows owned by the main window, window drag/resize from
the page, fonts, clipboard, background image, help windows, single-instance info and window cascade, panic → error
popup), `core.rs` (§7; `core_info` waits for the core started on a background thread; `core-exited` event when it
stops; killed on exit), `window_state.rs` (place and size per window), `instance.rs`, `files.rs`, `fonts.rs`, `i18n.rs`.
Installer: NSIS with `windows/hooks.nsh` (UTF-8 BOM; "delete user data" never deletes the database files),
`.myboard` file association with its own icon (Windows, macOS `Info.plist`, Linux MIME).
