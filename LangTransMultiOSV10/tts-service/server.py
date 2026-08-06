from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

SERVICE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("TTS_CONFIG", SERVICE_DIR / "config.json"))
EXAMPLE_CONFIG_PATH = SERVICE_DIR / "config.example.json"


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1)
    language: str
    voice_id: str | None = None
    output_format: Literal["wav", "mp3"] = "wav"


class VoiceInfo(BaseModel):
    id: str
    language: str
    display_name: str
    engine: str
    installed: bool
    downloadable: bool


app = FastAPI(title="LangTrans Local TTS", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_config() -> dict[str, Any]:
    path = CONFIG_PATH if CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    with path.open("r", encoding="utf-8") as config_file:
        return json.load(config_file)


def resolve_voice(config: dict[str, Any], voice_id: str | None, language: str) -> tuple[str, dict[str, Any]]:
    voices: dict[str, Any] = config.get("voices", {})
    selected_id = voice_id or config.get("default_voice_id")

    if selected_id in voices:
        return selected_id, voices[selected_id]

    for candidate_id, voice in voices.items():
        if voice.get("language") == language:
            return candidate_id, voice

    raise HTTPException(status_code=404, detail=f"No TTS voice configured for {language}")


def absolute_service_path(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else SERVICE_DIR / path)


def json_line(payload: dict[str, Any]) -> str:
    return f"{json.dumps(payload, ensure_ascii=False)}\n"


def voice_model_path(voice: dict[str, Any]) -> Path | None:
    model_path = voice.get("model_path")
    if not model_path:
        return None
    return Path(absolute_service_path(str(model_path)))


def voice_config_path(voice: dict[str, Any]) -> Path | None:
    config_path = voice.get("config_path")
    if config_path:
        return Path(absolute_service_path(str(config_path)))

    model_path = voice_model_path(voice)
    if not model_path:
        return None
    return model_path.with_suffix(f"{model_path.suffix}.json")


def stream_file_download(file_url: str, output_path: Path, label: str) -> Iterable[str]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_name(f"{output_path.name}.download")

    yield json_line({"status": f"starting {label}", "completed": 0, "total": 0})

    request = urllib.request.Request(file_url, headers={"User-Agent": "LangTransMultiOSV10/1.0"})
    with urllib.request.urlopen(request) as response:
        total_header = response.headers.get("Content-Length")
        total = int(total_header) if total_header and total_header.isdigit() else 0
        completed = 0

        with temp_path.open("wb") as model_file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                model_file.write(chunk)
                completed += len(chunk)
                yield json_line({"status": f"downloading {label}", "completed": completed, "total": total})

    temp_path.replace(output_path)
    yield json_line({"status": f"done {label}", "completed": output_path.stat().st_size, "total": output_path.stat().st_size})


def stream_model_download(voice: dict[str, Any], output_path: Path) -> Iterable[str]:
    downloads = [(str(voice.get("model_url", "")), output_path, "model")]
    config_url = str(voice.get("config_url", ""))
    config_path = voice_config_path(voice)
    if config_url and config_path:
        downloads.append((config_url, config_path, "config"))

    try:
        for file_url, file_path, label in downloads:
            yield from stream_file_download(file_url, file_path, label)
        yield json_line({"status": "done", "completed": 1, "total": 1})
    except (OSError, urllib.error.URLError, urllib.error.HTTPError) as error:
        yield json_line({"status": "error", "error": str(error), "completed": 0, "total": 0})


def render_command(command: list[str], text_file: Path, output_file: Path, voice: dict[str, Any]) -> list[str]:
    replacements = {
        "text_file": str(text_file),
        "output_file": str(output_file),
        "model_path": absolute_service_path(str(voice.get("model_path", ""))),
    }
    return [part.format(**replacements) for part in command]


def run_external(text: str, voice: dict[str, Any]) -> bytes:
    command = voice.get("command")
    if not isinstance(command, list) or not command:
        raise HTTPException(status_code=500, detail="External TTS command is not configured")

    with tempfile.TemporaryDirectory(prefix="langtrans-tts-") as temp_dir:
        temp_path = Path(temp_dir)
        text_file = temp_path / "input.txt"
        output_file = temp_path / "speech.wav"
        text_file.write_text(text, encoding="utf-8")

        completed = subprocess.run(
            render_command(command, text_file, output_file, voice),
            cwd=SERVICE_DIR,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise HTTPException(status_code=502, detail=completed.stderr.strip() or "External TTS failed")
        if not output_file.exists():
            raise HTTPException(status_code=502, detail="External TTS did not create a WAV file")

        return output_file.read_bytes()


def run_piper_onnx(text: str, voice: dict[str, Any]) -> bytes:
    model_path = absolute_service_path(str(voice.get("model_path", "")))
    if not Path(model_path).exists():
        raise HTTPException(status_code=404, detail=f"ONNX model not found: {model_path}")

    with tempfile.TemporaryDirectory(prefix="langtrans-tts-") as temp_dir:
        output_file = Path(temp_dir) / "speech.wav"
        command = [sys.executable, "-m", "piper", "--model", model_path, "--output_file", str(output_file)]
        if (config_path := voice_config_path(voice)) and config_path.exists():
            command.extend(["--config", str(config_path)])

        completed = subprocess.run(
            command,
            input=text,
            cwd=SERVICE_DIR,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise HTTPException(status_code=502, detail=completed.stderr.strip() or "Piper ONNX TTS failed")
        if not output_file.exists():
            raise HTTPException(status_code=502, detail="Piper did not create a WAV file")

        return output_file.read_bytes()


def convert_wav_to_mp3(wav_audio: bytes) -> bytes:
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=500, detail="MP3 export requires ffmpeg on PATH")

    with tempfile.TemporaryDirectory(prefix="langtrans-tts-") as temp_dir:
        temp_path = Path(temp_dir)
        wav_file = temp_path / "speech.wav"
        mp3_file = temp_path / "speech.mp3"
        wav_file.write_bytes(wav_audio)

        completed = subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_file), "-codec:a", "libmp3lame", "-qscale:a", "2", str(mp3_file)],
            cwd=SERVICE_DIR,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise HTTPException(status_code=502, detail=completed.stderr.strip() or "MP3 conversion failed")
        if not mp3_file.exists():
            raise HTTPException(status_code=502, detail="ffmpeg did not create an MP3 file")

        return mp3_file.read_bytes()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/voices")
