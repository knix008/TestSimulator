# Terminal and log

The **bottom panel** below the editor has three tabs — **Terminal · Log · Problems**. This chapter covers the terminal for running commands, prompt themes for styling the prompt, and the log that records status messages. For the Problems tab, see [Format and lint](12-format-and-lint.md).

![Terminal](images/terminal.png)
*Figure: The terminal in the bottom panel — shell tabs, a coloured prompt, command output*

## Opening and closing the bottom panel

| Method | Action |
|---|---|
| Ctrl+\` (outside Markdown documents) | Open / close the Terminal tab |
| Ctrl+Shift+\` | Open a new terminal right away |
| The Terminal · Log · Problems buttons on the toolbar | Open the panel on that tab |
| View › Terminal / Log / Problems / New terminal | Same as above |
| The Terminal · Log cards on the start page | Same as above |
| The × (Close the panel) at the right of the panel header | Close the panel |

- There is one panel, and its three tabs are always together. Pressing another tab's button brings that tab forward, and **pressing the button of the tab already in front again closes the panel**.
- The panel spans **from the left edge of the window to the right edge**, including below the folder tree.
- Dragging the panel's top border changes its height (remembered).
- When you first open the Terminal tab and there is no terminal, one starts automatically.
- In Markdown documents Ctrl+\` is the inline code format, so use the toolbar button or the View menu.

## Terminals and shells

In the panel header, the open terminals line up as small tabs to the right of the Terminal tab. Each tab shows the shell name and a number, and hovering shows its start directory.

- **+ (New terminal)**: opens a new terminal with the default shell.
- **▾ (New terminal with a shell…)**: pick from the list of shells installed on this computer.
  - Windows: whichever of Command Prompt · Windows PowerShell · PowerShell (7) · Git Bash · MSYS2 · Cygwin are installed
  - macOS · Linux: the default shell · bash · sh and so on
- The **×** on a terminal tab or a **middle click** closes that terminal (the shell exits).
- With no terminal at all, it shows "No terminal. Press + to open one." and a **New terminal** button.
- If a shell ends with an error, its tab does not disappear; the shell restarts with the next command.

A new terminal starts with the **Default shell** from Settings › Terminal, in the **Start directory**. If the start directory is left empty, it starts in the folder open in the folder tree, or if there is none, in the current document's folder.

## Entering commands

Type a command **right after the prompt** at the bottom of the output and press Enter. The line you typed stays in place with the prompt of the moment, followed by the result.

| Key | Action |
|---|---|
| Enter | Run the command |
| ↑ / ↓ | Previous / next command in history |
| Tab | Completion |
| Ctrl+L, or the `clear` command | Clear the screen |
| Ctrl+C (when the input is empty) | Interrupt the running command |
| Esc | Clear the line being typed |

- While a command runs, the prompt disappears, and lines you type then are passed **as input to the running program** (for example, to answer "Continue? (y/n)").
- When you paste several lines, each complete line runs in turn, and the last incomplete line stays in the input.
- If a command fails or has a syntax error, the shell does not exit; the error message is shown as is.

**Tab completion**: the first word is looked up among the shell's built-in commands and the executables on PATH, other words among paths (including `..`, `~`, absolute paths and quotes). With one candidate it fills it in right away (a space after a file · command, a separator after a directory); with several it fills in the common part, and **pressing Tab once more** shows the list of candidates.

## How the terminal works

- The shell is connected through pipes, without a pseudo-terminal (PTY), and works **line by line**. Programs that draw the whole screen themselves, such as vim and top, do not work well.
- Output that redraws the same line with CR, such as progress bars, overwrites that line as in a real terminal.
- The shell always starts with a UTF-8 locale, so Korean file names are not garbled. In Command Prompt · PowerShell, output mixing the code page (CP949) and UTF-8 is read correctly too.
- The third · fourth columns of `ls -al` (e.g. `shkwon 197121`) are the owner and the **group**. Windows groups have no names, so the `ls` of Git Bash · Cygwin shows the numeric ID as is; these are not garbled characters. Use `ls -alG` to leave out the group column.

## Output colours

With **Colour the output** (on by default) turned on under Settings › Terminal, output is coloured as follows. When off, it is plain.

- The **ANSI colours** that programs emit (git · npm · ls --color and so on), as they are
- Lines starting with **error / failed** in red, **warning** in yellow, **ok / done** in green
- **URLs** and **file:line** references highlighted
- Listings such as `dir` · `ls -l` · `Get-ChildItem` colour the names by kind — folders (blue) · links · executables (green) · archives (red) · pictures (purple) · documents (yellow) · code (sky blue) — with the date · size columns dimmed

Programs connected through a pipe usually do not colour their output themselves, so programs with colour options are told to turn them on (environment variables for git · npm · pytest · cargo · gcc/cmake · .NET and so on, and `--color=always` for `ls` · `grep` · `diff` · `tree` in Git Bash and similar).

## Prompt themes

The prompt is drawn with a **prompt theme**. Change it in the **Prompt** section of Settings › Terminal; on the Terminal tab, the **⚙ (Terminal settings)** at the right of the panel header opens it directly.

![Terminal settings](images/settings-terminal.png)
*Figure: Settings › Terminal — default shell, start directory, prompt editing*

- **Preview**: shows the current prompt in three states — clean repository / changed repository / no repository.
- 20 **preset** cards: clicking one applies it immediately — Default (My Editor), Powerline, Agnoster, Paradox (two lines), Minimal, Plain text (no colours), Bubbles, Robby Russell, Pure, Star, Slim, Material, Classic (user@host:path$), Rainbow, Ocean, Mono, Forest, Sunset, Nord, Developer.
- **Quick options**: the segments to show (OS · user@host · Shell · Path · git · Execution time · Exit code · Time), **Shape** (Powerline / Plain / Diamond (rounded)), **Path style** (Full path, Folder name only, Short, Initials and so on), **Two lines**.
- **git state colours**: colours only the branch (git) block with the repository state colour. You can pick each state's colour yourself and return to **Defaults**; unchecking it uses the preset's own colours.
- **Advanced**: choose a segment from the list on the left and change its type · text / background colour · template · symbols and so on on the right. You can also add · remove blocks (lines), add · move up · move down · remove segments, and choose whether there is a space after the prompt. Templates use variables such as `.Path` and `.Branch` (the variables available are listed under each segment).
- **Save the current prompt**: saving the current look under a name keeps it as a ★ card (custom prompt) next to the presets. **Save changes** and **Delete** are available too.

Segment types: Path · git · user@host · Shell · OS · Time · Exit code · Execution time · Root · Text.

### Git state colours

The default prompt is 📁 current directory ▶ (inside a Git repository) ⎇ branch and state ▶ input. The branch block is coloured by the repository state.

| Colour | State |
|---|---|
| Green | clean · pushed |
| Red | modified — add needed |
| Yellow | staged — commit needed |
| Orange | committed — push needed |
| Blue | new commits on the remote — pull needed |
| Crimson | conflicts — resolve needed |

Only the applicable state symbols follow the branch name: `↑` ahead · `↓` behind · `+` staged · `~` modified · `?` untracked · `!` conflicts. Hovering shows the branch · upstream and each count. The Git state is read again every time a command finishes; in large repositories the prompt is drawn first with the previous state, and its colour changes if the new state differs. To make it faster, turn on `git config core.fsmonitor true` and `git config core.untrackedCache true` in the repository.

## Log

The **Log** tab collects the messages shown in the status bar (Opened, Saved, errors and so on) in order, **with their times**. If you missed a status bar message, you can read it again here.

![Log](images/log.png)
*Figure: The Log tab of the bottom panel*

- Open it with the **Log** button on the toolbar or View › Log.
- The **Clear log** button in the header empties the record. When empty, it shows "The log is empty."
- The log keeps up to the latest 400 entries, only for the current run; it is not saved to a file.
