# Web version and troubleshooting

Besides the desktop app, My Editor offers a **web version** that uses the same screen in a browser. This chapter covers running the web version and how it differs, where the data files are, and how to solve common problems.

## Running the web version

Run it from the project folder with these commands:

```bash
npm run web                       # build, then http://127.0.0.1:5190 (the browser opens automatically)
node server/server.js --host 0.0.0.0 --port 8080 --token secret
```

- `npm run web` builds the screen, starts a server reachable only from this computer (127.0.0.1:5190), and opens the browser.
- To allow access from other computers, give `--host 0.0.0.0` and the `--port` you want, and **always use `--token` with them**. If you open it to the outside without a token, the server prints a warning.
- Adding `?token=secret` after the address when you connect makes the browser remember it. The address with the token is printed when the server starts.
- `--config` changes the location of the settings file.

## How the web version differs

- The files you edit are on **the computer running the server**, not the computer with the browser.
- The Open · Save · folder selection dialogs are drawn inside the app. They have a drive list, the parent folder, direct path entry and showing hidden files, and show each file's size and modification time. Saving to an existing file name asks whether to overwrite it.
- Files dragged in from the browser have no known path, so their **contents are read and opened as a new document** (up to 64 MB). You choose a location on the server computer when saving.
- There are no window buttons (minimize · maximize · close), no resize grip, and no **Show in file manager** or **Open with default app**.
- Menus open inside the page instead of as operating-system menus, and long menus are shown in several columns to fit the window.
- Settings · About · Keyboard shortcuts · Print preview open as movable windows inside the page instead of separate windows.
- Printing opens a new browser window and uses the browser's print function. You may need to allow pop-ups.
- The About window shows "Web browser" as where it is running.

## Where data files are

Settings and the session (open tabs, recent files, window layout, words added to the dictionary and so on) are stored in a single file, `session.json`.

| Item | Windows | macOS | Linux |
|---|---|---|---|
| Desktop app `session.json` | `%APPDATA%\My Editor\` | `~/Library/Application Support/My Editor/` | `~/.config/My Editor/` |
| Web version (changed with `--config`) | `%APPDATA%\My Editor\` | `~/Library/Application Support/My Editor/` | `~/.config/my-editor/` |

- Deleting `session.json` starts every setting and the session from the defaults.
- npm formatters installed from the app (Prettier · sql-formatter) go into `tools/node` inside the same settings folder.

## When an error occurs

When an error occurs, an error window with a title and description appears, and the **Details** box below it shows the error code · path · message · stack. The **Copy details** button puts all of this on the clipboard ("Error details copied to the clipboard."), so you can paste it as is when asking for help.

## Troubleshooting

**Characters look garbled when I open a file.**
The encoding was detected wrongly. Choose the right encoding (for Korean documents, usually 한국어 (EUC-KR / CP949)) in **Encoding › Reopen with encoding…**. To save as UTF-8 from now on, choose UTF-8 in the Encoding menu and save ([Language · encoding · line endings](07-language-encoding-eol.md)).

**A file only opens as hex.**
Its content has control bytes not used in text, so it was judged to be a binary file. Binary files open only in the hex view (read-only).

**It says "File too large" and does not open.**
Text files over 64 MB are not opened. Cut out the part you need with another tool and open that.

**An "Encoding warning" appears when saving.**
The document has characters its encoding cannot represent. If you save anyway, those characters become "?". Cancel, change the encoding to UTF-8, and save.

**The Format document button is disabled, or it says "indentation fixed only".**
The language's formatter is not installed, formatting is off, or the document is already formatted. Click the formatter name on the toolbar or choose and install a tool under Settings › Formatting. If it still says "not installed" after you installed it yourself, add it to PATH and press **Look again**, or restart the app ([Format and lint](12-format-and-lint.md)).

**The code check item in the status bar shows "—".**
There is no checker for that language, or it is not installed. Choose and install a tool under Settings › Checks.

**Programs such as vim · top look wrong in the terminal.**
The terminal works line by line, so programs that draw the whole screen themselves do not work well. Run such programs in the operating system's terminal ([Terminal and log](14-terminal-and-log.md)).

**The terminal output has no colours.**
Check that **Colour the output** is on under Settings › Terminal. Some programs connected through a pipe do not produce colours themselves.

**The start page appears / does not appear every time I start the program.**
Check **Always show the start page on launch** under Settings › Start page. Even when it is off, the start page appears if no document was restored. You can close the start page at any time with the **Start** button on the menu bar.

**My tabs from last time are not restored.**
Check that **Restore the previous session on start** is on under Settings › General › Session. Tabs of files that were deleted or moved in the meantime are not restored.

**Keys such as Ctrl+B · Ctrl+1 behave differently.**
In Markdown documents they become formatting shortcuts. Use Ctrl+Shift+B for the folder tree and Ctrl+Tab to switch tabs ([Keyboard shortcuts](18-shortcuts.md)).

**I want to return the settings to their initial state.**
Press **Reset to defaults** at the bottom of the Settings window. If problems remain, quit the program, delete `session.json`, and start it again.

**Development mode (`npm start`) does not start because of port 5189.**
A previous development server is still running. `npm start` runs `npm run free:port` first, but if that does not help, end the process using port 5189. The Vite server of development mode uses just one port, so only one `npm start` can run at a time. The installed program can be run any number of times.
