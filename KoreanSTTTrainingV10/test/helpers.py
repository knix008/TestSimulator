"""테스트에서 같이 쓰는 합성 음원과 작은 학습 모델."""

from __future__ import annotations

import atexit
import contextlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from kws.audio import save_wav
from kws.paths import SOURCE_ROOT
from kws.project import DEFAULT_COMMANDS, SILENCE_LABEL

LABELS = [*DEFAULT_COMMANDS, SILENCE_LABEL]
FREQUENCIES = {"출근": 400, "퇴근": 800, "경비": 1400, "해제": 2200}
CLIPS_PER_LABEL = 12

_shared: dict[str, object] = {}


def tone(label: str, rng: np.random.Generator, sample_rate: int = 16000) -> np.ndarray:
    """명령마다 다른 높이의 짧은 음. 무음은 아주 작은 잡음."""
    if label == SILENCE_LABEL:
        return rng.normal(0.0, 0.002, sample_rate).astype(np.float32)
    wav = np.zeros(sample_rate, dtype=np.float32)
    start = int(rng.integers(1500, 4500))
    duration = int(rng.integers(4500, 8000))
    time_axis = np.arange(duration, dtype=np.float32) / sample_rate
    f0 = FREQUENCIES[label] + float(rng.uniform(-25, 25))
    envelope = np.hanning(duration).astype(np.float32)
    signal = envelope * np.sin(2 * np.pi * f0 * time_axis)
    signal += 0.25 * envelope * np.sin(2 * np.pi * f0 * 2 * time_axis)
    wav[start : start + duration] = (0.35 * signal).astype(np.float32)
    wav += rng.normal(0.0, 0.004, sample_rate).astype(np.float32)
    return wav


def write_tone_dataset(audio_root: Path, count: int = CLIPS_PER_LABEL, seed: int = 7) -> None:
    rng = np.random.default_rng(seed)
    for label in LABELS:
        for index in range(count):
            save_wav(audio_root / label / f"{index + 1:04d}.wav", tone(label, rng))


def temp_dir() -> Path:
    path = Path(tempfile.mkdtemp(prefix="kws-test-"))
    atexit.register(shutil.rmtree, path, True)
    return path


def trained_model() -> tuple[Path, Path]:
    """5클래스 음 모델을 한 번만 학습해 (오디오 폴더, 모델 폴더)를 돌려준다."""
    if "model" not in _shared:
        from kws.train import TrainOptions, train_project

        root = temp_dir()
        audio = root / "audio"
        write_tone_dataset(audio)
        result = train_project(
            audio,
            LABELS,
            root / "model",
            TrainOptions(make_int8=True, seed=3),
        )
        if not result.export_ok:
            raise RuntimeError(result.export_log)
        _shared["audio"] = audio
        _shared["model"] = result.model_dir
        _shared["result"] = result
    return _shared["audio"], _shared["model"]  # type: ignore[return-value]


def train_result():
    trained_model()
    return _shared["result"]


def project_with_model(root: Path, model_name: str = "latest") -> Path:
    """KWS_ROOT로 쓸 폴더에 학습 결과와 녹음을 복사한다."""
    audio, model = trained_model()
    shutil.copytree(audio, root / "data" / "audio", dirs_exist_ok=True)
    shutil.copytree(model, root / "models" / model_name, dirs_exist_ok=True)
    return root


@contextlib.contextmanager
def kws_root(path: Path):
    old = os.environ.get("KWS_ROOT")
    os.environ["KWS_ROOT"] = str(path)
    try:
        yield path
    finally:
        if old is None:
            os.environ.pop("KWS_ROOT", None)
        else:
            os.environ["KWS_ROOT"] = old


def run_module(module: str, *args: str, root: Path | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if root is not None:
        env["KWS_ROOT"] = str(root)
    return subprocess.run(
        [sys.executable, "-m", module, *args],
        cwd=SOURCE_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


def parse_keys(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def korean_voice_available() -> bool:
    if sys.platform != "win32":
        return False
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "if ($s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ko-KR' }) { exit 0 } else { exit 1 }"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            timeout=60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        return False
    return completed.returncode == 0


def find_gpp() -> Path | None:
    found = shutil.which("g++")
    if found:
        return Path(found)
    fallback = Path(r"C:\Msys64\ucrt64\bin\g++.exe")
    return fallback if fallback.exists() else None
