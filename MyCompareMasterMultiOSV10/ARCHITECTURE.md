# Architecture

Written for: developers working on this codebase.

---

## The shape of it

```
                    ┌──────────────────────────────┐
                    │          src/  (React)       │   one interface,
                    │  main window · menus · popups│   three kinds of window
                    └───────────────┬──────────────┘
                                    │  HTTP (/api/...)
                    ┌───────────────┴──────────────┐
                    │        server/  (express)    │   one API
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────┴──────────────┐
                    │   core/  (no platform here)  │   diff · merge · git · fs
                    └──────────────────────────────┘

  src-tauri/  the desktop shell (Rust): starts the core, opens every window on it
  npm run serve  starts the same server for a browser
```

There is exactly one implementation of everything that matters. The desktop build is
not a port of the web build; it is the web build with a Tauri 2 shell around it that
adds the things a browser cannot do: native file dialogs, real popup windows, the
clipboard, OS file drops with real paths, the window title and a process exit code for
`git mergetool`.

### Why a server behind the desktop app

The alternative — a Tauri command for every file read — would mean two
implementations of every operation, one over IPC and one over HTTP, and the web build
would always be the poorer relation. Instead the shell starts the same express app as
a child process (`server/desktop.ts`) on a loopback port and every window loads from
it, so `/api` calls are relative and identical in both builds, and the popups can be
real windows loading the same URL.

```
MyCompareMaster.exe (src-tauri/src/main.rs)
  ├─ core.rs     node desktop.cjs --port … --static dist --launcher <exe> --parent-pid …
  │              waits for "MCM_READY <port> <node>"; the core exits when the exe does
  ├─ main window http://127.0.0.1:<port>/           (frameless; saved size, place, colour)
  └─ popups.rs   menu window  …/#menu=   ·   pooled dialog windows  …/#dialog=
```

The installed app runs `runtime/node.exe` + `runtime/desktop.cjs` + `runtime/dist/`
from its resources (staged by `scripts/stage-runtime.mjs`), so the machine needs no
Node.js. A debug build runs the source tree through `tsx` instead, and `npm start`
points the window at the Vite dev server, which proxies `/api` to the core — UI edits
show live, core edits on the next start.

The page is a remote origin to Tauri, so the bridge's commands reach it only through
permissions: `src-tauri/build.rs` lists every command (an `allow-…` permission each)
and `capabilities/default.json` grants them to `http://127.0.0.1:*`. A Rust test
fails if one is listed but not granted.

---

## `core/` — the part with no platform behind it