def voices() -> list[VoiceInfo]:
    config = load_config()
    return [
        VoiceInfo(
            id=voice_id,
            language=str(voice.get("language", "")),
            display_name=str(voice.get("display_name", voice_id)),
            engine=str(voice.get("engine", "")),
            installed=(
                model_path.exists()
                and (config_path.exists() if voice.get("config_url") and (config_path := voice_config_path(voice)) else True)
                if (model_path := voice_model_path(voice))
                else True
            ),
            downloadable=bool(voice.get("model_url")),
        )
        for voice_id, voice in config.get("voices", {}).items()
    ]


@app.post("/models/{voice_id}/download")
def download_model(voice_id: str) -> StreamingResponse:
    config = load_config()
    voice = config.get("voices", {}).get(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail=f"Unknown TTS voice: {voice_id}")

    output_path = voice_model_path(voice)
    model_url = str(voice.get("model_url", ""))
    if output_path is None:
        raise HTTPException(status_code=400, detail=f"Voice does not use a downloadable local model: {voice_id}")
    if output_path.exists():
        return StreamingResponse(iter([json_line({"status": "already installed", "completed": 1, "total": 1})]), media_type="application/x-ndjson")
    if not model_url:
        raise HTTPException(status_code=400, detail=f"No model_url configured for TTS voice: {voice_id}")

    return StreamingResponse(stream_model_download(voice, output_path), media_type="application/x-ndjson")


@app.post("/synthesize")
def synthesize(request: SynthesisRequest) -> Response:
    config = load_config()
    _, voice = resolve_voice(config, request.voice_id, request.language)
    engine: Literal["external", "piper_onnx"] | str = str(voice.get("engine", ""))

    if engine == "external":
        wav_audio = run_external(request.text, voice)
    elif engine == "piper_onnx":
        wav_audio = run_piper_onnx(request.text, voice)
    else:
        raise HTTPException(status_code=500, detail=f"Unsupported TTS engine: {engine}")

    if request.output_format == "mp3":
        return Response(content=convert_wav_to_mp3(wav_audio), media_type="audio/mpeg")

    return Response(content=wav_audio, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8756)