# My Compare Master V1.0

A file, directory and 3-way merge tool that works with git or entirely on its own.
One codebase runs as a desktop application on **Windows, macOS and Linux**, and as a
**web application** in a browser.

![icon](public/icon.png)

---

## What it does

### Sessions

Work is organised the way Beyond Compare organises it: you start a *session* of a
particular kind, and the window arranges itself around it. The start screen offers
every kind, and the panel on the left keeps the ones you saved and the ones you
opened recently.

| Session | |
|---|---|
| **Folder Compare** | Two folder trees side by side, each with its own path bar and its own Back / Up / Home, folders rolled up to show whether anything inside them differs, and a double-click on any file opening it as a line comparison. |
| **Folder Sync** | Mirror, update one way, or two-way — planned first and shown in full, then carried out. Copies run before deletions, and timestamps within two seconds (or a whole daylight-saving hour) count as the same age. |
| **Text Compare** | Two files aligned line for line, with added, removed and modified lines coloured apart and the changed **words inside a modified line** highlighted. |
| **Text Merge** | Base, Local and Remote into an editable Result. |
| **Conflict File** | A file git already left with `<<<<<<<` markers. |
| **Picture Compare** | Side by side, blended with a slider, or as a difference map that counts the changed pixels. PNG, JPEG, GIF, WEBP, BMP, ICO, AVIF and SVG are shown as they are; TIFF is decoded by a decoder of our own and sent to the window as PNG. |
| **Hex Compare** | A byte-for-byte dump of both sides with the differing bytes picked out — chosen deliberately, or fallen back to whenever a file turns out not to be text. |
| **Table Compare** | CSV and TSV read as cells, not text: the delimiter is detected, the columns are padded to the same width on both sides, and a key column puts the rows in the same order so an inserted record is one added line. |
| **Audio Tag Compare** | Two MP3s by their ID3 tags and stream description, so two rips of the same track compare as equal. |
| **Version Compare** | The version information of a Windows executable, a `package.json` or an `Info.plist`. |
| **Registry Compare** | Two `.reg` exports, normalised — hives shortened, wrapped binaries rejoined, keys sorted — so only the settings that differ show. |
| **FTP Compare** | A folder here against one on an FTP or FTPS server. The listing is walked, not downloaded. |
| **Git Repository** | A working tree's changes and history, drawn as a graph of branches and merges; any change opens as a comparison of the right pair of blobs. |

### Merging

- **3-way merge** of Base (common ancestor), Local (ours) and Remote (theirs) into an
  editable Result. Only genuinely conflicting hunks are flagged — non-overlapping
  changes from both sides are merged automatically.
- **Conflict files**: open a file git already left with `<<<<<<<` markers.
- **Conflicts from the index**: a file git reports as conflicted opens as a real 3-way
  merge built from all three stages, so the common ancestor is there even without
  `merge.conflictStyle=diff3`.
- Resolve per hunk — Base / Local / Remote / Both — or edit the result line by line.
  Everything is undoable.
- Saving a fully resolved conflict in a repository also stages it, the way
  `git mergetool` does.

### Acting on the differences

- **Copy a difference across** in a file comparison: the arrows in the middle column
  write that whole block to the other side.
- **Edit a line in place** by double-clicking it; the file is written out.
- **Copy and delete between folders** in a directory comparison, with a confirmation
  before anything is removed.
- **Differences only** hides the unchanged stretches and keeps three lines of context.
- **File masks** (`*.ts`, `*.md`) narrow a folder comparison, from a box above the
  trees, and exclude masks skip what you never want to see.
- **Folder synchronisation** turns a comparison into a list of operations you can
  read before any of them runs.
- **Renamed files are paired back up**, by content, so a tidy-up reads as one move
  rather than a deletion and an addition.
- **Archives are walked into** — zip, jar, docx and the rest — so a build whose only
  change is one file inside a jar says so. Nothing is decompressed to find out: the
  CRCs in the archive's index are enough.
