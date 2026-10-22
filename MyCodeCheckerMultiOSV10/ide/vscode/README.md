# MyCodeChecker for VS Code

The editor side of MyCodeChecker, in the spirit of SonarQube for IDE (SonarLint), Coverity Code Sight and
Sparrow's IDE plugins. It runs the same analysis core as a MyCodeChecker server scan (line rules, taint,
MISRA C / C++, CERT, abstract interpretation, SCA and every other engine in `core/engines.js`), so what you
see in the editor matches the server.

## Features

- **Diagnostics as you type**: on open, on change (debounced) and on save. Severity follows the rule
  (Blocker/Critical = error, Major = warning, Minor = information, Info = hint; security hotspots are shown
  as information). The rule key is the diagnostic code, linked to the rule description.
- **Data-flow steps**: taint and path findings list each step (source, calls, sink) as related information,
  also when a step sits in another file.
- **Hover** on an issue shows the rule name, why it matters, how to fix it and its standards mapping
  (MISRA, CERT, CWE, OWASP).
- **Quick fixes**: a fix where the rule offers one (strict equality, `var` → `let`, trailing whitespace,
  `debugger`, `console.log`, bare `except:`), *Suppress with NOSONAR*, *Deactivate rule*, *Show rule
  description* and, in connected mode, *Open issue in MyCodeChecker*.
- **Rule description panel** with a Korean / English switch.
- **Security view** (Explorer → *MyCodeChecker Security*): taint vulnerabilities with their flow steps,
  other vulnerabilities and security hotspots.
- **Analyze workspace**: a full analysis, needed for findings that cross files (for example taint that
  starts in one file and reaches a sink in another). After that, edits are re-analyzed incrementally: the
  edited file plus the files its findings link to.
- **Connected mode**: uses the quality profile, exclusions and custom rules of a MyCodeChecker server, and
  hides issues that were marked false positive, won't fix or safe there.

## Install

Build the `.vsix` (plain Node, no dependencies) and install it:

```sh
node ide/vscode/build-vsix.js
code --install-extension ide/vscode/dist/mycodechecker-1.0.0.vsix
```

Options: `--out <folder>` writes the package elsewhere; `--no-core` leaves the analysis core out (then set
`mycodechecker.corePath`, see below).

To try it without packaging, open this folder in VS Code and press F5, or run
`code --extensionDevelopmentPath=<repo>/ide/vscode <some project>`.

### How the extension finds the core

The language server is `core/lsp/server.js`. The extension looks, in order, at:

1. `mycodechecker.corePath`: a MyCodeChecker checkout (the folder that contains `core/`), its `core/` folder,
   or the path of `server.js` itself. Use this to run the core of an installed MyCodeChecker, or a newer
   checkout, without rebuilding the extension.
2. The bundled copy: `<extension>/server/core/lsp/server.js`, put there by `build-vsix.js`.
3. The repository this folder sits in (`../../core/lsp/server.js`), for development.

The server runs with the Node runtime inside VS Code (`ELECTRON_RUN_AS_NODE=1`). Set
`mycodechecker.nodePath` to use another Node.js (18 or newer).

## Commands

| Command | What it does |
| --- | --- |
| MyCodeChecker: Analyze Current File | Re-analyzes the active editor now |
| MyCodeChecker: Analyze Workspace | Full analysis of all workspace folders |
| MyCodeChecker: Show Rule Description | Rule panel for the issue under the cursor (or a rule key) |
| MyCodeChecker: Toggle Connected Mode | Turns connected mode on or off (asks for URL and token the first time) |
| MyCodeChecker: Set Server Token | Stores the token in the OS secret store |
| MyCodeChecker: Open Issue in MyCodeChecker | Opens the issue under the cursor on the server |
| MyCodeChecker: Deactivate Rule / Activate Rule | Local rule switches (saved to `mycodechecker.rules.*`) |
| MyCodeChecker: Restart Language Server | Restarts the server |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `mycodechecker.language` | `auto` | `ko`, `en`, or follow the VS Code display language |
| `mycodechecker.rules.inactive` | `[]` | Rule keys switched off locally |
| `mycodechecker.rules.active` | `[]` | Rule keys switched on although the server profile turns them off |
| `mycodechecker.rules.severityOverrides` | `{}` | `{ "js:eqeq": "CRITICAL" }` |
| `mycodechecker.exclusions` | `[]` | Globs relative to the workspace folder |
| `mycodechecker.qualityProfile` | `""` | Server profile id or name; empty = all profiles, like a server scan |
| `mycodechecker.showHotspots` | `true` | Show security hotspots as diagnostics |
| `mycodechecker.analyzeOnChange` | `true` | Off = analyze on open and save only |
| `mycodechecker.analyzeWorkspaceOnStart` | `false` | Full analysis at startup |
| `mycodechecker.debounceMs` | `600` | Delay after typing before re-analysis |
| `mycodechecker.includeDirs`, `mycodechecker.defines` | | C / C++ include folders and macros |
| `mycodechecker.connectedMode.enabled` | `false` | Connected mode |
| `mycodechecker.connectedMode.serverUrl` | `""` | e.g. `http://127.0.0.1:5211` |
| `mycodechecker.connectedMode.projectKey` | `""` | Project key / id / name; empty = matched by folder path |
| `mycodechecker.connectedMode.token` | `""` | Prefer *Set Server Token* (secret store) |
| `mycodechecker.connectedMode.refreshMinutes` | `5` | How often profile and statuses are refreshed |
| `mycodechecker.corePath`, `mycodechecker.nodePath` | `""` | See *How the extension finds the core* |

A project can also keep server settings in `<folder>/.mycodechecker/lsp.json` (same keys as the
JetBrains example in `ide/jetbrains/README.md`). VS Code settings win over the file.

## Connected mode

The server is any MyCodeChecker host that serves `POST /api/<method>` (the web host or the desktop sidecar)
with a Bearer token. The language server calls `ide.config` if the server has it and otherwise
`workspace.load`, then:

- picks the project by `projectKey`, else by folder path, else by folder name;
- analyzes with that quality profile's inactive rules and severity overrides, the server's exclusions and
  its custom rules;
- hides issues whose server status is resolved (false positive, won't fix, fixed) or whose hotspot is
  reviewed. Issue keys are stable hashes of rule, file and line text, so they match the server's keys when
  the folder is the project root.

## Quick-fix model for analyzers

An analyzer may attach fixes to a finding (see `core/lsp/fixes.js`):

```js
{ rule: 'x:y', file: 'a.c', line: 3,
  fix: { title: { en: 'Use strncpy', ko: 'strncpy로 바꾸기' },
         edits: [{ line: 3, column: 5, endLine: 3, endColumn: 11, text: 'strncpy' }] } }
```

Columns are 1-based and the end is exclusive; `file` (root-relative) lets an edit touch another file;
`fixes: [...]` gives several choices.

## Other editors

The server is a plain LSP server: `node core/lsp/server.js --stdio`. See `ide/jetbrains/README.md`
(LSP4IJ) and `ide/visualstudio/README.md`.
