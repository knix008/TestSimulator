# Users Guide — My Music Station V1.0.0

## Run the App

### From source (development machine)

```bash
npm start
```

Launches the release executable from `src-tauri/target/release`. If sources are newer, it recompiles just the executable (`npm run build:bin`, no installer is produced), then launches. On Windows it stops a running instance first.

Launch without rebuilding:

```bash
npm start -- --no-build
```

Build prerequisites are downloaded on demand (the project ships without `node_modules`, `src-tauri/target` or a Rust toolchain): missing `node_modules` → `npm install`; missing Rust → rustup; missing ffmpeg / yt-dlp → local copy or download. `npm run setup` runs just that step; `npm run clean` deletes build output (`--all` also drops `node_modules` and the downloaded binaries).

| OS | Installer build |
| --- | --- |
| Windows | `npm run build:win` → `My Music Station V1.0.0_*_x64-setup.exe` |
| macOS | `npm run build:mac` |
| Linux | `npm run build:linux` |

Hot-reload development:

```bash
npm run desktop:dev
```

### Installed app

Install from the NSIS setup (or macOS/Linux package), then start **My Music Station V1.0.0** from the Start Menu / Applications.

`npm start` and the root installer share one release binary. Updating Program Files still requires reinstalling from a new setup package.

## Toolbar

Hover a button for its tooltip.

| Control | Action |
| --- | --- |
| Open folder | Choose a music folder (recursive audio scan). |
| Reopen | Reload the last remembered music folder. |
| Add | Add audio files and/or `.mplist` playlists. |
| Save | Save the current playlist as `.mplist`. |
| Convert | Convert the **current local track** (format + quality). Link tracks cannot be converted. |
| Open link | Play a media or audio URL (stream or extract to cache). **Does not save a file.** |
| Spectrum flip / style | Flip color direction; cycle spectrum display style. |
| Language | Korean / English. |
| Settings | Opens the settings window (sits just left of Minimize; also in compact mode, left of Close). |
| About | Version and copyright. |
| Theme | Steps to the next theme (16 built-in + custom, in order). Pick by colour in Settings. |
| Collapse list | Show/hide the side playlist panel. |
| Compact mode | Shrink to **340×180** (app icon stays on the title bar). |
| Minimize / Close | Minimize, or hide to tray / quit (per settings). |

## Status Bar

Shows playback state or temporary feedback (save, extract, theme, errors), plus theme / tray / wallpaper / volume hints.

Errors open a detail dialog (copyable). Click a red status message to reopen it.

## Dialog Windows

Settings, Convert, Open link, About, alerts, errors and the folder-loading progress each open in their **own window** above the player (the player is dimmed and inert while one is open; click it to bring the dialog back to front). Each dialog opens centred over the player (or the screen when the player is hidden) and grows to fit its content — no scrollbars. Drag a dialog by its header; **Esc**, the header **X**, or the Close button dismisses it. Closing or hiding the main window closes every open dialog window with it.

## Playback

- Play / Pause / Stop and Previous / Next on the transport bar.
- Seek with the timeline; volume is **0–100% in 1% steps** (mute toggle next to the slider).
- Click a playlist row to play; **right-click** for context actions: **Play**, **Remove**.
- Removing the track that is currently playing stops it at once and continues with the next track. If playback was paused/stopped, the next track is only selected.
- Spectrum shows frequency energy (style and color direction are configurable).
- Album art and tags appear when metadata is available. If a file has no cover, the player and playlist show the **format icon** for that extension (MP3, WAV, FLAC, …).

## Compact Mode

- Smaller always-on-top-friendly window with spectrum, transport, a **short seek** bar, and a **wider volume** slider (1% steps).
- Program icon appears on the left of the mini title bar; the current track shows a small cover / format icon.
- Restore with the maximize control; Close follows tray settings.

## Music Folder Memory

Opening a folder stores its path. **Reopen** loads it again. Optional: open last folder on start (Settings).

## Playlists (`.mplist`)

- **Save**: local tracks need real paths; remote/URL tracks store their URLs.
- **Open**: restores locals from paths; remotes restore from their cached download when available, otherwise as stream or pending extract (extract runs when you play).
- The working playlist (local files **and** links) is also auto-saved for the next launch — to `localStorage` and to `session-playlist.json` in the app's config folder, so it survives quitting from the tray.
- On Windows, `.mplist` is registered by the installer.

## Remote / Media URLs

Use the toolbar **Open link** button, or in the side panel paste a link and press Add. Both **play** the URL (and add it to the playlist). They do not download a file you pick in a save dialog.

| Link type | What happens |
| --- | --- |
| Direct audio (e.g. `.mp3`, `audio/*`) | Streams for playback |
| Video / media page (YouTube, Instagram, …) | Extracts audio only into the app cache, then plays |

While resolving/extracting, the status bar shows progress.

### Link tracks across restarts

- Link tracks stay in the playlist after you quit and relaunch.
- Extracted audio is kept in the app cache (`remote-audio/<url-hash>.m4a`). On relaunch a cached track plays immediately, without downloading again.
- If the cache file is gone (cleaned, moved), the track is listed as pending and is **downloaded again the first time you play it**.
- Removing a link track from the list also deletes its cached file.

## Convert (local tracks)

Select a **local** track → Convert → choose format → save. Requires bundled or PATH **ffmpeg**. URL/link tracks cannot be converted from this dialog.

## Themes & Background

- 16 built-in themes: Dark, Modern, Classic, Fancy, Midnight, Ocean, Forest, Sunset, Rose, Lavender, Sand, Arctic, Mono, Neon, Coffee, Slate — plus custom themes (add / delete / export / import JSON).
- Toolbar **Theme** button: applies the next theme in the list each click (wraps around).
- Settings → Theme: colour tiles preview each theme's background, panel, text and accent; click one to apply it.
- Settings → Background: built-in or custom image, dim, panel opacity.

## Settings

- **Theme**: colour-tile picker + custom theme tools  
- **Window / System**: use system tray  
- **Background**: wallpaper, dim, panel opacity  
- **Playback**: remember volume, spectrum, reopen last folder  

## System Tray

- Tray **on**: Close hides the window; app keeps running.
- Tray **off**: Close quits; tray icon hidden.
- Left-click tray → show window and open Settings.
- Menu: Show / Settings / Quit.

## Windows Installer Notes

- Stops running instances and removes previous installs before copying files.
- Registers `.mplist` (playlist icon) and appears under Windows media / Open with for common audio types.
- Each audio extension uses its **own Explorer icon** (MP3, WAV, FLAC, …) rather than one generic file mark.
- Asks whether to set My Music Station as the **default audio player** (Yes / No). Silent (`/S`) installs choose Yes.
- Supported association types include MP3, FLAC, WAV, OGG, AAC, M4A, WebM, OPUS, WMA, AIFF.
- Opening an associated file launches (or focuses) the app and loads that file.
- After installing a new setup, Explorer icons update with that install; `npm start` does not refresh Program Files associations.

## External Tools

Bundled next to the app when possible:

- **ffmpeg** — convert / post-process  
- **yt-dlp** — extract audio from media URLs  

If missing, the app falls back to the same tools on your PATH when available.
