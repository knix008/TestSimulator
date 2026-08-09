# Users Guide

## Run the App

### From source (development machine)

```bash
npm start
```

Launches the local release executable from `src-tauri/target/release`. If sources are newer than that binary, it rebuilds with the **same desktop build** used for installers (`build:win` / `build:mac` / `build:linux`), then launches. On Windows it also stops any tray-hidden instance first.

| OS | Manual build (same as npm start rebuild) |
| --- | --- |
| Windows | `npm run build:win` |
| macOS | `npm run build:mac` |
| Linux | `npm run build:linux` |

Hot-reload development:

```bash
npm run desktop:dev
```

### Installed app

After installing from the NSIS/MSI (or macOS/Linux package), start **My Music Station** from the Start Menu / Applications. A system tray icon appears while the app runs.

`npm start` and the root installers share one release binary. Updating the already-installed Program Files / Applications copy still requires reinstalling from the newly built setup package.

## Toolbar

Hover a button to see its tooltip.

| Control | Action |
| --- | --- |
| Open folder | Choose a music folder (recursive scan for audio files). |
| Reopen | Reload the last remembered music folder. |
| Add files | Add audio files via the native file dialog (paths are kept for playlist save). |
| Save (플레이리스트 저장) | Save the current playlist as a `.mplist` file. |
| Convert (형식 변환 저장) | Convert the current track to MP3/WAV/FLAC/OGG/M4A and save it. Requires ffmpeg. |
| Open | Open a `.mplist` playlist and/or audio files. |
| Language | Switch between Korean and English. |
| Settings | Open app settings (language, theme, system tray, playback). |
| About | Show version and copyright. |
| Theme | Pick a built-in or custom theme. |
| Minimize | Minimize the window. |
| Close | Hide to tray when system tray is enabled; otherwise quit the app. |

## Status Bar

The bottom status bar shows:

- Playback state (Ready / Playing / Paused / Stopped) or temporary feedback (save, convert, theme, errors)
- Current track title
- Theme name, tray on/off, wallpaper on/off, and volume percent

Success/info messages clear after a few seconds; errors stay until the next status update.

When an error occurs, a popup shows the full details. You can select the text or use **Copy details**. Click the red status-bar message to reopen the error dialog.

## Playback

- Use Play / Pause / Stop and Previous / Next on the transport bar.
- Drag the timeline to seek; use the volume slider on the side panel.
- Click a track in the playlist to play it.
- Spectrum bars show frequency energy: **blue on the left → red on the right**.
- Album art and tags appear when metadata is available.

## Music Folder Memory

Opening a folder stores its path locally. **Reopen** loads that directory again without picking it.

## Playlists (`.mplist`)

- **Save**: writes JSON playlist data. Local tracks need real filesystem paths (use Open folder / Add files / Open). Remote tracks save their URLs.
- **Open**: restores local tracks from paths and remote tracks from URLs.
- On Windows, `.mplist` is registered with the installer so it can be associated with My Music Station.

## Remote URLs

Paste an HTTP(S) audio URL in the side panel and add it. When possible the app fetches it into a blob for reliable spectrum display; the original URL is what gets saved in the playlist.

## Themes

Open the theme menu to select Dark, Modern, Classic, Fancy, or a custom theme. Enter a name, pick an accent color, and add a custom theme. Built-in themes cannot be deleted.

Theme files are plain `.json`. From the theme menu:

- **Save theme file**: export the current theme colors to a `.json` file
- **Open theme file**: import a theme `.json` file as a custom theme and apply it

## Settings

Open **Settings** from the toolbar gear icon. Options are saved locally and apply to both `npm start` and the installed app:

- **General**: language, theme
- **Window / System**: use system tray (on by default)
- **Background**: wallpaper image for the whole app, dim level
- **Playback**: remember volume, show spectrum, open last folder on start, volume

## System Tray

- When **Use system tray** is enabled, closing the window **hides** the app; it keeps running in the tray.
- When the option is disabled, Close **quits** the app and the tray icon is hidden.
- **Left-click** the tray icon to show the window and open **Settings**.
- Tray menu: **Show My Music Station** / **Settings** / **Quit** (Quit fully exits the app).

## Install / Reinstall (Windows)

`npm run build:win` (and a stale `npm start`) produce the same release binary plus NSIS/MSI copies in the project root. The NSIS installer stops any running instance and removes a previous installation before installing the new version.
