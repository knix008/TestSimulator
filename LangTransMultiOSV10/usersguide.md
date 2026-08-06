# LangTrans V1.0.0 User Guide

## What This App Does

LangTrans V1.0.0 translates text with a local Ollama model and can read translated text aloud through a separate local TTS service. It supports web use and an Electron desktop version for Windows, macOS, and Linux.

## Before You Start

Install and run these local services:

- Ollama for translation.
- Python TTS service for speech playback and WAV/MP3 export.
- `ffmpeg` on `PATH` if you want MP3 export.

## Start Ollama

```powershell
ollama pull llama3.1
ollama serve
```

In the app toolbar settings, keep the Ollama URL as `http://localhost:11434` unless you run Ollama elsewhere. Set the model field to the model you installed.

## Start The TTS Service

```powershell
cd tts-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install piper-tts
Copy-Item config.example.json config.json
```

Edit `config.json` before using speech:

- Set `ko-supertonic.command` to your Supertonic-compatible Korean TTS command.
- Set `en-piper-onnx.model_path` to an English Piper ONNX model.
- Add or edit other voices as needed.

Then run from the project root:

```powershell
npm run tts:dev
```

The default TTS URL is `http://localhost:8756`.

## Start The App

For web development:

```powershell
npm run start:web
```

For the desktop app:

```powershell
npm start
```

`npm start` launches the Electron desktop application. Use `npm run start:web` only when you want the web development server in a browser.

For the local TTS service:

```powershell
npm run start:tts
```

## Translate Text

1. Choose the input language. Use auto detect if you are unsure.
2. Choose the output language.
3. Enter text in the input pane.
4. Click the translate toolbar button.
5. The translated result appears in the output pane.

## Input Methods

You can enter source text in several ways:

- Type directly in the input pane.
- Use normal copy and paste.
- Click the text file toolbar button and choose a `.txt`, `.md`, `.csv`, `.json`, or other text file.
- Drag and drop a text file onto the input pane.
- Drop plain selected text onto the input pane.

## Save Or Copy Translation Output

After translation:

- Click the copy output toolbar button to copy the result to the clipboard.
- Click the save output toolbar button to download the result as a `.txt` file.

## Speech Playback

1. Translate text or type/edit text in the output pane.
2. Click the read aloud toolbar button.
3. The app asks the local TTS service for WAV audio.
4. A waveform is drawn below the translation area.
5. While audio plays, active waveform bars show the current playback position.
6. Click a waveform bar to seek to that position.

## Save Speech As Audio

- Click `WAV 저장` / `Save WAV` to save speech as a WAV file.
- Click `MP3 저장` / `Save MP3` to save speech as an MP3 file.

MP3 export requires `ffmpeg` on `PATH`. If it is missing, the app shows a detailed error dialog.

## Toolbar Buttons

Every toolbar button has a tooltip. The toolbar includes actions for:

- Open text file.
- Paste text.
- Translate.
- Read aloud.
- Save WAV.
- Save MP3.
- Copy output.
- Save output text.
- Swap languages.
- Change interface language.
- Toggle dark/light theme.
- Show program information.
- Minimize, maximize/restore, and close the frameless desktop window.

## Program Information

Click the `Info` / `정보` button on the right side of the toolbar to view:

- Program name.
- Version.
- Description.
- Author: SHKWON (knix008@naver.com).

## Status Bar

The bottom status bar shows:

- Current application status.
- Current TTS voice route.
- Input/output character counts.
- Current Ollama model.

## Error Dialogs

When translation, TTS, clipboard, file, or MP3 conversion fails, the app opens a detailed error dialog. Use the copy button in the dialog to copy the technical details for troubleshooting.

## Build An Installer

Build the web app only:

```powershell
npm run build:web
```

Build desktop packages for a specific operating system:

```powershell
npm run build:windows
npm run build:macos
npm run build:linux
```

Installer output is written to `release/`. On Windows, the installer is configured to let users choose the installation directory and shortcut options for the desktop and Start Menu.

For the current OS default target, use:

```powershell
npm run build:desktop
```

If the packaging command stalls while unpacking Electron, retry after clearing Electron Builder's cache or use a clean build machine with network access.