- **Move and rename** as well as copy and delete, and a **flat list** instead of a
  tree when the question is what differs rather than what is where.

### Reading past the noise

- **Syntax highlighting** from a small lexer that knows a dozen language families.
- **Ignore comments**, **ignore quote style** and **ignore number format**: rules that
  change what counts as a difference by reading the file's grammar, so `i++; // fixed`
  and `i++;` are the same line. The displayed text is never altered — only the
  alignment is.
- **Find and replace** over the whole file, with case, whole-word and regular
  expression switches, **go to line**, and **bookmarks** (`Ctrl+F2`, `F2`).
- **Back and forward** (`Alt+Left`, `Alt+Right`) through everything you have looked
  at, across tabs and within a repository.

### A terminal where the comparison is

The bottom panel opens on the **log** of everything that has happened. Turn the
**terminal** on (`` Ctrl+` ``, or the toolbar button) and one starts straight away in the
folder being compared, its shell's name taking its place in the same strip of tabs — so
`git add`, `npm test` and `cd` are a keystroke away from the diff.

- Every shell installed on the machine: Command Prompt, Windows PowerShell, PowerShell,
  Git Bash, MSYS2, Cygwin, each WSL distribution, anything Windows Terminal knows about,
  and on the other platforms `$SHELL` and `/etc/shells`. One tab per session.
- Tab completion, command history, `Ctrl+C`, `Ctrl+L`, multi-line paste.
- The output keeps the programs' own ANSI colours, and colours what they left plain:
  error, warning and success lines, links, `file:line`, and directory listings by kind.
- **A prompt the app draws itself**, from nineteen presets or one you build segment by
  segment — the branch coloured by the state of the repository, and every command kept
  in the transcript with the prompt it was typed at.

---

## Running it

```bash
npm install
npm start          # the desktop app (Tauri), with live reload of the UI
npm run dev:web    # the same app in a browser
npm run preview    # the release exe with its bundled core, without an installer
```

The desktop app is a [Tauri 2](https://tauri.app) shell around the same Node core the
web build uses, so a Rust toolchain (`cargo`) is needed to build it; the installed app
needs neither Node nor Rust. Both launchers pick ports that are free on IPv4 and IPv6
and print them.

### From the command line

```
mycomparemaster                                    nothing open
mycomparemaster A B                                compare two files or two folders
mycomparemaster BASE LOCAL REMOTE MERGED           a 3-way merge
mycomparemaster conflicted.txt                     a file with <<<<<<< markers
mycomparemaster session.dmrg                       a saved session
mycomparemaster /path/to/repo                      a git repository
```

The paths are positional, with no switches, so the same command works however the
app is launched. Two paths mean a comparison and four mean a merge. A second start
while the app is running hands its arguments to the open window.

### As a git difftool and mergetool

**Settings → Git** registers both with one click. By hand:

```bash
git config --global difftool.mycomparemaster.cmd '"<path to the exe>" "$LOCAL" "$REMOTE"'
git config --global diff.tool mycomparemaster
git config --global difftool.prompt false

git config --global mergetool.mycomparemaster.cmd '"<path to the exe>" "$BASE" "$LOCAL" "$REMOTE" "$MERGED"'
git config --global mergetool.mycomparemaster.trustExitCode true
git config --global merge.tool mycomparemaster
git config --global mergetool.prompt false
```

Then:

```bash
git difftool
git mergetool
```

The app exits with `0` once a fully resolved merge has been saved and non-zero
otherwise, which is what `trustExitCode` reads to decide whether the file is resolved.

---

## Building installers

```bash
npm run build        # UI (dist/) and server bundles (dist-server/)
npm run build:win    # NSIS installer
npm run build:mac    # dmg
npm run build:linux  # AppImage + deb
npm run icons        # redraw the icons in assets/ (only after changing the drawing)
```

`tauri build` runs `scripts/tauri-before-build.mjs` first: the UI, the server bundle,
and `src-tauri/runtime/` — a copy of the Node runtime, the bundled core
(`desktop.cjs`) and the built UI — which the installer ships, so the target machine needs
no Node.js. Installers land in `src-tauri/target/release/bundle/`; each platform build
ends with `npm run installer`, which copies them to the project root.

The Windows installer:

- offers **Korean and English**, chosen on its first page;
- upgrades an earlier installation in place;
- asks, when uninstalling, whether to delete your settings and sessions as well;
- registers the **`.dmrg` session file type** with its own document icon;
- uses the same icon for the application, the installer and the uninstaller.

All icons live in `assets/`: `icon.png` / `icon.ico` / `icon.icns` and `icons/*.png`
for the program, `document.png` / `document.ico` for `.dmrg` files. They are drawn
by `scripts/generate-icons.mjs` and committed.

---

## Testing

```bash
npm test             # everything: unit tests, a build, and the GUI test
npm run test:unit    # the unit tests only
npm run test:gui     # the GUI test only
npm run smoke        # the GUI test on its own, with its full report
(cd src-tauri && cargo test)   # the shell's own tests
```

`npm test` prints its results grouped by category and ends with one summary over
everything:

```
TOTAL                387 / 387  ████████████████ 100%   ALL PASSED
```

- **Unit tests** (`test/*.test.mjs`) cover the diff and merge engines, the directory
  tree, the file masks, the copy/delete/move/rename operations, the synchronisation
  planner, rename detection, the ZIP reader, the lexer and its ignore rules, search
  and replace, the table, audio, version and registry readers, the history graph,
  the TIFF decoder and PNG encoder, the FTP client — against a real FTP server
  started by the test — the settings model, the contrast of all forty-one themes,
  the print layout, the whole HTTP API end to end against a real
  throwaway git repository, and the packaging — including decoding the generated
  icon's pixels to check that its border really is transparent and its top-left
  corner really is lit.
- **The GUI test** (`npm run smoke`) builds the desktop app into its own target folder,
  starts it with a throwaway settings folder and the WebView's debugging port open, and
  drives every window — the app, the menu popup, each dialog — over the DevTools
  protocol, through the same store actions and DOM a user's clicks reach. It never
  touches an `npm start` you have running.

---

## Project layout

| Path | What is in it |
|------|---------------|
| `core/` | Everything with no platform behind it: the diff and merge engines, the directory tree, file operations, git, the terminal and its prompt themes, settings, themes, strings, print layout. |
| `server/` | The HTTP API and the standalone web server. |
| `src-tauri/` | The desktop shell (Rust, Tauri 2): starts the core, the main window, the menu and dialog popup windows, the installer hooks. |
| `src/` | The React interface, shared by the desktop and web builds; `tauriBridge.ts` is the desktop bridge. |
| `assets/` | Every icon the program uses: the app icon in all sizes and the `.dmrg` document icon. |
| `scripts/` | Development launcher, icon generator, bundlers, runtime staging, test runners. |
| `test/` | Unit tests and the reporter that groups them by category. |
| `samples/` | Generated inputs the GUI test and a curious user can both try. |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and
[UsersGuide.md](UsersGuide.md) for the user-facing walkthrough.

---

## Settings and data

| | |
|---|---|
| Windows | `%AppData%\MyCompareMaster\settings.json` |
| macOS | `~/Library/Application Support/MyCompareMaster/settings.json` |
| Linux | `~/.config/MyCompareMaster/settings.json` |

Settings carry the language, the theme (one of forty, or the custom one and its four
colours), the font (family, size, weight, style), the zoom, the comparison options,
the width of each side panel, the window position, the print setup, the last ten
recent items and the folders they came from. `MCM_SETTINGS_DIR` overrides the
location, which is what the tests use.

---

## Copyright

My Compare Master V1.0 — Copyright (c) SHKWON(knix008@naver.com)
