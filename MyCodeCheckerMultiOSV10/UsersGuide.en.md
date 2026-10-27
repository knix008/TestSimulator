# MyCodeChecker User's Guide

MyCodeChecker is a **code quality and security workbench** that runs on your own computer. Open a source folder and analyze it to see bugs, vulnerabilities, code smells and security hotspots, duplications, coverage, ratings and the quality gate (Code Quality); follow C/C++ defects along their paths (Defect Analysis); and manage compliance with the Korean MOIS security weakness guide, MISRA, CERT and other standards, with an exception approval workflow (Security Weakness).

The analysis runs in the program's own Node.js engine. The desktop program (Windows, macOS, Linux) and the web version use the same engine and the same screens. Source code does not leave the computer during an analysis. Only two features send anything out, and only when you turn them on: **AI CodeFix** and **Check online (OSV.dev)**.

## What it does

| Area | Features | Similar tools |
|---|---|---|
| Code quality | 4161 rules in 38 languages; bugs, vulnerabilities, code smells, security hotspots; A–E ratings; technical debt | code quality |
| Quality management | Quality gates, quality profiles (inheritance, compare, backup), new code, branches and pull requests, portfolios | code quality |
| Measures | Coverage (lcov, Cobertura, JaCoCo, Clover, OpenCover, Go, generic XML), duplications, complexity, test results | code quality |
| C/C++ defects | Path-sensitive checkers (null dereference, use after free, resource leak, overrun …), CIDs, streams and snapshots, triage, components, policies, function models, command line (`npm run defects`) | Defect Analysis |
| Security weaknesses | MOIS 2021 (49 items), critical information infrastructure, OWASP, CWE Top 25, PCI DSS, ASVS, STIG | Security Weakness, code quality |
| Coding standards | MISRA C:2012/2023 and C++:2023, CERT C/C++, AUTOSAR C++14, MISRA C:2004 and C++:2008, HIS metrics | Security Weakness, Defect Analysis, Polyspace |
| Exceptions | False positive / accept only through request → approve / reject | Security Weakness |
| Architecture | Module dependency graph, instability, cycles, layer rules | architecture analyzers, code quality |
| Dependencies (SCA) | Vulnerable packages, reachability, snippet and binary identification, licenses, SBOM | Black Duck |
| Web scanning (DAST) | Passive and active checks of a running web app | OWASP ZAP |
| Reports | HTML, CSV, Word, Excel, PDF, regulatory ZIP | all |
| Collaboration | Users, permissions, tokens, LDAP, mail notifications, Jira / Redmine / GitHub / GitLab tickets, PR decoration, webhooks, scheduled analyses, audit log | Code Quality, Defect Analysis servers |
| AI | Ask an LLM for a fix of one issue, review it as a diff, apply it | AI CodeFix |
| Data | Export results to SQLite, PostgreSQL, MySQL/MariaDB or SQL Server | — |
| Workspace | Project files (.mccp), undo / redo, save prompt on exit, analysis progress window, tabs, panels that fold and turn off, 40 themes plus your own, 20 animated Start page backgrounds, a tutorial, the user's guide inside the app | the same screens as MyHeatManager and MyCAD |

## Installation

### Desktop (Windows, macOS, Linux)

| OS | Installer | Notes |
|---|---|---|
| Windows | `MyCodeChecker_<version>_x64-setup.exe` (NSIS) | The installer fetches WebView2 when it is missing |
| macOS | `.dmg` (with the `.app`) | If the first start shows an "unidentified developer" warning, right-click › Open in Finder |
| Linux | `.deb` or `.AppImage` | Make the AppImage executable (`chmod +x`) and run it |

The installers carry Node.js and the analyzers; you can analyze without installing anything else.

**The Git question at the end of the Windows installer** — when Git is missing, the installer asks "Git is not installed … Install Git now with winget?". **Yes** installs Git with winget, **No** just finishes. On a computer without winget it only shows the download address. Silent installs (`/S`) never install anything extra. You can install it later at any time from **Tools › Required software…**.

### First start — required software

When the program first loads its workspace it looks for the external programs some features use and, if any are missing, opens **Install required software**. **Nothing is installed until you press "Install".**

| Program | Kind | Used for | Without it |
|---|---|---|---|
| Git | Recommended | SCM new code, automatic author assignment, pull request analysis, desktop analysis | New code is decided against the previous analysis; author assignment and PR analysis are off |
| C/C++ compiler (LLVM / Clang) | Optional | C/C++ build capture (`npm run defects -- build`) | C/C++ can still be analyzed without a build (buildless) |

For each tool choose **Install**, **Later** (asked again at the next start) or **Don't ask again**. **Command to run** and **Copy command** let you run the package manager command (winget, scoop, Homebrew, apt, dnf, pacman, zypper) yourself. Without a usable package manager, **Download page** opens the vendor's page. The same list is in **Administration › Required software**; turn off **Check at start** to stop the question at start.

### Web version

To use it in a browser, run `npm run web` in the source folder and open http://127.0.0.1:5211. For a team server start it as `node server/server.js --host 0.0.0.0 --port 5211` and turn on permission checks in **Administration › Users & permissions**. In the web version you type the folder path as the server sees it instead of picking a folder.

## Screen layout

```text
┌ Menu bar: Start · File · Edit · Issues · Quality · View · Tools · Help ── theme · language (flag) · window buttons ┐
├ Toolbar: Open · Analyze · Desktop | Undo · Redo | Overview · Issues · Hotspots · Code · Gates | Branch ── Nav · Bottom · Details ┤
│ Left panel   │ Tab strip: [Home] [Overview ×] [Issues ×] …           < > ⌄ │ Right panel        │
│ (navigation) │ Centre: the current tab's view (lists, tables, graphs)     │ (details)          │
│              ├────────────────────────────────────────────────────────────┤                    │
│              │ Bottom panel: Problems · Analysis log · Jobs · Output       │                    │
└ Status bar: project · path · message · files · lines of code · quality gate ──────────────── resize grip ┘
```

### Menu bar

| Menu | Items |
|---|---|
| Start | Opens the Start page (the Home tab) |
| File | New project… (Ctrl+N) · Open project… (Ctrl+Shift+O) · Save project (Ctrl+S) · Save project as… (Ctrl+Shift+S) · Delete project · Recent projects › 1.–10. · Clear the list · Open folder… (Ctrl+O) · Sample project · Reports… · Export JSON · Export SARIF · HTML report · Export CSV · Quality gate badge · Defect CSV · Quit |
| Edit | Undo (Ctrl+Z) · Redo (Ctrl+Y · Ctrl+Shift+Z) — the items carry the name of the action (for example "Undo: Project settings") |
| Issues | All · Bugs · Vulnerabilities · Code smells · Security hotspots · Exception approval |
| Quality | Rules · Quality profiles · Quality gates · Portfolios · Security reports · MISRA compliance |
| View | Overview · Measures · Code · Duplications · Architecture · HIS metrics · Activity · Defects · Streams · Background tasks · Dependencies · Snapshots · Pull request analysis · Web scan (DAST) · Left panel (navigation) · Right panel (details) · Bottom panel (problems, log, jobs, output) |
| Tools | Settings (Ctrl+,) · Custom rule · Required software… · Administration · (when signed in) Sign out |
| Help | User's guide · Tutorial document · README · Architecture document · Start the tutorial · User guide · Keyboard shortcuts · About |

With one menu open, hovering another switches to it. At the right end are the **theme** button (click for the next theme, the arrow for the theme list) and the **language** button (flag + KO/EN, with 한국어 and English). On the desktop there is no system title bar; the menu bar takes its place. Drag an empty spot to move the window; minimize, maximize and close are at the right end (the close button turns red on hover). On the desktop, dialogs, menus and dropdowns open as **separate windows**, so they can extend outside the main window.

### Toolbar

Buttons with an icon and a label (when the window is narrow the labels hide and the icons stay).