| Module | What it owns |
|--------|--------------|
| `lineDiff.ts` | Two-way line alignment (patience anchoring with an LCS fallback) and the word-level spans inside a modified line. |
| `binary.ts` | Binary detection and the hex dump model. |
| `threeWay.ts` | diff3-style 3-way merge: anchors that match base on both sides, then each slice decided on its own. |
| `conflictMarkers.ts` | Parsing a file git already left conflicted. |
| `mergeDocument.ts` | The merge model — clean regions and conflict hunks — plus the four-pane layout and the immutable resolution operations. |
| `compareSession.ts` | One open two-way comparison: rows in windows, hex in windows, and the "take these rows from the other side" rebuild. |
| `dirCompare.ts` | Walking two trees and pairing them up, with folder exclusions and file masks. |
| `dirTree.ts` | Turning that flat list into the two aligned trees the view draws. |
| `fileOps.ts` | Copy and delete between the two sides, with every path checked to be inside its root. |
| `git.ts` | Everything shelled out to git, including the three index stages of a conflicted file and the difftool/mergetool registration. |
| `app.ts` | The service the API is a thin wrapper over: sessions by id, and the settings store. |
| `settings.ts` / `settingsStore.ts` | The model (shared with the browser) and its persistence (not). |
| `themes.ts` / `color.ts` | Twenty families in a light and a dark kind — forty themes — plus the user's own, each derived from four or five seed colors, and the color maths behind them. Also `paneHeaderStyle`, which blends a pane's chosen swatch into the theme so a title bar follows light and dark. |
| `sessions.ts` | The catalogue of session kinds. The start screen, the session panel and the saved-session store all read it, so a new kind is added once. |
| `sync.ts` | Folder synchronisation, planned as pure data: the five modes, the timestamp tolerance, and the order the operations have to run in. |
| `tiff.ts` / `png.ts` | A baseline TIFF decoder and a PNG encoder, so a picture comparison can show a format no browser will. |
| `grammar.ts` | A one-pass lexer. Two jobs from one pass: spans for syntax highlighting, and the text a line is *compared* by once the unimportant parts — comments, quote style, number formatting — have been taken out. |
| `formats.ts` | The table of file formats worth reading rather than comparing literally, and the one rule that matters: both sides must agree on the format, or it is a text comparison. |
| `csv.ts` / `mp3.ts` / `versionInfo.ts` / `registryFile.ts` | The readers behind it. Each turns a file into lines; nothing downstream knows what a table or an ID3 tag is. |
| `zip.ts` | The central directory of an archive, and one entry's bytes. A folder comparison lists hundreds of archives and decompresses none of them: the CRCs in the index say whether two entries match. |
| `renames.ts` | Pairing a file missing on one side with an identical one on the other, by size then by fingerprint — conservative, because a wrong pair is worse than a missed one. |
| `ftp.ts` / `remote.ts` / `remoteCompare.ts` | An FTP and FTPS client written out rather than depended on, a session over it, and a folder comparison that walks a server's listing instead of downloading it. |
| `gitGraph.ts` | Lanes and edges for a history, as data. The view draws lines; this decides what they are. |
| `terminal.ts` | The shells behind the terminal panel: which ones this computer has — and which of those actually start, checked once at launch — a session per tab with piped stdio, Tab completion, and the `git status` the prompt is coloured by. The only module here that spawns anything. |
| `prompt.ts` | The terminal prompt as data — blocks of segments, their colours and a subset of Go's `text/template` — plus the nineteen presets and the renderer both the panel and the settings preview draw with. No DOM, which is why the settings store can sanitise a prompt and a unit test can render one. |
| `i18n.ts` | Korean and English, as `[ko, en]` pairs so a missing translation is a type error. |
| `print.ts` | Page geometry in millimetres and pagination. |
| `fonts.ts` | System font discovery, reading the family out of each file's `name` table. |
| `cli.ts` | The argument shapes git uses. |

Two splits exist purely so the browser bundle stays clean: `text.ts` holds the string
half of `textFile.ts`, and `settings.ts` holds the model half of `settingsStore.ts`.
A single `node:fs` import in a module the renderer touches drags a stub of it into the
bundle; `test/build.test.mjs` fails if one ever reappears.

---

## `src/` — one bundle, three kinds of window

`main.tsx` routes on the URL hash:

| Hash | What mounts |
|------|-------------|
| *(none)* | `App` — the main window |
| `#menu=` | `MenuWindow` — a dropdown or context menu |
| `#dialog=` | `DialogWindow` — About, Settings, Print, Error, ... |

On the desktop each popup is a real OS window loading the same URL, which is what
lets a menu be taller than the app window, a context menu spill past its edge, and a
dialog be dragged off it. In a browser the same components render in-page instead.
`host.ts` is the one place that knows the difference; everything else calls
`host.openDialog("settings")` and gets a result. On the desktop it calls
`window.mcm`, which `tauriBridge.ts` installs before anything renders.

