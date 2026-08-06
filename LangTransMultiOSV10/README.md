# LangTrans V1.0.0

LangTrans V1.0.0 is a local-first translation app for Web, Linux, macOS, and Windows. The UI uses Ollama for translation and calls a separate local TTS service for speech synthesis.

## Documents

- [architecture.md](architecture.md) describes the application structure, data flow, packaging, and local service boundaries.
- [usersguide.md](usersguide.md) explains how to install, configure, translate, load files, save output, and use TTS playback/export.

## Features

- Web app built with Vite, React, and TypeScript.
- Electron wrapper for Linux, macOS, and Windows packaging.
- Input and output language selectors.
- Text input by typing, copy and paste, text file open, or drag and drop.
- Output text copying and `.txt` saving.
- Ollama model and endpoint settings in the UI.
- WAV and MP3 voice export.
- Audio waveform display with playback progress while speech is playing.
- Dark and light themes.
- English and Korean interface text.
- Separate local TTS service with language-specific routing.
- Korean output can use a Supertonic-compatible external runner.
- English output can use a separate Piper ONNX model.
- Speech output can be played or saved as WAV or MP3.
- Frameless desktop window with toolbar buttons and tooltips.
- Blue modern app icon in `src/assets` for the app window and installer.

## Requirements

- Node.js and npm.
- Ollama running locally, usually at `http://localhost:11434`.
- Python 3.11+ for the local TTS service.
- Piper ONNX voice files or a Supertonic-compatible Korean TTS command.
- ffmpeg on `PATH` when saving speech as MP3.

## Web development

```powershell
npm install
npm run start:web
```

`npm run start:web` opens the web development server. You can also use the explicit command:

```powershell
npm run dev
```

Open the Vite URL shown in the terminal.

## Build scripts

Use these scripts when you want a specific target:

```powershell
npm run build:web      # Web build only, written to dist/
npm run build:windows  # Windows NSIS installer, written to release/
npm run build:macos    # macOS DMG, written to release/
npm run build:linux    # Linux AppImage, written to release/
npm run build:desktop  # Electron Builder default target for the current OS
npm run build:all      # Requests Windows, macOS, and Linux targets
```

The legacy `npm run build` command is kept as an alias for `npm run build:web`. The legacy `npm run dist` command is kept as an alias for `npm run build:desktop`.

## Desktop development

```powershell
npm start
```

`npm start` starts the Vite dev server and opens the Windows/Electron desktop application. The explicit alias is `npm run start:desktop`.

## Build desktop installers

```powershell
npm run build:windows
npm run build:macos
npm run build:linux
```

Electron Builder writes packages to `release/`. The configured targets are NSIS for Windows, DMG for macOS, and AppImage for Linux.

The Windows installer is configured as an assisted NSIS installer. During installation, users can choose the installation folder and shortcut options for the desktop and Start Menu.

Note: packaging may require Electron Builder cache/download access and a working Windows signing/build environment. If `npm run dist` stalls while unpacking Electron, clear the Electron Builder cache or retry on a clean network-enabled build machine.

## Local TTS service

```powershell
cd tts-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install piper-tts
Copy-Item config.example.json config.json
```

Edit `tts-service/config.json`:

- Set `ko-supertonic.command` to your Supertonic Korean TTS executable and arguments.
- Set `en-piper-onnx.model_path` to an English Piper ONNX model.
- Optionally set `ko-piper-onnx.model_path` to a Korean Piper ONNX model.
- Install ffmpeg and keep it on `PATH` if MP3 export is needed.

Run the service from the project root:

```powershell
npm run start:tts
```

The app expects the service at `http://localhost:8756` by default. The toolbar calls this service for playback and for WAV/MP3 file downloads.

## Ollama

Start Ollama and pull the model you want to use:

```powershell
ollama pull llama3.1
ollama serve
```

In the app, set the Ollama model field to the installed model name.

## Validation

```powershell
npm run lint
npm run build:web
python -m py_compile tts-service\server.py
```
