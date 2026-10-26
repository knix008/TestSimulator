# MyCodeChecker

A **code quality and security workbench** that runs on your own computer. It brings Code Quality management, Defect Analysis and Security Weakness checks with compliance together in one program. The web version and Windows · macOS · Linux show the same screens — a **Tauri 2 + React** UI over a **Node.js analysis core** (`core/`). The installers carry Node.js and the analyzers, so nothing else has to be installed. All analysis is local; source code leaves the machine only for features you turn on (AI CodeFix, online OSV check).

- **4161 rules**, **38 languages**, 7600+ tests · Korean / English · 40 themes (20 dark, 20 light) plus your own
- How to use it: [User's guide](UsersGuide.en.md) · [사용 설명서](UsersGuide.md) · Design: [ARCHITECTURE.md](ARCHITECTURE.md) · 한국어: [README.md](README.md)

## Features

### Code quality

- **Rules** — bugs, vulnerabilities, code smells and security hotspots for JavaScript/TypeScript, Python, Java, Kotlin, C#, C/C++, Go, Rust, PHP, Ruby, Swift, Objective-C, Scala, Dart, VB.NET, VB6, COBOL, PL/SQL, ABAP, Apex, RPG, PL/I, JCL, Flex, Groovy, Shell, PowerShell, SQL, HTML, CSS, XML, JSON, YAML, Docker, Terraform, Bicep and more (38). Line rules + per-language semantic analyzers (`sem-js`, `sem-java`, `sem-cs`, `sem-py`, `sem-go`, `sem-php`, `sem-rb`) + taint analysis + IaC (CloudFormation, Kubernetes, Ansible, ARM, Bicep)
- **Ratings** A–E (reliability, security, maintainability, security review), technical debt, cognitive and cyclomatic complexity
- **Quality gates** — the default `Checker way` (no new bugs or vulnerabilities, 80 % coverage on new code, 3 % duplication …), editable conditions, per-project assignment, badge
- **Quality profiles** — per language, inheritance (parent profile), compare, back up / restore, changelog, custom regex rules
- **New code** — previous analysis, number of days, a specific analysis, previous version (git tag), SCM changed lines (git diff); line hashes compare with the baseline
- **Coverage** — lcov, Cobertura, JaCoCo, Clover, OpenCover, Go cover profiles, generic · test reports (JUnit, generic)
- **Duplications**, **branches and pull requests** (changed lines only; GitHub, GitLab, Azure DevOps, Bitbucket decoration), **portfolios** (groups of projects with a releasability verdict)
- **External issue import** — SARIF, generic issue JSON, defect JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit, Semgrep
- **IDEs** — VS Code, JetBrains and Visual Studio extensions (`ide/`, LSP server `core/lsp`) with connected mode

### Defect analysis

- **Path-sensitive C/C++ checkers** — an own C11/C17 · C++20 front end (`core/cfamily`) and an abstract-interpretation engine (`core/absint`): FORWARD_NULL, USE_AFTER_FREE, RESOURCE_LEAK, OVERRUN, DIVIDE_BY_ZERO, UNINIT, DEADCODE and 60+ more, each with its event path (alloc → free → use)
- **CIDs, streams and snapshots** — a snapshot per commit, CID comparison (newly detected, fixed, reintroduced), defect lifecycle, issue age, trends
- **Triage** — classification, action, severity, owner, external reference, legacy; `// mcc[CHECKER]` annotations
- **Components** (path pattern → owner), **policies** (fail when new high-impact defects appear after the baseline snapshot), **function models** (allocator, sink, source)
- **Desktop analysis** — check your own changes without touching the stream · **Defect Analysis command line** (`npm run defects` — the build / analyze / commit-defects flow)

### Security weaknesses and compliance

- The **Korean Ministry of the Interior and Safety (행정안전부) 2021 software security weakness guide, 49 items**, the **critical information infrastructure (주요정보통신기반시설)** web items, OWASP Top 10 2017/2021, OWASP ASVS 4.0, CWE Top 25 2023/2024, PCI DSS 3.2.1/4.0, DISA STIG and SANS Top 25 security reports
- **Exception approval workflow** — false positive / accept can be allowed only through "request exception → approve / reject" (reason required, optional self-approval)
- **Coding standards** — MISRA C:2012/2023, MISRA C++:2023, CERT C/C++, AUTOSAR C++14, MISRA C:2004 and MISRA C++:2008 (legacy). MISRA Compliance:2020 GCS, recategorization plan and deviation records
- **HIS metrics** (comment density, path count, v(G), call depth …), **architecture** (module dependency graph, instability, cycles, layer and forbidden-dependency rules)
- **DAST** — scans a running web application (passive, or active with safe probes; scope-limited; authentication; OpenAPI)
- **SCA** — manifests, lockfiles and SBOMs, offline OSV advisories, **reachability**, **snippet matching**, **binaries** (.jar, .whl, .nupkg, .dll …), license policy, dependency confusion, CycloneDX 1.5 and SPDX 2.3 export
- **Reports** — executive summary, security, MISRA, Defect Analysis integrity and security, rule set compliance (security weakness), SBOM — HTML, CSV, **Word, Excel, PDF**, and a regulatory ZIP (pick the standard, MOIS 2021 or the critical-infrastructure web items, and the reports to include). On the desktop a save dialog picks the place and `Saved: <path>` confirms it

### Platform

- **Users, groups and permissions** (global and per project, with the usual permission names), **tokens** (user, project analysis, global analysis; a new token comes with an example CI command and a `mcc-project.properties` sample), **LDAP** sign-in
- **Safety** — the last active administrator cannot be removed or deactivated (LAST_ADMIN); confirmations before deletions, deactivation, token revocation, bulk false positive / accept and housekeeping; 5 failed sign-ins lock that login for 5 minutes; a language switch on the sign-in screen that stays after sign-in. Errors are shown in the UI language (with codes such as NOT_FOUND, CONFLICT, FORBIDDEN …)
- **SMTP notifications** (gate changes, assignments, high-impact defects, exception requests / approvals / rejections, failed analyses), **Jira, Redmine, GitHub and GitLab tickets**, **PR decoration**, **webhooks** (HMAC-signed)
- **Scheduled analyses** (cron; code analysis or web scan), **audit log**, housekeeping
- **Compatible Web API** (`/api/issues/search`, `/api/qualitygates/project_status` …) — dashboards and scripts written for the compatible API read it as is
- **AI CodeFix** — asks an LLM for a fix of one issue, shows it as a diff and applies it only when you accept (an applied fix can be undone with **Undo fix**). Anthropic Claude (official SDK, default model `claude-opus-5-5`), OpenAI-compatible servers or a local Ollama
- **Database export** — analysis results as tables in SQLite, PostgreSQL, MySQL/MariaDB or SQL Server (after every analysis or on demand)
- **Required software** — finds Git and a C/C++ compiler and, when missing, asks before installing them with the package manager (winget, scoop, Homebrew, apt, dnf, pacman, zypper)

### Workspace

- **Project files `.mccp`** — JSON with the source folder (relative path) and the project settings (branch, exclusions, include paths, defines, coverage, architecture, new code, profiles, gate). File › New project, Open, Save, Recent projects; double-clicking one opens the app (own icon). Unsaved changes put a ● in the title, and closing asks **Save / Don't Save / Cancel**. A new project on an already registered folder asks **Replace / Open existing project / Cancel**; **Delete project** removes it from the workspace only (the source folder and the .mccp stay). Workspaces and project files from older versions are converted on first open, and triage is kept
- **Edit › Undo / Redo** (Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z; the toolbar buttons' tooltips name the action) — issue status, resolution, assignee and tags (single and bulk), gate, profile, portfolio, policy and custom-rule edits, project settings, panels, the start-page layout and AI CodeFix apply
- **Analysis progress window** — after about 1 s: phase, current file or engine, %, elapsed and remaining time, **Cancel** (a cancelled analysis is recorded as CANCELED, not as a failure). Triage and settings changed while it runs are kept
- **Screens** — a menu bar instead of the system title bar (theme, language with flags), an icon + label toolbar, **tabs** in the centre (Home pinned; close, drag to reorder, context menu, < > ⌄ on overflow), left **navigation**, right **details** and bottom **Problems / Analysis log / Jobs / Output** panels (turn on/off, fold to an icon + title strip, resize). On the desktop, dialogs, menus and dropdowns open as separate windows. List views keep the title, filters and column headings in place; only the rows scroll
- **Settings window** — fixed 920×600, ten vertical tabs (General, Theme, Custom themes, Start page, Analysis, New code, AI CodeFix, Database, Notifications & links, Advanced), **Reset / OK / Cancel**; theme, language and background preview at once and revert on Cancel
- **Start page** — hero card (User's guide, Tutorial document, Start the tutorial), banner, New analysis tiles, the last 10 projects, background, help, samples. Move cards by ⠿ and resize them by the corner (the cards below move up to fill gaps), **Auto arrange**. Language tiles analyze and then show only that language's issues; standard tiles open that standard. 20 animated backgrounds (shuffle, speed, transparency)
- **Tutorial and user's guide window** — a tutorial that drives the real screens (with a first-start welcome), and a user's guide window that follows the app theme (Korean / English)
- **Samples** — `samples/demo` (19 files, 14 languages) and `samples/cpp-sensor` (a C++ sensor logger with `cpp-sensor.mccp` and `compile_commands.json`)

## Install and run

One JavaScript core, four ways to start it.

| Target | Development | Installer / distribution |
|---|---|---|
| Web | `npm run dev` (first free port from 5210) | `npm run web` — build, then `server/server.js` (http://127.0.0.1:5211) |
| Windows | `npm start` (Tauri window) | `npm run build:win` → NSIS installer |
| Linux | `npm start` | `npm run build:linux` → .deb, .AppImage |
| macOS | `npm start` | `npm run build:mac` → .app, .dmg |

For development you need Node.js 22 or later, Rust (Tauri) and, on Windows, WebView2. `npm start` and `npm run dev` take the first port from 5210 that is free on both IPv4 and IPv6 and never stop other programs. Each installer is built on its own OS (the build stops and says so on another OS) and is copied to the project root. At the end of the Windows installer you are asked whether to install Git with winget when it is missing.

```bash
npm install
npm run dev          # browser
npm start            # desktop window
```

As a shared server:

```bash
npm run build
node server/server.js --host 0.0.0.0 --port 5211 [--config <data folder>] [--no-scheduler]
```

The workspace is stored in `%APPDATA%/MyCodeChecker/workspace.json` (macOS `~/Library/Application Support/MyCodeChecker`, Linux `~/.config/MyCodeChecker`, or the `MCC_USER_DATA` environment variable).

## Quick start

1. On the Start page press **Sample project** to analyze `samples/demo`; for C/C++ open `samples/cpp-sensor/cpp-sensor.mccp` with **File › Open project…**. For your own code use **Open folder…** (Ctrl+O) or **New project…** (Ctrl+N). New here? **Start the tutorial**.
2. **Overview** shows the quality gate and ratings; press a card to go to the **Issues** list.
3. Pick an issue and read why it matters and how to fix it in the right **Details** panel; confirm, accept or mark it false positive, assign it, create a ticket or ask for an AI fix.
4. **Security reports**, **MISRA compliance** and **Reports** show results per standard and save them as Word, Excel or PDF.

## In CI

```bash
# Local analysis; exit code 1 when the quality gate fails
node scripts/scan.mjs --path . --format sarif --out report.sarif
node scripts/scan.mjs --path src --standard misra-c --misra-gate --report misra --out misra.pdf
node scripts/scan.mjs --path . --format cyclonedx --out bom.json
node scripts/scan.mjs --path . --workspace --exclude "**/generated/**"   # with the app's profiles, gate and issue states

# Upload to a server, which analyzes with its own profiles, gate and history (code-quality scanner flow)
node scripts/scan.mjs --server https://checker.example.com --token mcu_… --project-key my-app --branch feature/x
```

Without `--server`, `mcc-project.properties` (or a compatible-format property file) is read: `mcc.host.url`, `mcc.token`, `mcc.projectKey`, `mcc.projectName`, `mcc.sources`, `mcc.exclusions`, `mcc.branch.name`, `mcc.modules`. The token comes from `--token`, then `MCC_TOKEN` (or the compatible-format variable). Formats: `json | sarif | html | csv | badge | cyclonedx | spdx | spdx-tv`; reports: `executive | security | misra | integrity | defect-security | weakness | sbom` (an `--out` ending in `.pdf`, `.docx` or `.xlsx` writes that format). Also `--coverage`, `--include`, `--define`, `--target lp64|ilp32|llp64`, `--osv`, `--misra-plan`, `--lang ko|en`, `--exclude <glob>` (repeatable, added to `mcc.exclusions`), `--workspace [config folder]` (uses the app's quality profiles, gate, exclusions and issue states, but runs on a temporary copy, so the workspace is not changed). The desktop app's built-in server uses a random port, so CI uploads need a shared server (`npm run web:serve`).

Defect Analysis commands (`npm run defects -- <command>`):

```bash
node scripts/defect-cli.mjs build --path . -- make            # build capture (or capture: buildless)
node scripts/defect-cli.mjs analyze --path . --coding-standard-config misra-c2012
node scripts/defect-cli.mjs format-errors --dir .mcc --html-output out/
node scripts/defect-cli.mjs commit-defects --path . --stream main   # exit code 1 when the policy fails
node scripts/defect-cli.mjs run-desktop --path .                     # only defects new to the stream
node scripts/defect-cli.mjs manage-im --mode defects --show --status Outstanding
```

Also `configure`, `make-library` (function models) and `import-results`. All options: `node scripts/defect-cli.mjs --help`.

## Tests and documents

```bash
npm test             # node --test + test/reporter.mjs
npm run build:docs   # docs/UsersGuide*.html, Tutorial*.html, README*.html, ARCHITECTURE.html → public/docs/
```

`npm test` prints in English: a header per file, an aligned row per test (status, number, name, time coloured by duration), then a per-file summary table with a pass bar and the list of failures; it is also saved to `test/last-report.txt`. **Help › User's guide** in the app opens the pages made by `build:docs`.

© SHKWON (knix008@naver.com) · MIT