Every dialog's size is in `dialogSpecs.ts` — `fixed`, content-fitted, or
`resizable` (the user's guide) — and `DialogName` is derived from that table, so a
new dialog is one entry there plus its component.

### Where the state lives

`state.tsx` holds one store: the settings, the open tabs and the undo stack. Every
action the app can perform is in `commands.ts` as a table of
`{ id, label, icon, shortcut, enabled, checked, run }`. The toolbar, the menu bar, the
context menus, the left panel and the keyboard all read from that table, so an action
has one label, one icon, one shortcut and one implementation no matter how it is
reached — and the GUI test can drive any of them by id.

### Popup windows

`src-tauri/src/popups.rs` pools them. Creating a window is cheap; starting a
webview behind it is not, so the routes carry no name: the shell hands a pooled
window its identity by event (`dialog:payload`, `menu:payload`), and a dismissed
popup is hidden and returned to the pool rather than destroyed. The pool is warmed in
the background a second after startup, so even the first menu of a session opens
instantly. Dialogs are owned by the main window; the menu is not (an owned window can
be clamped inside its owner, the clipping it exists to escape).

Settings changed in one window reach the others through the shell, which excludes the
sender — otherwise two windows would echo an update back and forth forever. Events
are listened to per window (`getCurrentWebviewWindow().listen`): a global listener
would hear what was meant for another window.

---

## Things that were not obvious

**The toolbar measures itself, and must not use its own `scrollWidth`.** The window's
minimum width is the natural width of the toolbar and the menu bar, so no button is
ever clipped and no scrollbar appears under the toolbar. Both rows have a flexible
spacer, so a row's scroll width is however wide the window happens to be; feeding
that back in as a minimum made the window grow a little every time it was measured.
`measure.ts` adds up the groups instead — each by its content width, since a group
that is already squeezed reports the squeezed width — and `App.tsx` re-measures when
groups come and go (the start screen shows fewer). The GUI test asserts the result.

**A menu window must not close on the first blur.** Windows may take the focus
straight back from a window that was just shown (always, when the app is not the
foreground one), so a blur in the first 300 ms is ignored; and a press anywhere in the
window that opened the menu closes it too, for when the OS never gave it focus.

**Flex and grid items have an automatic minimum size.** A canvas's content size is its
backing store, so the diff scrollbar beside each pane refused to shrink and swallowed
half the pane until it got `min-width: 0` as well as a width. The same rule made the
whole shell grow sideways when a hex dump was open, until `.shell` got an explicit
`minmax(0, 1fr)` column, and it is why `flex-basis` on a stacked field's label was
being read as a height.

**The git registration passes paths positionally**: two means a comparison, four
means a merge. No switch to forward means the same command works however the app is
launched; `git mergetool` reads the exit code, which is 0 only once the merge was
saved.

**Tauri's resource folder is a verbatim path** (`\\?\C:\…`). Node cannot start a
script from one (it fails on `lstat 'C:'`), so `core.rs` strips the prefix before
handing paths to the core. Only the installed app takes that path, so it is checked
by copying the release exe and `runtime/` somewhere and running them, not by
`npm start`.

**WebView2 gives an HTML drop no paths.** The desktop app takes OS drops from Tauri's
own drag-and-drop events (`mcm.onFileDrop`), which carry them; nothing in the UI uses
HTML5 dragging, which that handler would otherwise disable.

**A NUL byte is valid UTF-8** but never appears in a text file, so `isBinary` treats
it as binary regardless of what the UTF-8 validator thinks. Without that, a three-byte
file with an embedded NUL opened in the line view.

**The directory map is case-folded but the reported path is not.** Windows and macOS
pair `README.md` with `readme.md`, so the map key is lower-cased — but the entry
reports the path as it is actually spelled on disk.

**A terminal's tab is the terminal.** The bottom panel's strip holds the log and then
one tab per open shell, named after it; there is no tab called "terminal" in front of
them, because a tab that only leads to more tabs is a click that says nothing. Turning the
terminal on opens one, and closing the last one turns it off again.

**The terminal's shells have no pseudo-terminal, so the panel draws the prompt.** The
shells start with their own prompt and echo switched off; after each command they print
a marker line (`__MCM_CWD__:<dir>;<exit code>`) which is stripped from the output and
tells the panel the directory, the status and that the shell is idle again. The command
itself goes into a script file the shell sources, so the one line on stdin is short —
otherwise a program the command starts and which reads stdin would swallow the next
line the user typed. It also means `vim` and `top` cannot run in the panel, which is the
trade for a prompt the app can style and a transcript it can keep.

**A shell that is on disk is not a shell that works.** The scan reads a registry key, a
path, a Windows Terminal profile — any of which can name something that was removed or
refuses to start under a pipe. Each candidate is therefore started once at launch and
given the line it would use to report its directory; only the ones that answer are
offered, and `create` refuses a shell that is not among them rather than quietly opening
a different one. The six on this machine verify in about two and a half seconds, in
parallel and off the startup path.

**cmd expands `%CD%` before it parses the line.** The marker above is `echo` like any
other command, so a directory with `&` in its name — this project's own, as it happens —
cut the echo in half and ran the rest of the path as a command. `%CD%` is quoted and the
quotes stripped when the marker is read; the posix and PowerShell shells quote theirs
already. `test/terminal.test.mjs` runs a command in such a directory.

---

## Testing

```
npm test          samples → unit tests → build → GUI test → one summary
```

**Unit tests** (`test/*.test.mjs`, run by `node --test` with a reporter that groups by
category) cover the engines, the API end to end against a real throwaway git
repository, and the packaging. The packaging tests decode the generated PNG and look
at its pixels, because "transparent outside, lit at the top-left" is a visual
requirement that a file-exists check would pass while the icon was a black square.

**The GUI test** (`npm run smoke`) builds the desktop app into
`src-tauri/target/smoke` — never `target/debug`, which a running `npm start` locks —
starts it with a throwaway `MCM_SETTINGS_DIR` (which also gives it its own WebView2
profile and no single-instance lock) and the WebView's debugging port open, and drives
it through `window.__mcm` over the DevTools protocol (`scripts/cdp.mjs`). Every window
is a target: the app, the menu popup and each dialog, so it checks from both sides —
the page inside a window, and the OS windows the shell owns.

Every poll is raced against its own deadline, and a watchdog guarantees a report is
printed even if a step wedges.

**The shell's own tests** (`cd src-tauri && cargo test`) cover menu placement and
dialog refitting, colour parsing, the merge-tool exit code, the verbatim-path fix, and
that every command is granted to the page.

---

## Build pipeline

```
npm run icons                     scripts/generate-icons.mjs → assets/ (committed)
npm run build
  ├─ vite build                   src/ + core/ → dist/
  └─ scripts/bundle-server.mjs    server/ + core/ → dist-server/{index.cjs, cli.mjs, desktop.cjs}

npm run build:win | build:mac | build:linux     tauri build
  ├─ scripts/tauri-before-build.mjs   vite build · bundle-server · stage-runtime
  │                                   → src-tauri/runtime/ = node + desktop.cjs + dist/
  ├─ cargo build --release            the shell, icons from assets/
  └─ bundle                           NSIS / dmg / AppImage + deb → copied to the root
```

The icon generator is plain Node — a small signed-distance rasteriser, a PNG encoder,
an ICO and an ICNS writer — so the icons rebuild identically on every platform, with
no native image library. Everything the program shows comes from `assets/`: the
bundle and installer icons (`tauri.conf.json`), the menu bar and About icon (a Vite
import), the favicon, and the `.dmrg` document icon. The server bundle is what keeps
`node_modules` out of the installer.

`src-tauri/windows/hooks.nsh` (UTF-8 with BOM, or NSIS garbles the Korean) adds what
the default installer does not: the document icon for `.dmrg`, and a prompt before
the user's data is deleted on uninstall, in the language chosen on the installer's
first page. A silent uninstall — an upgrade — never asks and never deletes it.
