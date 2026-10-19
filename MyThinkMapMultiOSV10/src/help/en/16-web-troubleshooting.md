# Web version and troubleshooting

## Web version

The same program runs in a browser. In the project folder run

```
npm run web
```

It builds the UI, starts a server on `http://127.0.0.1:5202` and opens the browser. The web version opens and saves **files on the computer the server runs on**, so the file dialog is the app's own, not the browser's.

To use it from other computers, start it with a token:

```
node server/server.js --host 0.0.0.0 --port 8080 --token secret
```

and open `http://server:8080/?token=secret`. Without a token anyone who reaches the server can read and write its files.

Differences in the web version:

- Settings, About and Keyboard shortcuts open as dialogs in the page; Help opens as a browser pop-up.
- Printing uses the browser's print dialog.
- Files dropped on the browser window are read and opened as new maps (they have no path, so saving asks for a name).

## Troubleshooting

**The map is not on screen.** Press `Ctrl+0` (fit map). Check the status bar for **Hide the rest** filtering or a branch view.

**Text is cut off.** Raise the topic's **max width** or break the line (`Shift+Enter`).

**I closed without saving.** With session restore on, unsaved maps come back on the next start.

**A file from another program looks different.** Importing brings over what this app also has (XMind summaries and partial boundaries are left out, for example). The original file is never changed.

**Printing does nothing (desktop).** Printing needs Edge or Chrome. Without one, export a PDF and print that.

**An error dialog appeared.** **Copy details** and report it. If the window is broken, **Reload** brings the open maps back from the session.
