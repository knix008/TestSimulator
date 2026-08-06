# LangTrans Local TTS Service

This service is intentionally separate from the web/Electron app. The UI calls `POST /synthesize`, while this process decides which local TTS engine to run.

## Voice routing

- Korean output defaults to `ko-supertonic`, an external Supertonic-compatible command profile.
- English output defaults to `en-piper-onnx`, a separate Piper ONNX voice profile.
- Additional ONNX voices can be added as `piper_onnx` entries in `config.json`.

## Setup

```powershell
cd tts-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install piper-tts
Copy-Item config.example.json config.json
```

Edit `config.json` so `model_path` points to real Piper ONNX model files and the `ko-supertonic.command` array points to your Supertonic executable.

For downloadable Piper voices, set `model_url` on the voice entry. Piper voices usually also need a companion JSON config; set `config_url` to download it beside the ONNX file. The app's settings dialog can then download the model from the network into `model_path` and show progress while it downloads.

Install ffmpeg and keep it on `PATH` if the app should save generated speech as MP3. WAV export does not require ffmpeg.

## Run

```powershell
npm run tts:dev
```

The service listens on `http://localhost:8756`.

## Endpoints

- `GET /health` returns service status.
- `GET /voices` returns configured voice routes, including whether each local model is installed.
- `POST /models/{voice_id}/download` downloads a configured `model_url` into that voice's `model_path`, downloads `config_url` when present, and streams JSON progress lines.
- `POST /synthesize` accepts `{ "text": "Hello", "language": "en", "voice_id": "en-piper-onnx", "output_format": "wav" }` and returns `audio/wav`.
- Set `output_format` to `mp3` to return `audio/mpeg` after ffmpeg conversion.