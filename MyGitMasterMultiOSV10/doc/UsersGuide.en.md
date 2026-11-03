# My Git Master V1.0.0 — User's Guide

My Git Master is a Git client that shows the commit graph, changed files, diffs, branches, tags and GitHub Releases on one screen. In a local repository it also runs Git Add, Reset, Discard, Commit, Fetch, Pull, Push and Stash.

The desktop app (Windows, macOS, Linux) and the web browser share the same screen. The desktop app is built with Tauri, and its installer contains everything it needs to run.

The default language is Korean. Git command names (Git Add, Git Commit, Git Fetch and so on) are shown in English in both Korean and English.

Author: SHKWON (knix008@naver.com)

---

## Contents

1. [Getting started](#getting-started)
2. [Start screen](#start-screen)
3. [Tutorial](#tutorial)
4. [Screen layout](#layout)
5. [Open · Clone · Browse Remote](#open-clone-browse)
6. [Files panel](#files-panel)
7. [Repository panel](#repository-panel)
8. [Commit History](#commit-history)
9. [Commit Details and Diff](#commit-details)
10. [Git actions](#git-actions)
11. [Export summary](#export-summary)
12. [Theme, language and preferences](#theme-language-prefs)
13. [Terminal](#terminal)
14. [Menus and toolbar](#menus-toolbar)
15. [Windows and popups](#windows)
16. [Error dialog](#error-dialog)
17. [Where settings are kept](#settings-location)
18. [Troubleshooting](#troubleshooting)

---

<a id="getting-started"></a>
## Getting started

<a id="install"></a>
### Installer

Run `My Git Master_1.0.0_x64-setup.exe` (Windows) from the project root. On the first page of the setup wizard choose 한국어 or English. It installs for the current user, so no administrator rights are needed. Git must be installed on this computer; Node.js is not needed.

When you uninstall, you are asked whether to delete your user data (settings, saved credentials, remote repository cache) as well. Choose **No** to keep it for the next installation.

<a id="dev-run"></a>
### Running from source

Run these in the project root.

```powershell
npm install
npm start
```

The desktop window opens, and you can use the operating system's folder picker. Changes to the screen code show in the window at once.

<a id="web"></a>
### Web

```powershell
npm run dev:web
```

Open the address printed in the terminal (by default http://127.0.0.1:5173) in a browser. On the web you type a path instead of using a folder dialog. If the port is busy, the next free one is used.

For building installers and the other commands, see [README.md](../README.md).

<a id="last-session"></a>
### Last session

The repository you opened last is opened again the next time. Whichever of Open, Clone or Browse Remote succeeded last is restored. When **Show the start screen at startup** is on, the repository opens behind the start screen, which is shown first.

<a id="program-icon"></a>
### Program icon

A white Git branch on a rounded square that runs from orange to violet. The installer, the taskbar, the window title and the About window all use the same icon.

---

<a id="start-screen"></a>
## Start screen

The start screen appears when no repository is open and, when **Show the start screen at startup** is on, every time the program starts. The menu bar and the toolbar at the top keep working on the start screen.

<a id="start-toggle"></a>
### Start button

The **Start** button sits right after the program name and version in the menu bar. Each press switches between the start screen and the workspace. While the start screen is shown, the button stays pressed in the accent colour. Opening another repository returns to the workspace.

<a id="start-cards"></a>
### Cards

The start screen is made of cards.

| Card | Contents |
|------|----------|
| **Start** | User's guide, tutorial, Open, Clone, Browse Remote |
| **Menu** | Open repository, Open folder, Clone, Browse Remote, Terminal, Theme settings, Language, Preferences, Start screen settings, User's guide, Tutorial, About, Exit — each with a colourful icon and its name |
| **Recent repositories** | Click to open again. Remove one, or clear them all. |
| **Recent URLs** | Clone or browse them. Remove from the list. |
| **Theme** | My themes and the settings button, then the Dark and Light themes |
| **Background** | 20 moving 3D backgrounds, speed and opacity |

Drag a card by its title to move it, and drag its corner to resize it. The arrangement is saved; **Preferences → Start screen → Reset card layout** puts the cards back where they started.

<a id="start-background"></a>
### Background

Pick one of the 20 backgrounds in the Background card or in **Preferences → Start screen**. Each background has a colourful icon, and the chosen one has an accent-coloured outline. With **Shuffle** on, the background changes at a set interval.

Speed and opacity are small **−** / **+** steppers on one line. Speed is how fast the background moves; opacity is how solid the cards over it are. When the operating system asks for reduced motion, the default speed is slower.

---

<a id="tutorial"></a>
## Tutorial

On the first start, a tutorial card appears on the start screen. **Start** begins a guided tour that points out each part of the screen in turn, switching between the start screen and the workspace as the steps need.

- The card shows only on the start screen. It disappears when you switch to the workspace and comes back when you return to the start screen.
- Closing the card or choosing **Later** keeps it away until the next start.
- Turning off **Show at startup** on the card stops it from appearing by itself. The same setting is in **Preferences → General → Show the tutorial at startup**.
- **Help → Tutorial** starts the tour again at any time.

---

<a id="layout"></a>
## Screen layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ My Git Master 1.0.0 [Start]  File  Repository  History  Help     ─ □ ×   │
│ [icon-only Git command buttons …]          [Theme▾] [Lang] [⚙] [ⓘ]       │
├────────────────────────────┬─────────────────────────────────────────────┤
│ Files                      │ Commit History                              │
│ Drives · Open Folder       │ Graph, message, SHA, author, date           │
│ File tree                  ├──────────────────────┬──────────────────────┤
│                            │ Commit Details       │ Diff                 │
│ Repository                 │ Changed files        │ unified diff         │
│ Branches · Remotes · Tags · Releases │            │                      │
├────────────────────────────┴──────────────────────┴──────────────────────┤
│ [Log] [PowerShell 1 ×] [bash 2 ×] [+][▾]                       [<] [>]   │
└──────────────────────────────────────────────────────────────────────────┘
```

On the left, **Files is on top** and **Repository is below**. Drag the splitters between the panels to resize them. The bottom panel holds one Log tab and the terminal tabs.

Menus, menu items, the toolbar, context menus and dialog titles all show colourful icons. The settings button is a gear. Menu and panel titles always stay on one line; when there is no room they end in "…", and hovering shows the full name.

---

<a id="open-clone-browse"></a>
## Open · Clone · Browse Remote

<a id="open-local"></a>
### Opening a local repository

1. **File → Open...** or **Open** on the toolbar. On the web, `Ctrl+O` does the same.
2. On the desktop you pick a folder; on the web you type its path.
3. If the folder has a `.git`, its branches, files and commit history open.

<a id="clone"></a>
### Clone

1. **File → Clone...** or **Clone** on the toolbar
2. Enter the repository URL and the target folder.
3. For a private HTTPS repository, enter your user name and a Personal Access Token.
4. When the clone finishes, that folder opens. The token is not stored in the remote URL.

While it runs, **Stop** on the toolbar cancels it.

<a id="browse-remote"></a>
### Browse Remote

Use this to look at the history without creating a local working folder.

1. **File → Browse Remote...**
2. Enter the URL and confirm.
3. It opens read-only from a bare cache.

In this mode Checkout, Git Add, Commit and Push do not work.

<a id="recent"></a>
### Recent items

- Recent repositories are listed at the bottom of the **File** menu.
- URLs used for Clone and Browse Remote are remembered in the settings, up to 10.

---

<a id="files-panel"></a>
## Files panel

Next to its title are this computer's drives and **Open Folder**.

| Action | Result |
|--------|--------|
| Click a drive | Lists that drive's folders. A drive root is never opened as a Git repository. |
| **Open Folder** | Opens the repository if it is one; otherwise browses the folder. |
| Click the Files title | While browsing folders with a repository open, returns to the repository's files. |
| Click a folder | Expands or collapses it. |
| Double-click a file | Opens it in the operating system's default app. |

<a id="status-badges"></a>
### Status badges

| Badge | Meaning |
|-------|---------|
| `U` | Untracked file |
| `±` | Modified |
| `D` | Deleted |
| `R` | Renamed |
| `T` | Type changed |
| `!` | Conflict |
| `X` | Ignored by `.gitignore` |
| `P` | Committed but not pushed yet |

A folder's badge sums up the changes inside it. When another program changes a file, the list is read again shortly afterwards.

<a id="files-context-menu"></a>
### Right-click on a repository file

| Menu | Action |
|------|--------|
| **Resolve Conflict...** | Only on a conflicted file. Opens it in the default merge tool. |
| **Show Log** | Shows only the commits of that path in the history |
| **Copy Path** | Copies the path relative to the repository |
| **Show All Commits** | Clears the path filter |
| **Git Add / Git Reset / Discard Changes** | Git actions on the selected item |
| **Git Commit / Git Fetch / Git Pull / Git Push / Git Stash / Git Stash Pop / Git Status** | Git actions on the whole repository — the same as the **Repository** menu. |
| **New File... / New Folder...** | Creates one under the selected place |
| **Delete** | Deletes it from disk |
| **Add to / Remove from .gitignore** | Changes the ignore rules |

Files and folders have the same menu. Git Add, Git Reset, Discard Changes and Show Log apply to the chosen path only; Commit and Fetch / Pull / Push / Stash apply to the whole repository.

While browsing folders, the menu has **Open Folder** and **Copy Path**.

---

<a id="repository-panel"></a>
## Repository panel

At the bottom left.

| Section | Contents |
|---------|----------|
| **Local Branches** | Local branches; the current one is marked. |
| **Remotes** | Remote branches |
| **Tags** | Tags |
| **Releases** | GitHub Releases, when there is a remote of the form `github.com/owner/repo` |

Right-click a local branch for **Checkout**, **Copy Name** and **Export Summary**. Checkout works only in a repository with a working folder.

Remotes and tags can copy their name or SHA.

---

<a id="commit-history"></a>
## Commit History

Each lane is a branch or a merge path. Click a row to change the details and diff on the right. When you look at the log of a single file, the graph is flattened into one line.

Right-click:

| Menu | Action |
|------|--------|
| **Copy SHA** | The full hash |
| **Copy Message** | The commit message |
| **Export Commit Snapshot** | Saves that commit's files to a folder |

**History → Show All Commits** clears the path filter.

---

<a id="commit-details"></a>
## Commit Details and Diff

The selected commit's author, date, message and its list of changed files.

- Click a changed file to open its diff.
- A double-click, or right-click **Built-in Diff Tool**, opens a side-by-side comparison in a separate window.
- Right-click **External Diff Tool** runs the external diff tool from Preferences. Without one, the error dialog says why.
- Right-click in the diff for **Copy** and **Word Wrap**. Word wrap is on by default.

---

<a id="git-actions"></a>
## Git actions

These work only in a repository with a working folder; in Browse Remote they are disabled.

Run them from the **Repository** menu or by right-clicking in Files.

| Menu | Action |
|------|--------|
| **Git Add** | Stages the selected paths, after showing what will be added. |
| **Git Reset (Unstage)** | Unstages |
| **Discard Changes** | Reverts working-tree changes. Untracked files may be deleted. |
| **Git Commit** | Commits what is staged |
| **Git Fetch** | Fetches from `origin` |
| **Git Pull** | Merges fast-forward |
| **Git Push** | Without an upstream, pushes the current branch to `origin` |
| **Git Stash / Git Stash Pop** | Puts changes aside and brings them back |
| **Git Status** | Shows the `git status` output |
| **Resolve Conflict...** | Opens a conflicted file in the merge tool. If the selected file is not conflicted, the first conflicted file is used. |

<a id="conflicts"></a>
### Resolving conflicts

When a Pull or Merge stops on a conflict, the file gets a conflict badge in the Files panel. Open it with **Repository → Resolve Conflict...**, **Resolve Conflict** on the toolbar, or by right-clicking the file and choosing **Resolve Conflict...**.

The default is the **built-in Diff & Merge**, which opens in a separate window.

- Each conflict block shows Base, Local and Remote in three columns side by side.
- Choosing **Base / Local / Remote / Both** marks that block resolved.
- The top shows resolved / total, and **Save** is enabled only once every block has a choice.
- **Save** writes the working-tree file and runs `git add`. Then commit.
- Opening a file without conflicts in this window shows the error dialog.

If you choose an external merge tool in Preferences, the same menu runs that tool.

<a id="commit-message"></a>
### Commit message

```
[Category] Subject

Body (optional)
```

The default categories are 기능추가 (feature added), 기능변경 (feature changed), 기능삭제 (feature removed), 버그수정 (bug fix), 문서 (docs), 리팩토링 (refactoring), 성능개선 (performance), 테스트 (tests) and 기타 (other). Edit the list with **Manage...**; it is saved in the settings.

To commit, `user.name` and `user.email` must be set in that repository or in your global Git configuration.

```powershell
git config user.name "Your Name"
git config user.email "you@example.com"
```

<a id="https-credentials"></a>
### HTTPS credentials

When Fetch, Pull or Push need authentication, you are asked for a user name and token. On success the token is stored encrypted and you are not asked again. If authentication fails, the stored value is kept and the dialog appears again next time.

GitHub uses a Personal Access Token instead of the account password. For a repository that requires organization SSO, authorize the token for that organization and try again.

---

<a id="export-summary"></a>
## Export summary

Choose **History → Export Summary**, or **Export Summary** in a branch's menu.

The dialog shows the path, branches, remotes, number of commits, contributors and recent commits as Markdown.

- **Save Markdown** — downloads `summary.md`
- **Print / PDF** — the print preview window

---

<a id="theme-language-prefs"></a>
## Theme, language and preferences

<a id="toolbar-right"></a>
### Right end of the toolbar

| Button | Action |
|--------|--------|
| **Color theme** | Switches to the next theme; the **▾** next to it opens the theme list. Applied and saved as soon as you choose. |
| **Language** | 한국어 or English. Changes without a restart. |
| **Preferences** (gear) | Opens the Preferences window. |
| **About** | Version, the author SHKWON (knix008@naver.com) and the settings file path |

The default theme is Light Classic.

<a id="theme-menu"></a>
### Theme list

The theme list that **▾** opens runs from the top in this order:

1. **My themes** and the **Theme settings** button (a gear), which opens the Theme tab of Preferences.
2. The 20 **Dark** themes
3. The 20 **Light** themes

Within each group, the themes sit in two columns of equal-sized entries, filled from top to bottom, with swatches and names lined up vertically. The list is its own window, so it is never cut off at the edge of the main window.

<a id="user-themes"></a>
### My themes

Make your own themes in **Preferences → Theme**.

- **New**: a new theme based on the one in use.
- Rename it, switch it between Light and Dark.
- Pick its 10 colours — background, panel, text, muted text, lines, accent, accent background, header, stripes and danger — with a live preview.
- **Delete**: deleting the theme in use switches to Light Classic.

**Restore defaults** keeps your themes.

<a id="preferences"></a>
### Preferences window

Open it with **File → Preferences...** or the gear in the toolbar. Preferences is a window of its own: you can resize it (down to 640×420) and move it outside the main window. The tabs run down the left side, and every change applies at once, with no Save button.

| Tab | Contents |
|-----|----------|
| **General** | UI language, the terminal's default shell, show the tutorial at startup |
| **Theme** | My themes, the Dark and Light themes, and the theme editor |
| **Start screen** | Show the start screen at startup, show the tutorial at startup, background, speed and opacity, show the start screen now, reset card layout, reset start screen settings |
| **Prompt** | The terminal prompt's preview, presets, my prompts and quick options (see [Prompt](#prompt)) |
| **Prompt editor** | Edit the prompt's segments one by one |
| **Tools** | External diff and merge tools |

On the **Tools** tab:

- External diff tool path
- Argument template; the default is `"{left}" "{right}"`
- Merge tool; the default is **Built-in Diff & Merge (default)**. You can pick an installed external tool from the list or type a path.
- Merge argument template; the default is `"{base}" "{local}" "{remote}" "{merged}"`

`{left}` and `{right}` become the paths of the temporary files being compared. `{base}`, `{local}` and `{remote}` are temporary files of the three conflicting versions, and `{merged}` is the file in the working tree. With the built-in Diff & Merge, the path and argument fields are not used.

**Restore defaults** resets the language, theme, shell, tools, start screen, tutorial and prompt settings. Your own themes and prompts stay.

---

<a id="terminal"></a>
## Terminal

The terminal tabs in the bottom panel run this computer's shells. They start in the open repository's folder.

<a id="terminal-tabs"></a>
### Terminal tabs

| Action | How |
|--------|-----|
| New terminal | **+** opens the default shell; **▾** picks one of the installed shells. |
| Switch terminal | Click its tab. Each tab keeps its own shell and output. |
| Move between tabs | When there are more tabs than fit, use **<** / **>** at the right end. They are disabled when not needed. |
| Close | The tab's **×**, a middle-click on the tab, or `exit` in the shell |

Tabs are named after the shell plus a number, such as "PowerShell 1". There is exactly one **Log** tab, and it cannot be closed. Folding and unfolding the bottom panel keeps the terminals as they were.

<a id="prompt"></a>
### Prompt

Change how the terminal prompt looks in **Preferences → Prompt / Prompt editor**. Changes show from the next prompt.

- **Preview**: a clean repository, a repository with changes, and a folder outside any repository.
- **Presets**: click a card to use that prompt.
- **My prompts**: save the current prompt under a name, save it again, or delete it. Restore defaults keeps them.
- **Quick options**: which segments show (OS, session, shell, path, git, execution time, status, time), the shape (powerline / plain / rounded), the path style, two lines, the git display (off / branch / status) and the git state colours.
- **Prompt editor**: pick a segment in the list on the left and change its type, shape, colours and template on the right.

The terminal draws the prompt's arrows and path separators itself, so no special font is needed.

<a id="prompt-shells"></a>
### Shell support

| Shell | Prompt |
|-------|--------|
| PowerShell / pwsh | Fully supported: git status, exit code, execution time |
| bash (Git Bash, MSYS, Cygwin) | Fully supported; your usual startup files are still read |
| zsh | Supported |
| cmd | The prompt drawn when the terminal opened stays, and only the folder changes. No git status or exit code; changed settings apply in a new terminal |
| WSL | Uses WSL's own prompt |

---

<a id="menus-toolbar"></a>
## Menus and toolbar

<a id="menu-file"></a>
### File

| Item | Description |
|------|-------------|
| **Open...** | A local Git repository. `Ctrl+O` |
| **Clone...** | Clones a remote repository into a folder |
| **Browse Remote...** | Read-only history |
| Recent repositories | Open again |
| **Preferences...** | Language, theme, external diff |

<a id="menu-repository"></a>
### Repository

Refresh, Git Add, Git Reset, Discard Changes, Git Commit, Resolve Conflict..., Git Fetch, Git Pull, Git Push, Git Stash, Git Stash Pop, Git Status.

<a id="menu-history"></a>
### History

Show All Commits, Export Summary, Export Commit Snapshot.

<a id="menu-help"></a>
### Help

| Item | Description |
|------|-------------|
| **User's Guide** (`F1`) | Opens this guide in a window of its own ([User's guide window](#guide-window)) |
| **Tutorial** | Starts the guided tour from the beginning |
| **About** | The same as **About** at the right end of the toolbar |

<a id="toolbar"></a>
### Toolbar

Toolbar buttons show a colourful icon only, without a name; hovering shows the name. From the left: Open, Clone, Browse Remote, Print, Refresh, the Git commands (Git Add, Git Reset, Discard, Git Commit, Resolve Conflict, Git Fetch, Git Pull, Git Push, Git Stash, Git Stash Pop, Git Status) and the panel buttons. **Resolve Conflict** is enabled only when there is a conflicted file. While something runs, **Stop** appears. At the right end are theme, language, Preferences (gear) and About.

The main window never gets narrower than the width at which every toolbar button is visible; that minimum follows the language. In a web browser, a narrow window moves the buttons that don't fit into a **More** list.

---

<a id="windows"></a>
## Windows and popups

In the desktop app, menus, the theme list, dialogs (Open, Clone, Browse Remote, sign-in, Commit, Preferences, About, Error, confirmations, reports, export), the print preview and the progress window all open as windows of their own. They can be moved outside the main window and are never cut off at its edge. In a web browser the same content appears inside the page.

- Every popup window has an icon, a title and a close (×) button at the top. Drag the title row to move it; `Esc` closes it.
- The print preview and Preferences can be resized. Printing happens from inside the preview window.

<a id="progress-popup"></a>
### Progress window

When something slow — Clone, Fetch, Pull, Push, Browse Remote — takes longer than 0.4 seconds, a progress window appears. It shows the operation's name and icon, the last progress line Git printed, a moving bar and the elapsed time; **Cancel** stops the operation. It closes by itself when the work is done.

<a id="guide-window"></a>
### User's guide window

Open it with `F1` or **Help → User's Guide**. It is a resizable window of its own.

- Click an entry in the contents on the left to jump there; the contents also mark where you are reading.
- Type words in the search box at the top to highlight where they appear. `Enter` goes to the next match, `Esc` clears the search.
- The language button shows the language it switches to: the Union Jack and **영어** in the Korean guide, the Korean flag and **한국어** in the English guide.
- **−** / **+** change the text size.

---

<a id="error-dialog"></a>
## Error dialog

When something fails, the **Error** window shows the request, the HTTP status, the error code, the message and the details the server returned, including what Git printed.

**Copy** puts all of it on the clipboard; the button then reads **Copied.**

---

<a id="settings-location"></a>
## Where settings are kept

| OS | Settings file | Browse Remote cache |
|----|---------------|---------------------|
| Windows | `%AppData%\MyGitMaster\settings.json` | `%LocalAppData%\MyGitMaster\remote-cache\` |
| macOS | `~/Library/Application Support/MyGitMaster/settings.json` | `~/Library/Caches/MyGitMaster/remote-cache/` |
| Linux | `~/.config/MyGitMaster/settings.json` | `~/.cache/MyGitMaster/remote-cache/` |

On a computer that used the older MyGitJS, the settings and token key in the `MyGitJS` folder are copied over once, on the first start. The desktop window's position and size are kept in this file too, under `window`.

The `.key` in the same folder encrypts the token; opening `settings.json` never shows it in plain text. Recent repositories and recent URLs are kept up to 10 each.

---

<a id="troubleshooting"></a>
## Troubleshooting

<a id="ts-git-missing"></a>
### Git cannot be found

If the top of the screen says Git is missing, check that `git` runs in a terminal, then restart the app.

<a id="ts-open-failed"></a>
### A repository will not open

Check that the folder has a `.git`. A folder that is not a Git repository can only be listed with **Open Folder**. Copying the details from the error window makes the cause easier to tell.

<a id="ts-clone-failed"></a>
### Clone or Browse Remote fails

- Check that the URL has the form `https://` or `file://`.
- Private GitHub repositories need a PAT.
- The clone target folder must be empty or not exist yet.
- If the cache gets confused, delete that URL's cache folder and browse again. On Windows it is under `%LocalAppData%\MyGitMaster\remote-cache\`.

<a id="ts-commit-push-failed"></a>
### Commit or push fails

- Check `user.name` and `user.email`.
- Check that you staged with Git Add before committing.
- Push needs an `origin`.
- If 403 keeps coming back, check the token's organization SSO authorization.

<a id="ts-external-diff"></a>
### The external diff does not open

Set the tool's path in **File → Preferences...**. Until then, the error dialog opens.

<a id="ts-tool-window"></a>
### A tool window does not open

When the web browser blocks pop-ups, the built-in Diff or Diff & Merge window does not open and the reason is shown. Allow pop-ups for this address. The desktop app opens the Diff and Merge windows itself, and when one is already open it shows the new file there.

<a id="ts-terminal-prompt"></a>
### The terminal prompt looks plain

In cmd, prompt settings changed after the terminal opened don't show; open a new terminal tab. WSL always uses its own prompt. If another shell shows only a plain prompt, it has lost its connection to the program: close the terminal tab and open a new one.

<a id="ts-release-empty"></a>
### Releases are empty

Check that the remote URL has the GitHub `owner/repo` form and that you are online. Public repositories are read without a token.