| Group | Buttons |
|---|---|
| Analysis | **Open** (open folder, Ctrl+O) · **Analyze** (commit defects, Ctrl+Enter) · **Desktop** (desktop analysis — leaves the stream alone) |
| Edit | **Undo** · **Redo** — hover to see the name of the action they undo (redo); greyed out when there is nothing to do ([Undo and redo](#undo-and-redo)) |
| Views | **Overview** · **Issues** · **Hotspots** · **Code** · **Gates** |
| Branch | the **Branch** field — type or pick a name to see that branch's results and to analyze under that name |
| Panels | **Nav** · **Bottom** · **Details** — turn the left, bottom and right panels on or off (an active button looks pressed) |

While an analysis runs, "Analyzing…" spins. An analysis that takes more than about a second also opens the [analysis progress window](#analysis-progress-window).

### Tabs

The centre area works with tabs. **Home** (the Start page) is pinned first; every view opened from the navigation or a menu gets a tab with its icon and title.

- Close a tab with its **×** or a middle click; drag tabs to reorder them.
- Right-click a tab: **Close tab** · **Close other tabs** · **Close tabs to the right** · **Close all tabs**.
- When the tabs overflow, **<** **>** (click = one tab, hold = repeat) and **⌄** (list all open tabs) appear.
- Ctrl+Tab / Ctrl+Shift+Tab go to the next / previous tab; Ctrl+W closes the current tab.

List views (issues, rules, dependencies, web scan findings, scheduled analyses and more) keep the title, filters and column headings in place; **only the rows scroll**. In a very small window, where the headings alone would fill it, the whole view scrolls.

### Panels

- **Left panel — navigation.** Views in five groups: **Project**, **Issues**, **Defect Analysis**, **Security & compliance** and **Administration**. Click a group name to fold or unfold it; **Expand all** / **Collapse all** at the top change them all. The numbers next to Issues, Security hotspots, Defects and Exception approval are the open issues, hotspots to review, outstanding defects and exception requests waiting for approval.
- **Right panel — details.** The details of the item picked in a list show **only here**: issues (code, why, how to fix, actions, tickets, AI CodeFix), defects (event path, triage), security hotspots, rules, files and architecture modules. With nothing picked it says "Nothing selected."
- **Bottom panel** — four tabs:
  - **Problems** — the issues that fit the current view (the open issues of the file in Code, hotspots to review in Hotspots, outstanding defects in Defects, else open issues). Click a row to jump there.
  - **Analysis log** — the last task's status, branch and time, duration, files, lines of code and languages, findings per engine, coverage, quality gate and engine warnings.
  - **Jobs** — running analyses, web scans and software installs, and the last and next run of scheduled analyses.
  - **Output** — the program's messages with their times, with a clear button.

Each panel's **Fold** button folds it to a **strip with only its icon and title**; click the strip to **Unfold**. **Close panel** or the toolbar toggle turns it off. Drag the splitter between panels (or focus it and use the arrow keys) to change width or height. On/off, folded and size are saved; **Settings › Advanced › Reset panel sizes and layout** restores the original arrangement.

### Status bar

The open project's name and path, the last message (for example "Quality gate passed."), the number of files, lines of code and the quality gate result. Drag the grip at the bottom right to resize the window.

### Term tooltips

Terms with a dotted underline (ratings, technical debt, duplicated lines %, coverage, lines of code, Ca, Ce, I, HIS metrics, CID, impact, checker, severity …) show their name and meaning in a tooltip when you hover them or move the keyboard focus onto them (Esc closes it). The architecture, HIS metrics and defects views also have a **Terms** box with the view's terms.

### Undo and redo

**Edit › Undo** (Ctrl+Z) takes back the last change and **Redo** (Ctrl+Y or Ctrl+Shift+Z) does it again. Hover the same buttons in the toolbar to see the action, for example "Undo: Quality gate change"; afterwards "Undone: …" shows briefly. What can be undone:

- issue status, resolution, assignee and tag changes (one issue, or many at once with **Apply to selected**)
- edits of quality gates, quality profiles, portfolios, Defect Analysis policies and custom rules
- project settings (the values in Administration › Analysis settings, the project name …)
- panels turned on/off or folded, and the Start page card layout (move, resize, auto arrange)
- **AI CodeFix apply** — undo puts the file back as it was before the fix; if the file changed again after the fix, it is not touched and you are told why

A new action clears the redo side; opening another project clears both (up to the last 100 actions are kept).

### Analysis progress window

An analysis that takes more than about a second opens the **Analysing** window.

- **Phase** — Collecting files → Running rules → Running engine: {engine} → Finishing
- the file being read or the engine running, a percentage bar, **Elapsed** and **Remaining** time
- **Cancel** — asks "Stop the running analysis?" and then stops it. Nothing from a cancelled analysis is saved, and Background tasks records it as **Canceled** (CANCELED), not as a failure (FAILED).

Starting another analysis of a project that is already being analyzed does not start a second one; it attaches to the running one ("This project is already being analyzed; attached to that analysis."). You can keep triaging issues (status, assignee, comments) and changing settings while it runs: those changes are kept when the analysis saves its result.

### Error messages

Errors are shown in the UI language (Korean / English), with a code where it helps.

| Code | Meaning |
|---|---|
| NOT_FOUND | The project, issue, user … was not found; it may have been removed or changed |
| BAD_REQUEST | An invalid value (path, cron expression, password length …) |
| CONFLICT | The item already exists, or the change conflicts with another one |
| APPROVAL_REQUIRED | False positive / accept needs an approved exception request |
| LAST_ADMIN | The last active administrator cannot be removed or deactivated |
| FORBIDDEN · UNAUTHORIZED | No permission · sign-in needed |
| TOO_MANY | Too many failed sign-ins; the login is locked for a while |
| CANCELLED | The analysis was cancelled |

## Start page

The **Home** tab shown when the program opens (open it any time with **Start** in the menu bar). Cards sit on an animated background.

- **Hero card** — program icon, name and version, a one-line introduction, and **User's guide**, **Tutorial document** and **Start the tutorial** buttons.
- **Banner** — "New here? The tutorial drives the real screens and walks you from opening a folder through analysis, issue handling and reports." with a **Start** button. Once closed it stays hidden (bring it back with **Settings › Advanced › Tutorial banner › Show it on the start page again**).
- **New analysis** — shortcut tiles by category. The action buttons (**New project…**, **Open project…**, **Open…**, **Start from the sample**, **Import results**) sit at the top of the card, the tiles below them.

  | Group | Tiles |
  |---|---|
  | Basic | New project (create a .mccp project file and analyze) · Open folder · Sample project |
  | Code quality | Java · Kotlin · JavaScript · TypeScript · Python · C# |
  | Security weakness & rules | MOIS 49 checks · MISRA C/C++ · CERT · AUTOSAR |
  | Defect Analysis | C/C++ build capture · Desktop analysis |
  | Web & supply chain | DAST web scan · SCA dependencies · SBOM |
  | Server & CI | Server upload · Scheduled analysis |

  The **Code quality** language tiles pick a folder, analyze it and then open **Issues** filtered by that language (for example only Java · Kotlin issues). The **Security weakness & rules** tiles open that standard: MOIS 49 checks → Security reports (MOIS 2021), MISRA C/C++ → MISRA compliance (MISRA C:2012), CERT → Security reports (CERT C), AUTOSAR → MISRA compliance (MISRA C++:2023).

- **Recent projects** — the last 10 projects opened (folders and .mccp files) with their last quality gate. Click to open. Each row has **×** (Remove from the list) and the card has **Clear all** (projects and their analyses are kept). Missing files show "Not found".
- **Background** — kind, shuffle, speed, transparency.
- **Help** — user's guide, tutorial, keyboard shortcuts.
- **Samples** — the bundled examples (see [Samples](#samples)); **Open** analyzes one right away.

**Moving and resizing cards** — drag the **⠿** handle in a card's header to reorder, drag its bottom-right corner to change width (1–3 columns) and height; double-click the corner for automatic height. When you move or resize a card, the cards below it move up to fill the gap. **Auto arrange** re-packs the cards evenly over three columns at their content height (and can be undone). **Reset card layout** (Settings › Start page) restores the original arrangement. The layout is saved.

**Animated background** — 20 kinds on the theme of code analysis: particles, code rain, binary, scan line, bug hunt, dependencies, call pulse, AST tree, control flow, data flow, radar, hex grid, circuit, constellation, gate lights, commits, terminal, spectrum, heat map and brackets. Colours follow the theme; the animation pauses while the window is hidden.

Turn off **Always show the Start screen on launch** (Settings › General) to start in the last project's overview.

## Project files and samples

### Project files (.mccp)

You can analyze a folder as is, but a **project file** (`*.mccp`) keeps the source folder and the project settings in one file you can share with the team (commit it next to the code). On the desktop, double-clicking a `.mccp` file opens it in MyCodeChecker (it has its own file icon).

- **File › New project…** (Ctrl+N) — name (e.g. Payment server), **Source folder** (Browse…), **Project file** (default `<source folder>\<key>.mccp`), and under **More settings**: main branch, description, exclusion patterns. Turn on **Analyze right after creating** and press **Create**. If a file of that name exists you are asked to **Overwrite**. If the source folder is already registered as a project, you are told "This folder is already registered as the project '…'. Replace it?" and choose **Replace** (use the new settings), **Open existing project** or **Cancel**. Other settings (include directories, defines, coverage …) are changed in Administration › Analysis settings and written to the file with **Save project**.
- **File › Open project…** (Ctrl+Shift+O) — type the path of a `.mccp` file or pick one from **Recent project files**.
- **File › Save project** (Ctrl+S) / **Save project as…** (Ctrl+Shift+S) — write the current project settings to the file. Saving over an existing `.mccp` that this project was not opened from asks first: **Replace**, **Save elsewhere…** or **Cancel**.
- **File › Delete project** (or **Delete project** in **Administration**) — after a confirmation, removes the project and its analyses from the workspace. **The source folder and the .mccp file are not deleted**, so you can open it again later.
- **File › Recent projects** — numbers 1–10 and **Clear the list**.

**Unsaved changes** — when the project settings or an open editor (the settings window, rule / gate / profile editors, the new-project dialog) have unsaved changes, the title shows a **●** (hover: "There are unsaved changes"). Closing the window or **Quit** lists what changed and asks **Save**, **Don't Save** or **Cancel**.

**Files from older versions** — workspaces (`workspace.json`) and project files written by older versions are converted to the current format automatically on first open. The triage of issues and defects (status, classification, assignee, comments) is kept.

The file is JSON: `name`, `key`, `source` (relative to the project file, so it keeps working when the folder moves) and `settings` (`mainBranch`, `exclusions`, `includeDirs`, `defines`, `coverageReports`, `arch`, `newCode`, `profiles`, `gateId`, `policyId`, `description` …). Analysis results and issue states stay in the workspace, not in the file.

```json
{
  "format": "mycodechecker-project",
  "version": 1,
  "name": "C++ 센서 로거",
  "key": "cpp-sensor",
  "source": ".",
  "settings": { "mainBranch": "main", "includeDirs": ["include"], "defines": { "SENSOR_VERSION": "2" } }
}
```

### Samples

| Sample | Location | Contents |
|---|---|---|
| Whole demo | `samples/demo` | 19 files in 14 languages with issues, defects and hotspots (Java servlet SQL injection, JavaScript eval and XSS, Python command injection, C MISRA and buffer overrun, Dockerfile, Kubernetes, Terraform, vulnerable npm dependencies, duplicated code …). **Sample project** analyzes this |
| C++ sensor logger | `samples/cpp-sensor` | A small C++17 program that reads sensors and logs CSV, with defects put in on purpose |

Open the **C++ sensor logger** with **File › Open project…** → `samples/cpp-sensor/cpp-sensor.mccp`, or pick it under **Samples** on the Start page. The project file carries the include path (`include`) and a define (`SENSOR_VERSION=2`). It finds command injection (OS_CMD_INJECTION), resource leaks (RESOURCE_LEAK), `new[]` / `delete` mismatch (DELETE_ARRAY), use after free (USE_AFTER_FREE), overflow before widening (OVERFLOW_BEFORE_WIDEN), uninitialized values (UNINIT), dereference after a null check (FORWARD_NULL), buffer overrun (OVERRUN), a header include cycle (arch:cycle), plus MISRA C++:2023 and C++:2008, AUTOSAR C++14 and CERT C++ violations and HIS metrics. It also works with the defect-analysis command line (the `directory` entries of its `compile_commands.json` are relative to that folder):

```bash
node scripts/defect-cli.mjs build --path samples/cpp-sensor --compile-commands samples/cpp-sensor/compile_commands.json
node scripts/defect-cli.mjs analyze --path samples/cpp-sensor --coding-standard-config misra-cpp2023,autosar,cert-cpp --aggressiveness-level high
node scripts/defect-cli.mjs format-errors --dir samples/cpp-sensor/.mcc
```

`samples/cpp-sensor/README.md` lists every defect location and the defects not found yet.

## Tutorial and user's guide

- **Tutorial** — a guided tour that drives the real screens through the features (start page, running an analysis, handling issues, AI CodeFix, defects from defect analysis, security and compliance reports, administration and settings). Open it with **Help › Start the tutorial**, **Start the tutorial** on the Start page or **Start** on the banner. At the first start a "Welcome to MyCodeChecker" box offers **Start tutorial**, **Continue** (from the step you reached last time) and **Later**; turn off **Show the tutorial welcome at start** in it to stop it. The tutorial document (with screenshots) is **Help › Tutorial document**.
- **User's guide window** — **Help › User's guide** (or Tutorial document, README, Architecture document) opens this guide in a window inside the app. Its toolbar picks the document, switches between 한국어 and English with flag buttons, goes back and forward with ◀ ▶, and **Open in a new window** opens it in the browser. The window **follows the app's theme colours** and changes with the theme while it is open. Esc closes it. A document that has not been built shows "not built" (run `npm run build:docs` in the source folder).

## First analysis

1. **Open folder…** (Ctrl+O, toolbar **Open**) and pick the source folder. To keep the settings in a file, create a [project file](#project-files-mccp) with **New project…** (Ctrl+N). The desktop shows a folder picker; the web version shows a **Folder path** box (type the full path and press Enter). To practise, use **Sample project**.
2. The analysis starts at once; progress shows in the [analysis progress window](#analysis-progress-window) and in **Jobs** and the result in **Analysis log** in the bottom panel. When it is done, **Overview** opens and the status bar shows the gate.
3. After changing code, press **Analyze** (Ctrl+Enter) in the toolbar again. To see only new defects without changing the stream, press **Desktop**. From the second analysis on, results for **new code** compared with the previous analysis show separately.

Left out of the analysis: folders such as `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `bin`, `obj`, `coverage` and `.mcc`; files that match the **Exclusion patterns** setting; the project's **Excluded folders**; files over 800 KB; binary files. 

**Excluded folders**: in **File › Excluded folders…** (or **Excluded folders** in Administration › Analysis settings, and under **More** in the New project dialog) expand the source folder's tree and check the folders to leave out. A checked folder and every file below it are not analyzed. A folder with the same name elsewhere stays in (excluding `apis` still analyzes `src/apis`). Folders that are always skipped are marked **always skipped**. It applies from the next analysis and is saved in the project file (`.mccp`) as `excludeDirs`.

**Delete results and analyze again**: **File › Delete results and analyze again…** deletes the project's stored analyses (every branch's latest result, activity history, snapshots and new-code baseline) and analyzes again at once. With no baseline, all code is new code, so a quality gate that checks new code judges every problem. **Delete results only** keeps issue states (confirmed, false positive, assignee, comments); **Delete issue states too** removes them as well. This cannot be undone.

A line containing `NOMCC`, `noqa`, `nolint`, `mcc-ignore`, `cov-ignore` or `parasoft-suppress` reports no issues. In C/C++, a `// mcc[CHECKER]` comment turns off only that checker on its line (or, on a comment-only line, the next code line).

## Views

### Project

#### Overview

The quality gate (**Passed** / **Failed**; when failed, the number of unmet conditions and **See conditions**), rating cards (**Reliability**, **Security**, **Maintainability**, **Security review**; A Very good – E Very bad), counts of bugs, vulnerabilities, code smells and hotspots, technical debt and **Debt ratio**, coverage, duplication, lines of code and languages. On each card the big number is overall code and the line below it is new code. Click a card to go to the issue list filtered by that kind.

Ratings follow the published code quality scale: reliability by the worst bug, security by the worst vulnerability, security review by the share of reviewed hotspots, maintainability by the technical debt ratio (30 minutes of development per line of code).

#### Measures

A table of every measure (**Metric**, **Key**, **Value**): files, lines of code, comment density, complexity, duplicated blocks, lines and density, coverage, ratings, debt, new-code measures, and test metrics (when a test report was imported).

#### Code

The file list on the left (**Filter by file name**; the number is the issue count) and the source on the right. Lines with issues are highlighted and marked "There is an issue on this line." Clicking a location in Issues, Defects, Duplications or HIS opens this view at that line.

#### Duplications

Code blocks (8 or more normalized lines) that appear in two or more places. Each block shows "{n} places" and the locations; **View code** opens one.

#### Architecture

The **Terms** box at the top of the view (it folds) explains the metrics; hovering a column header shows them too.

| Term | Meaning |
|---|---|
| **Ca** (afferent coupling) | How many other modules use (depend on) this module. High means much relies on it, so change it with care |
| **Ce** (efferent coupling) | How many other modules this module uses. High means changes elsewhere affect it |
| **I** (instability) | I = Ce / (Ca + Ce), 0 to 1. Near 0 is stable, near 1 unstable. Dependencies should point towards lower I |
| **Cycles** (dependency cycle) | Modules depending on each other in a loop (red edges in the graph); best broken |
| **Module** | The unit dependencies are grouped by (source folder or package, from imports / includes). The box outline colour is I |


The dependency graph between modules (folders, packages). The colour is the instability I = Ce / (Ca + Ce) (stable I = 0 to unstable I = 1); red lines are **cyclic dependencies**. Zoom with the wheel, drag to pan, **Fit** to see everything. Click a module to see its files, Ca, Ce and I, **Uses** and **Used by**. The tables below list modules, dependencies, cycles and **Architecture issues**. Layer rules are set in [Administration › Analysis settings](#analysis-settings).

#### Activity

Bars of issue counts per analysis (a red bar is a failed gate) and the history table.

#### Snapshots

Every committed analysis leaves a snapshot (the last 12). Tabs:

- **Compare** — compares the CIDs of two snapshots (from / to): newly detected, fixed, outstanding, triaged, newly dismissed, reopened.
- **Defect lifecycle** — per defect: first detected, last detected, fixed in snapshot, reintroduced.
- **Issue age** — average, median and oldest age (days) of open issues, and age buckets.
- **Trend** — line charts of bugs, vulnerabilities, code smells and more (hover for values), also **as a table**.
- **Activity** — changes of the quality gate, version, quality profile and Defect Analysis policy.

#### Reports

Reports save as **Word, Excel, PDF, PowerPoint, Markdown, HTML and CSV**. Every format carries the summary chart pictures (ratings, issues by type and severity, the ten most frequent rules): Excel on a **Charts** sheet, PowerPoint on slides. Markdown keeps the pictures inside the file (data: URIs) or in a `<report name>_images` folder next to it, as chosen in **Settings › Reports** (the browser gets one ZIP in that case). With **Settings › Reports › Save reports after each analysis**, every analysis writes the chosen reports in the chosen formats to the folder.


See [Generating reports](#generating-reports).

### Issues

#### Issues

To handle large projects (hundreds of thousands of issues), the window holds the **open project's issues only**. Opening a project or finishing an analysis fetches them in pages, with **Loading issues… n / total** at the bottom meanwhile. Switching projects fetches the new one's issues and lets the previous one's go. Lists show the first 300 rows; scroll to the end or press **Show more** for more.


The list of bugs, vulnerabilities and code smells. Search at the top (**Search rules, messages, files**) and filter by **Severity** (Blocker, Critical, Major, Minor, Info), **Type**, **Status**, **Engine**, **Standard** (OWASP, CWE, MISRA, MOIS …), language and **New code only**. Arriving from a category in Security reports or MISRA sets a **Category filter**; **Clear filter** removes it.

Click an issue and the right **Details** panel shows:

- the message, rule and location (click to open the code), the surrounding code, **Why**, **How to fix**, standards mapping, engine, MISRA category and decidability
- the **Data flow (source → sink)** or event path (source, assignment, call, return, propagation, sanitizer, branch, sink) — click a step to go to its line
- actions: **Confirmed** (the issue is real), **Accept** (known, not fixed now), **False positive** (wrongly found), **Reopen**
- **Assignee**, **Add comment**, **Tags** (type and press Enter), **Changelog**
- **Request exception** — see [Exception requests and approval](#exception-requests-and-approval)
- **Create ticket** — pick a configured tracker (Jira, Redmine, GitHub, GitLab); the ticket is attached as the **External reference**
- **Suggest a fix with AI** — see [AI CodeFix](#ai-codefix)

To work on several issues, press **Select**, tick them and use **Apply to selected** to change status or assignee at once. Marking several issues as **False positive** or **Accept** at once asks first ("Close the {n} selected issues as false positives?"). Status, assignee and tag changes, single or bulk, can be taken back with **Edit › Undo**.

Issue statuses: Open, Confirmed, Reopened, Resolved (Fixed, False positive, Won't fix), Accepted, Closed. When the same issue (same rule, file and line content) shows up in the next analysis, its status, comments and assignee carry over.

#### Security hotspots

Security-sensitive code that a person has to review before it counts as a problem (for example crypto settings, cookies, regular expressions, command execution). Review each one and set the **Review result** to **Acknowledged** (known risk, to be fixed), **Fixed** or **Safe**. It moves from To review to Reviewed and counts toward the security review rating.

#### Exception approval

When **Administration › Analysis settings** has **Require approval for false positive / accept** on, false positive and accept go only through exception requests. Pending requests (request, requested by, reason) collect in this view. Pick them, write a **Comment** and **Approve** or **Reject** (a comment is required to reject). This needs the Administer issues permission.

#### Pull request

See [Pull request analysis](#pull-request-analysis).

### Defect Analysis

#### Defects

The **Terms** box at the top: **CID** (defect identifier — the same defect keeps its number across analyses; snapshots are compared by it), **Impact** (how much harm the defect can do: High, Medium, Low), **Checker** (the name of the check that found it, e.g. NULL_RETURNS), **Outstanding** (neither fixed nor dismissed), **Dismissed** (classified as false positive or intentional), **Snapshot, stream** (the defect list of one committed analysis; the sequence of snapshots per branch).


The defect-analysis defect list. Choose a view at the top — **Outstanding**, **Newly detected**, **High impact**, **Dismissed**, **Fixed** — and **search by CID, checker, file or function**. Click a defect and the right panel shows the checker, impact (High, Medium, Low), component and function, the **Events** path (for example alloc → free → use, with the main event highlighted) and the **Triage** fields.

| Field | Values |
|---|---|
| Classification | Unclassified · Pending · Bug · False Positive · Intentional |
| Action | Undecided · Fix Required · Fix Submitted · Modeling Required · Ignore |
| Severity (triage) | Major · Moderate · Minor · Unspecified |
| Owner · External reference · Legacy | the owner, a bug tracker id, mark as a legacy defect |

False Positive, Intentional and Ignore dismiss the defect. Triage belongs to the CID and carries over to later snapshots.

#### Streams

Every **Commit defects** adds a snapshot to the stream named after the branch. Per snapshot: outstanding, newly detected, high impact, dismissed, fixed and the policy result, plus **Compare snapshots**. The first snapshot is the baseline; the policy counts new defects from the next commit on.

#### Components

Map path patterns (globs) to component names and owners (for example `src/net/**` → Network, Kim). Files that match nothing are Other. Defect lists and reports group by component.

#### Policies

The default policy "Defect Analysis default" fails a commit when any **new high-impact defect** (security included) appeared after the baseline snapshot. **Assign to this project** attaches it to the project. When the policy fails, the status bar says "Defect Analysis policy failed." and `npm run defects -- commit-defects` exits with code 1.

#### Function models

Tell the analyzer how library functions behave to find more defects. Add a function name pattern and its kind (**allocator**, **sink** — dangerous use, **source** — external input). `npm run defects -- make-library` builds them from C stubs.

### Security & compliance

#### Security reports

Pick a **Standard** to see, per category, the vulnerabilities and security hotspots, rating, **Hotspots to review** and the number of rules. Click a row to open the issue list filtered by that category's rules. Also **Hide empty categories** and **Unmapped issues** (security issues that fit no category).

Standards: OWASP Top 10 2017 and 2021, PCI DSS 3.2.1 and 4.0, DISA STIG ASD V5R3, SANS Top 25, CWE Top 25 2023 and 2024, OWASP ASVS 4.0 (L1–L3), the **MOIS software security weakness guide (2021), 49 items** (input validation and representation, security features, time and state, error handling, code errors, encapsulation, API misuse), the **critical information infrastructure web items**, CERT C and C++, MISRA C:2012, C:2023 and C++:2023. Rule set standards also show a **Verdict** (Compliant / Not compliant) with checked and violated rules.

#### MISRA compliance

In the MISRA Compliance:2020 manner. Pick a standard (MISRA C:2012, C:2023, C++:2023) to get three tabs.

- **Compliance summary** — per guideline: category (Mandatory, Required, Advisory), status (Compliant, Deviations, Violations, Disapplied, Not checked), violations and decidability. Filter by category and status; click a violation count to open the issues.
- **Recategorization** — a guideline can only become stricter (Advisory → Required → Mandatory, or Advisory → Disapplied). A downgrade is marked "cannot downgrade" and not applied.
- **Deviations** — **Add deviation** with guideline, scope (path globs, comma separated), justification, approver, date, expiry and permit. Mandatory guidelines cannot be deviated; a deviation past its expiry date is invalid.

**Save plan** applies the plan to the next verdict. The project is **Compliant** when no Mandatory or Required guideline has a violation not covered by a deviation and none is Not checked. Advisory violations are counted but never block. In CI, `scan.mjs --misra-gate` uses the same verdict.

CERT C/C++, AUTOSAR C++14 and MISRA C:2004 / C++:2008 rules are seen through the **Standard** filter of the issue list and the rule sets of reports.

#### HIS metrics

The **Terms** box at the top lists every metric with its name, meaning and HIS limit.

| Metric | Meaning (HIS limit) |
|---|---|
| **COMF** | Comment density = comments / statements (above 0.2) |
| **PATH** | Non-cyclic execution paths — the test cases full path coverage needs (≤ 80) |
| **GOTO** | goto statements (0) |
| **VG** | Cyclomatic complexity v(G) — independent paths, decisions + 1 (≤ 10) |
| **CALLING** | Different functions calling this one (fan-in) (≤ 5) |
| **CALLS** | Different functions this one calls (fan-out) (≤ 7) |
| **PARAM** | Parameters (≤ 5) |
| **STMT** | Statements (≤ 50) |
| **LEVEL** | Nesting depth of control structures (≤ 4) |
| **RETURN** | Exit points (1) |
| **VOCF** | Vocabulary frequency = (N1 + N2) / (n1 + n2) (Halstead); high means repeated code (≤ 4) |
| **ap_cg_cycle** | Recursion cycles in the call graph (0) |


HIS metrics for every C/C++ function: comment density (COMF), acyclic path count (PATH), goto count, cyclomatic complexity v(G), calling and called functions, parameters, statements, call depth, return count, language scope (VOCF) and recursion cycles. Values over the limit are red; the top shows average and maximum per metric and the number of violating functions. **Violations only** filters; click a row to open the code.

#### Dependencies

The SCA results, read from manifests and lockfiles (npm, Maven, Gradle, pip, Poetry, NuGet, Go, Cargo, Composer, Bundler …), SBOMs and binaries (.jar, .war, .whl, .nupkg, .dll, .so …).

- Summary: dependencies, direct, transitive, vulnerable packages, ecosystems, advisories
- **Dependencies** tab — **Tree** or **List** with package, version, kind, scope, license, vulnerabilities; **Include dev dependencies**
- **Vulnerabilities** tab — installed → fixed version, **Recommended upgrade**, **Dependency path**, aliases (CVE, GHSA), modified date, and **reachability** (reachable, imported, not-imported, unknown — whether your code really uses the package or the vulnerable function, with the evidence lines)
- **Licenses** tab — category (permissive, weak copyleft, strong copyleft, network copyleft, proprietary, unknown) and policy verdict (allowed, review, denied, no license)
- snippet matches (code copied from open source), dependency confusion (an internal package name that exists in a public registry) and supply-chain issues such as unpinned versions or end-of-life packages

By default only the bundled advisories are used. Enter an OSV dump folder (`*.json`, `*.zip`) or an `all.zip` in **OSV database** and press **Load** to use the full offline set (the path is read on the analysis server; **Use bundled only** goes back). **Check online (OSV.dev)** sends **only package names and versions** to osv.dev after a confirmation (never source code). Choose an **SBOM format** (CycloneDX 1.5 JSON, SPDX 2.3 JSON, SPDX tag-value) and **Export SBOM**.

#### Web scan (DAST)

Scans a running web application over HTTP. **Use it only on targets you own or are authorized to test.** It never sends requests outside the target's origin.

1. Enter the **Target URL** and choose the **Mode**. **Passive (observe only)** crawls and inspects responses. **Active (safe probes)** adds non-destructive GET/POST probes such as XSS and SQL injection, after you confirm "I am authorized".
2. Optionally set **Requests per second** (default 5), **Max requests** (default 500), **Max pages**, **Max depth**, and **Authentication & seeds** (cookie, bearer token, extra headers, login URL and fields, seed URLs, OpenAPI / Swagger).
3. **Start scan** — progress (phase, requests, pages, findings) shows; **Cancel** stops it.
4. Pick a result in **Scan history** to list its findings; click a finding for the parameter, evidence, **Request** and **Response**. **Save SARIF** exports it.

With permission checks on, users with the **Execute analysis** permission can read the scan results too. Scheduling an active scan in [Scheduled analysis](#scheduled-analysis) asks the same "I am authorized" question.

### Administration

#### Rules

All 4161 rules. **Search by rule name, key or tag** and filter by language, type, severity, engine and standard. Click a rule for why it matters, how to fix it and its CWE, OWASP, CERT, MISRA and MOIS mappings. The deactivate button turns the rule off in the default profile.

#### Quality profiles

Which rules are on, per language. At first every language has the default profile "Checker way".

- **Copy**, **Extend** (inherits the parent profile's settings and stores only the differences; shows "off in parent"), **Set as default**, **Use for this project**
- **Rules** tab — turn each rule on or off and change its severity; "{n} of {m} active"
- **Compare** tab — **Compare with** another profile and see the rule differences
- **Changelog** tab — created, activated, deactivated, severity, parent changed, restored; who and when
- **Back up** / **Restore** — save the profile as JSON and bring it back

A default profile or one with child profiles cannot be deleted.

A **Custom rule** (Tools › Custom rule) is a regex rule: give a pattern, name, type and severity, and every matching line is an issue from the next analysis.

#### Quality gates

The quality gate always tells the **current state**. The default gate judges the whole code — bug and vulnerability counts, hotspots reviewed, coverage, duplication, reliability, security and maintainability ratings (not only the code changed since the last analysis) — and judges again at once, without a new analysis, when you mark issues as false positives or accepted or change the conditions. To judge new code only, pick the `New code · …` metrics. Turn conditions on and off or change thresholds in **Settings › Quality gate**; a condition that is off shows "Off" and is not judged.


The conditions that decide whether an analysis passes. The default gate "Checker way" (all on new code):

| Metric | Operator | Threshold |
|---|---|---|
| New bugs, new vulnerabilities | > | 0 |
| New security hotspots reviewed | < | 100 % |
| Coverage on new code | < | 80 % |
| Duplication on new code | > | 3 % |
| Maintainability, reliability, security rating on new code | worse than | A |

**Add copy** creates a new gate; **Add condition** sets metric, operator and threshold; **Assign to {name}** attaches it to the project. "In use for this project" marks the current gate.

#### Portfolios

Groups of projects seen together. Type a name, **Create portfolio**, and **Choose projects**. It shows passed, failed and none counts, ratings from the worst project, summed measures and the **Releasable** verdict (passes when no project fails).

#### Background tasks

Every analysis is a task (the last 100): time, project, branch, status (SUCCESS, FAILED, CANCELED — cancelled in the progress window), quality gate, Defect Analysis policy, duration and warnings (for example `DB: …`). Analyses sent by the CI scanner or the API show here too.

#### Administration (tabs)

| Tab | Contents |
|---|---|
| Webhooks | POSTs compatible JSON to a URL when an analysis finishes or the gate changes. **Add webhook** → name, URL, scope (all projects or one), events (Analysis done, Gate changed), secret (HMAC), enabled. **Deliveries** shows response codes and bodies |
| Users & permissions | Permission checks, users, groups, global and project permissions, tokens ([below](#users-and-permissions)) |
| External issues | Adds another tool's results to the current analysis: SARIF, generic issue JSON, defect JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit, Semgrep. **Open file…** or paste → **Format** (auto-detect) → **Import**. A new import replaces the previous one of the same engine. Imported issues survive re-analysis |
| Test reports | JUnit XML or generic test execution XML. Tests, failures, errors, skipped, execution time and success % join the measures from the next analysis |
| Analysis settings | New code, exception approval, licenses, C/C++, coverage, architecture, housekeeping ([below](#analysis-settings)) |
| Scheduled analysis | Code analyses or web scans at set times ([below](#scheduled-analysis)) |
| Integrations | Base URL, SMTP, LDAP, issue trackers, PR decoration (ALM), my notifications ([below](#integrations)) |
| Audit log | With permissions on: sign-ins, settings, security and triage changes and denied requests with user, API, outcome and detail (the last 5000). Search and a maximum count |
| Required software | Git and C/C++ compiler status, platform and package managers, Install, Check again, Ask again |

##### Analysis settings

- **New code** — previous analysis, number of days, changed lines (git), since previous version (version tag), since a specific analysis. **Reference (branch, tag or commit)**; **Scope**: **This project only** gives this project its own definition.
- **Auto-assign** — assign issues to the git blame author.
- **Exception approval** — **Require approval for false positive / accept**, **Requester may approve**.
- **License policy** — SPDX ids to allow, review or deny (one per line). Others follow the category defaults (permissive allowed, copyleft reviewed, network copyleft and proprietary denied). **Internal packages** (dependency confusion check, glob or /regex/).
- **C/C++ settings** — target data model (LP64, ILP32, LLP64), include directories, defines (NAME or NAME=value).
- **Coverage reports** — report paths (relative to the project, one per line). Empty means the usual places such as `coverage/lcov.info`, `cobertura.xml`, `jacoco.xml`, `clover.xml`, `opencover.xml`.
- **Architecture rules** — layers (name + path pattern), forbidden dependencies (this layer → must not use this layer, message), max dependencies per module, unstable dependency warning. Only project administrators change them.
- **Housekeeping** — days to keep inactive branches, closed issue states and the audit log (0 = keep), **Clean up now**. Before deleting it shows what will go (for example "audit entries older than 30 days") and asks to confirm.

**Save** says "They apply from the next analysis." **Reset** returns to the saved values.

##### Scheduled analysis

**New schedule** → name (e.g. Nightly full analysis), **Kind** (Code analysis / Web scan (DAST)), project (or **A folder path instead of a project**), branch, for DAST the target and scan mode, **When** (Every day at 02:00, Weekdays at 09:00, Sundays at 03:00, Every hour, Custom (cron)), **Schedule on**. A cron expression is "minute hour day month weekday" (for example `*/30 8-18 * * 1-5` runs every 30 minutes from 8 to 18 on weekdays). **Next 5 runs** previews it. The list shows next run, last run and result, with **Run now**, edit and delete. Schedules run while the program (or the web server) is running; it checks every 30 seconds. Scheduling a web scan in **active** mode asks the same "I am authorized" question as the Web scan view.

##### Integrations

- **Base URL** — this server's address, used in mails and tickets.
- **SMTP** — host, port, secure connection (STARTTLS, TLS (SMTPS), no encryption), user, password, from address; **Test connection**, **Test mail** (recipient).
- **LDAP** — LDAP URL, bind DN, password, search base DN, user filter, default groups, group mapping (JSON, LDAP group → local group); **Test connection**. When on, people sign in with directory accounts.
- **Issue trackers** — Jira (base URL, API version, project key, issue type, email + API token or a personal access token (PAT)), Redmine (base URL, API key, project ID, tracker ID), GitHub (API URL, owner, repository, token), GitLab (base URL, project ID, token). Leave unused ones empty.
- **PR decoration (ALM)** — GitHub, GitLab, Azure DevOps (organization, project, repository ID, token), Bitbucket (kind Cloud / Server, API URL or base URL, workspace or project key, repository, token).
- **My notifications** — your email, **Events** (Quality gate status changed, Issues assigned to me, New high-impact defects, Exception request to approve, My exception request approved, … rejected, Analysis failed) and projects (none chosen means all). **Save notifications** / **Turn off**.

Secrets (passwords, tokens, keys) are never shown again after saving ("A value is stored. Type a new one to change it.").

##### Users and permissions

At first **Permission checks are off (local single user)**. For a shared server:

1. Set a password (8 characters or more) for the `admin` user first.
2. Turn on **Permission checks**. Before it turns on, it names the administrator accounts to sign in with and asks you to confirm (it stays off while no active administrator has a password). From then on the screen shows the **MyCodeChecker sign-in** and the API requires a login or a token. The sign-in screen has its own language switch, and the language you pick stays after signing in.
3. **Add user** (login, name, email, password), **Add group** (built-in groups administrators and users), **Add member**.
4. **Global permissions**: Administer, Administer quality gates, Administer quality profiles, Execute analysis, Create projects. **Project permissions**: Browse, See source code, Administer issues, Administer security hotspots, Administer, Execute analysis. **Grant** gives them to a user or group (grantee).
5. **Tokens** — **Generate token**: a user token (`mcu_…`, the user's permissions), a project analysis token (`mcp_…`, analysis of that project only) or a global analysis token (`mca_…`, any analysis). **The token is shown only once.** **Upload an analysis with this token** in the token dialog gives a command to copy and a `mcc-project.properties` sample.

   ```bash
   node scripts/scan.mjs --path <source> --server <url> --token <token> --project-key <key>
   ```

   The desktop app's built-in server uses a random port each time, so CI uploads need a shared server (`npm run web:serve` or the web version). See created and last used, and **Revoke**.

Deactivated users cannot sign in. Sign out with **Tools › Sign out**.

**Safety** — so that nobody is locked out or loses data by accident:

- The **last active administrator** cannot be removed or deactivated (LAST_ADMIN).
- Deleting users, groups, gates, profiles, portfolios, policies, components or models, deactivating a user, revoking a token, bulk false positive / accept and housekeeping all ask for confirmation first.
- **5 failed sign-ins lock that login for 5 minutes** ("Too many failed sign-ins. Try again in a few minutes.").

## Settings

**Tools › Settings** (Ctrl+,) is a fixed-size window (920×600) with vertical tabs on the left. Changes are a **draft** until you press **OK** (a changed tab is marked "changed"). **Cancel** (Esc) closes without saving; **OK** (Enter, outside multi-line fields) saves and closes. **Reset** puts only the current tab back to its defaults (nothing is saved until OK). Theme, language and Start page background are **previewed at once and revert on Cancel**.

| Tab | Items |
|---|---|
| General | Language (한국어, English, with flags), Always show the Start screen on launch, Assignee (default assignee for new issues), Panels: Left panel (navigation), Right panel (details), Bottom panel on/off |
| Theme | The current theme, the **Custom themes** group on top, then **Dark** 20 and **Light** 20 (two columns each). A click previews at once |
| Custom themes | The list on the left and a **Base theme**; **New** (from the chosen base theme), **Duplicate**, **Remove**, **Import**, **Export** (JSON), **Use this theme**. On the right: name, kind (dark / light) and 15 colour tokens (background, panel, card, hover, selection, border, strong border, text, dim text, accent, strong accent, text on accent, folder / warning, file, danger), **From base theme** to start over, and a **Preview** of menus, buttons and lists |
| Start page | Show this page at start, **Background** (20 kinds as buttons + **Random**), **Speed** 0–300 %, **Transparency** 0–100 % (0 % shows the background fully, higher fades it), **Shuffle every** (seconds, 0 = off — a different background at that interval), **Change at start** (a different background at every start), Cards: **Reset card layout**. A small preview moves at once |
| Analysis | Exclusion patterns (one per line; defaults `**/*.min.js`, `**/vendor/**`, `**/node_modules/**`, `**/dist/**`, `**/build/**`), cognitive complexity limit (15), parameter limit (7), max files (8000), **More settings** › **Open Administration › Analysis settings**, **Checks** (core code quality rules, Defect Analysis, semantic analysis per language, taint, Security Weakness, MISRA C:2012/2023, MISRA C:2004, MISRA C++:2023, MISRA C++:2008, CERT, AUTOSAR, runtime errors, HIS, architecture, SCA, IaC, each on or off; a check that is off is not run and does not report, from the next analysis) |
| Quality gate | The default quality gate's conditions: **Use** per condition, metric, operator and threshold, **Add condition**, **Remove**, **Default conditions**. Saving changes the verdict at once, without a new analysis |
| Reports | **Store pictures inside the Markdown file** (off saves them as PNG files in `<report name>_images`), **Save reports after each analysis** (reports, formats PDF/Word/Excel/PowerPoint/HTML/Markdown/CSV, folder; empty means `reports/<project key>` in the data folder) |
| New code | New code (previous analysis, number of days, changed lines (git), since previous version, since a specific analysis) and days. Per-project definitions are in Administration › Analysis settings |
| AI CodeFix | [below](#ai-codefix-settings) |
| Database | [below](#database) |
| Notifications & links | Webhook URL (one address that gets the result after each analysis), **Integration settings in Administration** (SMTP, LDAP, trackers, ALM, webhooks, my notifications) |
| Advanced | Panel layout: **Reset panel sizes and layout**, **Required software…**, Tutorial banner: **Show it on the start page again**. Settings are kept in the workspace and used at the next start |

### AI CodeFix settings

| Item | Meaning |
|---|---|
| Use AI CodeFix | Off by default. Only when on can you use **Suggest a fix with AI** in the details panel |
| Provider | **Anthropic Claude** (official SDK), **OpenAI-compatible server** (`/v1/chat/completions` — OpenAI, Azure OpenAI with a full URL, LM Studio, vLLM …), **Ollama (local)** (default `http://127.0.0.1:11434`, default model `qwen2.5-coder`) |
| Model | Anthropic: **claude-opus-5-5 (default)**, claude-sonnet-5-5, claude-haiku-5-5, **Type a model…** (Pick from the list goes back). For the other providers type the model name the server uses (required for OpenAI-compatible) |
| Server URL | The address for OpenAI-compatible and Ollama; for Anthropic only with **Use another server URL** (a proxy) |
| API key | After saving only "A value is stored." shows. For Anthropic, empty uses the `ANTHROPIC_API_KEY` variable or an `ant auth login` profile |
| Effort | Low (fast), Medium (default), High, Extra high, Max — higher is more careful but slower and costlier (Anthropic) |
| Explanation language | The language of the fix explanation (한국어, English) |
| Max tokens | Reply length limit (1024–128000, default 16000). Raise it when replies are cut off |
| Context lines | Lines sent above and below the issue (5–400, default 40) |
| Timeout | How long to wait for the reply (seconds, default 120) |
| Connection test | **Test connection** — a short request with the current settings (including the unsaved draft), showing OK or Failed |

> **Privacy** — with a remote provider (Anthropic, an OpenAI-compatible server), **the code around the issue (the context lines), the file path, the rule text and the data flow** are sent to that provider. **Ollama runs on this computer (or the server you set), so code stays there.** For projects whose code must not leave the company, use Ollama or keep the feature off. Nothing is sent before you turn it on.

### Database

Exports analysis results as database tables for other tools (BI dashboards, reporting systems). Only **project information** and **analysis results** are saved, never the program's own settings (theme, language, AI, database connection ...). The tables are `mcc_projects` (name, key, path, description, main branch, project file, tags, the last analysis and its gate verdict), `mcc_project_details` (per analysis, the analysis setup at the time: exclusion patterns, excluded folders, include paths, defines, new-code baseline, checks turned off, the quality gate with each condition's verdict, files per language), `mcc_analyses`, `mcc_measures` and `mcc_issues`. Tables made by an older version get the new columns automatically.

| Item | Meaning |
|---|---|
| Save results to a database | On / off (off by default) |
| Kind | **SQLite file** (built into Node), **PostgreSQL** (5432), **MySQL / MariaDB** (3306), **SQL Server** (1433) |
| Database file | The SQLite file path (pick with **Folder…**). Empty creates it in the app data folder |
| Host, port, database, user, password | The server connection (database default `mycodechecker`) |
| Encrypted connection | SSL/TLS |
| Schema / prefix | Put in front of the table names (default `mcc`) — tables `mcc_projects`, `mcc_analyses`, `mcc_issues`, `mcc_measures` (created when missing). Letters, digits and `_` only |
| Auto export | **After every committed analysis** |
| Include issues | **Save the issue list too**; off exports only projects, analyses and measures |
| Time limit (s) | When the connection or one SQL statement takes longer (default 60 s, 5–3600), saving stops, is rolled back and the error is shown |
| Connection test | **Test connection** |

With auto export off, use **Export to DB** in the **Reports** view to send the current result now ("Analysis … · … issues · … measures"). Exporting the same analysis again replaces its rows, so nothing is duplicated. When saving takes more than half a second a progress window shows the step (connecting, checking tables, writing rows, committing), rows written, elapsed and remaining time and the per-statement time limit, with **Cancel**. Auto export appears in the analysis progress window as **Saving to the database**. Errors such as a timeout or a failed connection are shown in a popup. A failed export never stops the analysis; the reason is also left as a task warning (`DB: …`) and in the bottom panel's **Analysis log**.

## Workflows

### Triage

1. In **Overview**, click a failed gate condition or a rating card to go to the issues. **New code only** shows what this change introduced.
2. Filter by severity and type and work from the top. For each issue read **Why** and **How to fix**, then:
   - if it is real: **Confirmed**, set the assignee and, if needed, **Create ticket**
   - if it is wrong: **False positive**; if known and not fixed now: **Accept** (in a workspace that needs approval, request an exception)
3. Follow the event path of C/C++ defects in **Defects** and set classification and action.
4. Review security hotspots in **Security hotspots** as Safe, Fixed or Acknowledged.
5. After fixing, analyze again; issues that are gone become Closed (Fixed).

### Exception requests and approval

1. An administrator turns on **Administration › Analysis settings › Exception approval › Require approval for false positive / accept** (turn off **Requester may approve** to forbid self-approval).
2. A developer opens **Request exception** in the issue panel, chooses the **Exception kind** (false positive / accept), writes the **Reason (required)** and presses **Request exception**. The issue shows "Pending approval" and approvers who subscribed get a mail.
3. An approver (Administer issues) picks the request in **Exception approval** and **Approves** or **Rejects** it with a **Comment** (required to reject). Approval resolves the issue as false positive / accepted; rejection leaves it open and notifies the requester.
4. The requester can **Cancel request** before a decision. Every request and decision is in the issue's changelog and the audit log.

### Quality gate in CI

Analyze the sources on the build server and stop the build when the gate fails.

```bash
node scripts/scan.mjs --path . --format sarif --out mcc.sarif
# exit code: 0 passed, 1 gate failed (or not MISRA compliant with --misra-gate), 2 usage error
```

GitHub Actions example:

```yaml
- run: npm ci
- run: node scripts/scan.mjs --path . --coverage coverage/lcov.info --format sarif --out mcc.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: mcc.sarif }
```

`--standard misra-c|misra-cpp|cert|cwe-top25|owasp` keeps only that standard's rules, and `--report misra --out misra.pdf` writes a report file (with `--report`, an `--out` ending in `.pdf`, `.docx` or `.xlsx` writes that format). `--exclude <glob>` leaves out matching files; it can be repeated and is added to `mcc.exclusions`.

`--workspace [config folder]` analyzes with the app's workspace (by default the app's data folder): its quality profiles, quality gate, exclusion patterns and issue states (false positives, accepted issues …), so the result matches the screen. It runs on a temporary copy of the workspace, so the workspace itself is not changed.

```bash
node scripts/scan.mjs --path . --workspace --exclude "**/generated/**" --report executive --out summary.docx
```

To keep results on a server, use "Uploading to a server" below.

### Uploading to a server

Uploading to a team server (the web version) applies the server's profiles, gate, issue states and history (the code-quality scanner flow).

1. On the server, create a **project analysis token** in **Administration › Users & permissions › Tokens** (for a new project, a user token with **Create projects**).
2. Put a `mcc-project.properties` in the project root:

   ```properties
   mcc.host.url=https://checker.example.com
   mcc.projectKey=my-app
   mcc.projectName=My App
   mcc.sources=src
   mcc.exclusions=**/generated/**
   ```

3. In CI, keep `MCC_TOKEN` (the compatible-format variable is read too) as a secret and run `node scripts/scan.mjs --branch $BRANCH`. It uploads the files, waits for the server's gate and, when it fails, exits with 1 and prints the failed conditions.

The desktop app's built-in server uses a random port each time, so CI cannot upload to it. Start a shared server (`npm run web:serve`, or `node server/server.js --host 0.0.0.0 --port 5211`). The command shown when you create a token can be used as is.

With `mcc.modules=a,b` every module is uploaded as its own project (`a.mcc.projectKey` …). The server also offers the compatible Web API, such as `/api/qualitygates/project_status` and `/api/issues/search`.

### Defect Analysis command line

```bash
npm run defects -- configure --path . --compiler gcc            # record the compilers to intercept
npm run defects -- build --path . -- make -j8                    # capture the build (kept in .mcc/)
npm run defects -- capture --path .                              # or capture all sources without a build
npm run defects -- analyze --path . --all --aggressiveness-level high --coding-standard-config misra-c2012
npm run defects -- format-errors --dir .mcc --html-output cov-html --json-output-v8 defects.json
npm run defects -- commit-defects --path . --stream main --token mcp_…
npm run defects -- manage-im --mode defects --update --cid 12 --set classification:"False Positive"
```

`build` also takes `--compile-commands compile_commands.json`. `analyze` chooses checkers with `--enable`, `--disable` and `--disable-default`, and turns on a coding standard with `--coding-standard-config` (misra-c2012, misra-cpp2023, cert-c, autosar, misra-c2004, misra-cpp2008, mois). `commit-defects` adds a snapshot to the stream and exits with 1 when the policy fails. On a developer PC, `run-desktop` shows **only the defects new to the stream** without changing it (the same as **Desktop** in the toolbar).

### Pull request analysis

**View › Pull request analysis** (needs git). Set the **Target branch** and **PR number** and press **Analyze PR** to see **issues on changed lines** only, compared with the target. It shows the base commit, changed files and lines, the PR gate (the new-code conditions of the default gate) and an "uncommitted changes" warning. **Copy** the **Markdown summary** or the **decoration payload** for each code host (GitHub Checks, GitLab Code Quality, Azure DevOps threads, Bitbucket Code Insights); with an ALM connection in Administration › Integrations, **Post to PR** (PR number / MR IID / PR ID, head commit SHA) posts it directly.

### Generating reports

**File › Reports…** or the **Reports** view. With a database set up, **Export to DB** here saves the current analysis to it.

1. **Report kind**: Executive summary, Security report, MISRA compliance report, Defect Analysis integrity report, Defect Analysis security report, Rule set compliance (security weakness), SBOM report. The security report takes a standard; the Security Weakness report a **Rule set** (All rules, Security rules, CWE rules, CWE Top 25, OWASP Top 10 2021, CERT C/C++, MISRA C:2012, C:2023, C++:2023).
2. Check the preview, then **Save HTML**, **Save CSV**, **Download as** (Word, Excel, PDF) or **Print**. Reports are written in the chosen language (한국어 / English).
3. **Regulatory report (ZIP)** bundles the executive, security, integrity, rule set and SBOM reports as PDF plus the issue list as Excel in one ZIP (for audits and deliveries). Under **Regulatory bundle** pick the **Standard** (MOIS software weaknesses 49 (2021) or KISA critical infrastructure (web)) and the report kinds to include; with none picked it cannot be made.

Quick exports are in the **File** menu: JSON, SARIF, HTML, CSV, quality gate badge (SVG) and defect CSV. On the desktop every export opens a **save dialog** for the place and name, and then reports `Saved: <path>`. The web version saves through the browser's download.

### AI CodeFix

1. In **Settings › AI CodeFix**, turn on **Use AI CodeFix**, choose provider and model, **Test connection** and save with **OK** (needs the Administer permission).
2. Pick an issue and press **Suggest a fix with AI** under **AI CodeFix** in the details panel ("The AI is preparing a fix…"). You get the **Changes** (lines removed and added), an explanation, the **Confidence** (high, medium, low) and the **Tokens used (input / output)**. When the model judges the issue a false positive or cannot fix it safely, it shows "No automatic fix (explanation only)". Use **Ask again** for another try. With the feature off you see "AI CodeFix is off." and **Open settings**.
3. Read the fix and press **Apply** if it is right (needs Administer issues). If **the file changed after the suggestion, Apply is refused** with "The file has changed. Ask again." After applying it says "{file}: removed n and added m lines."; **Analyze again** to confirm the issue is gone.
4. If you do not like an applied fix, press **Undo fix** (or **Edit › Undo**). The original source is kept aside when the fix is applied and the file is put back exactly. If you edited the file again after the fix, it refuses with "The file changed after the fix was applied, so it cannot be undone automatically."

Apply edits the source file directly. Review and commit the change with version control (git). AI suggestions can be wrong.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl+N | New project |
| Ctrl+Shift+O | Open project |
| Ctrl+S · Ctrl+Shift+S | Save project · Save project as |
| Ctrl+O | Open folder |
| Ctrl+Z | Undo |
| Ctrl+Y · Ctrl+Shift+Z | Redo |
| Ctrl+Enter | Analyze (commit defects) |
| Ctrl+, | Settings |
| Ctrl+Tab · Ctrl+Shift+Tab | Next tab · previous tab |
| Ctrl+W | Close the current tab |
| Esc | Close a dialog or the user's guide window; Cancel in Settings |
| Enter | OK in Settings |

On macOS use ⌘ instead of Ctrl.

## Troubleshooting

| Symptom | What to check |
|---|---|
| "Folder not found." | Whether the path is right and, in the web version, whether it is the path **as the server sees it** |
| Files are not analyzed | Exclusion patterns, skipped folders (`build`, `dist`, `vendor` …), files over 800 KB, the file limit (8000), whether the language is supported |
| New code equals all code | Normal for the first analysis; comparison starts with the second. With SCM new code and no git, it falls back to the previous analysis |
| Coverage shows "No data" | Whether tests ran with coverage, and the path in **Administration › Analysis settings › Coverage reports** |
| Pull request analysis or auto-assign does nothing | Git installed (**Tools › Required software…**), and the folder is a git repository |
| Few C/C++ defects | Include directories and defines in **C/C++ settings**, or capture the real build options with `npm run defects -- build` |
| "Permission denied." or a sign-in screen | Permission checks are on. Get permissions from an administrator or sign in again |
| "Too many failed sign-ins." | 5 wrong passwords locked that login for 5 minutes. Wait, then sign in again |
| "At least one active administrator must remain." | This is the last administrator. Make another user an administrator first |
| "This folder is already registered as the project …" | **Open existing project** to continue with it, or **Replace** to use the new settings |
| The analysis does not finish or takes too long | Check the phase and file in the progress window, **Cancel**, then tighten the exclusion patterns or the max files |
| CI cannot upload to the desktop app | Its built-in server uses a random port. Start a shared server with `npm run web:serve` |
| "Approval required." | This workspace needs exception requests for false positive / accept |
| "Integration not configured." | Set up the tracker, ALM or SMTP in Administration › Integrations first |
| AI fix: configuration error or HTTP 401 | API key, server URL, model name. For Anthropic, `ANTHROPIC_API_KEY` or `ant auth login` |
| AI fix: the reply is cut off | Raise Max tokens in Settings › AI CodeFix |
| AI fix: "The file has changed." | The file changed after the suggestion. **Ask again** |
| Database export failed, "No database is set up." | Settings › Database on/off and **Test connection**, the task warning `DB: …`, firewall and account rights (create table), schema / prefix |
| DAST finds few pages | Add seed URLs or OpenAPI; for login, cookie, bearer or login fields |
| Screen and CI results differ | `scan.mjs --path` in CI uses the default gate and all rules. Use `--workspace` for the app's settings, or upload with `--server` to use the server's profiles |

The workspace file is in `%APPDATA%\MyCodeChecker\workspace.json` on Windows, `~/Library/Application Support/MyCodeChecker/` on macOS and `~/.config/MyCodeChecker/` on Linux. If a problem persists, back up this folder, move it away and restart to begin from a clean state.

## Glossary

| Term | Meaning |
|---|---|
| Issue | One place in the code that a rule reports. Types: bug, vulnerability, code smell, security hotspot |
| Bug | Code that can behave wrongly (reliability) |
| Vulnerability | Code an attacker can use (security) |
| Code smell | Code that is hard to read and change (maintainability) |
| Security hotspot | Security-sensitive code whose risk a person has to judge |
| Technical debt | Estimated time to fix all code smells |
| Quality gate | The set of conditions that decides pass or fail |
| Quality profile | The rules (and severities) switched on per language |
| New code | Code changed since the baseline (previous analysis, period, version, git reference) |
| CID | defect-analysis defect number; the same defect keeps its CID when the code changes a little |
| Stream, snapshot | Where defect commits accumulate (a branch), and the result of one commit |
| Triage | Setting classification, action and owner of a defect |
| Policy | defect-analysis pass condition of a commit |
| Function model | A definition that tells whether a library function allocates, is a sink or a source |
| Desktop analysis | An analysis that shows only your new defects without changing the stream |
| Taint analysis | Tracks whether external input (source) reaches a dangerous place (sink) |
| Deviation, recategorization | MISRA: a justified record that allows a violation; a plan that makes a guideline's category stricter |
| Exception request | A request to approve marking an issue false positive or accepted |
| SCA, SBOM | Software composition analysis; software bill of materials |
| Reachability | Whether your code really uses a vulnerable package or function |
| DAST | Dynamic analysis that tests a running app from outside with requests |
| HIS metrics | The automotive (HIS) set of source code metrics |
| Instability (I) | Ce / (Ca + Ce); Ca incoming, Ce outgoing dependencies |
| SARIF | The JSON exchange format for static analysis results |
