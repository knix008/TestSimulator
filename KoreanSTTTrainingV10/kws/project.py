"""명령 목록과 녹음 폴더."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from kws import paths
from kws.audio import clamp_gain

SILENCE_LABEL = "무음"
MAX_COMMANDS = 10
MIN_CLIPS = 4
RECOMMENDED_CLIPS = 15
DEFAULT_COMMANDS = ["출근", "퇴근", "경비", "해제"]
RECORDING_REPEAT = 3
FINETUNE_EPOCHS = 15
FINETUNE_LR = 5e-4
_INVALID_CHARS = set('\\/:*?"<>|')


def validate_command(name: str, existing: list[str]) -> str:
    name = name.strip()
    if not name:
        raise ValueError("명령어를 입력하세요.")
    if len(name) > 20:
        raise ValueError("명령어는 20자 이하로 입력하세요.")
    if any(char in name for char in _INVALID_CHARS) or "\n" in name or "\r" in name:
        raise ValueError("명령어에 사용할 수 없는 문자가 있습니다.")
    if name == SILENCE_LABEL:
        raise ValueError("'무음'은 명령이 아닌 소리를 거절하려고 자동으로 넣습니다.")
    if name in existing:
        raise ValueError("이미 있는 명령어입니다.")
    if len(existing) >= MAX_COMMANDS:
        raise ValueError("명령어는 10개까지 넣을 수 있습니다.")
    return name


def validate_model_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise ValueError("저장 이름을 입력하세요.")
    if len(name) > 40 or name in (".", "..") or any(char in name for char in _INVALID_CHARS):
        raise ValueError("저장 이름에 사용할 수 없는 문자가 있습니다.")
    return name


class Project:
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root) if root is not None else paths.root()
        self.data = self.root / "data"
        self.audio = self.data / "audio"
        self.model_dir = self.root / "models" / "latest"
        self.config_path = self.data / "commands.json"
        self.commands: list[str] = list(DEFAULT_COMMANDS)
        self.input_device = "기본 장치"
        self.input_gain = 1.0
        self.epochs = 40
        self.batch_size = 16
        self.learning_rate = 0.002
        self.threshold = 0.70
        self.load()

    def labels(self) -> list[str]:
        return [*self.commands, SILENCE_LABEL]

    def load(self) -> None:
        if self.config_path.exists():
            try:
                data = json.loads(self.config_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                data = {}
            self.commands = [str(item) for item in data.get("commands", DEFAULT_COMMANDS)]
            self.input_device = str(data.get("input_device", "기본 장치"))
            self.input_gain = clamp_gain(data.get("input_gain", 1.0))
            self.epochs = _clamp_int(data.get("epochs", 40), 1, 200, 40)
            self.batch_size = _clamp_int(data.get("batch_size", 16), 1, 64, 16)
            try:
                learning_rate = float(data.get("learning_rate", 0.002))
            except (TypeError, ValueError):
                learning_rate = 0.002
            self.learning_rate = learning_rate if 0 < learning_rate < 1 else 0.002
            try:
                threshold = float(data.get("threshold", 0.70))
            except (TypeError, ValueError):
                threshold = 0.70
            self.threshold = min(0.95, max(0.40, threshold))
        self._sanitize()
        self.audio.mkdir(parents=True, exist_ok=True)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        for label in self.labels():
            (self.audio / label).mkdir(parents=True, exist_ok=True)
        self.save()

    def save(self) -> None:
        self.data.mkdir(parents=True, exist_ok=True)
        payload = {
            "commands": self.commands,
            "input_device": self.input_device,
            "input_gain": self.input_gain,
            "epochs": self.epochs,
            "batch_size": self.batch_size,
            "learning_rate": self.learning_rate,
            "threshold": self.threshold,
        }
        self.config_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def add_command(self, name: str) -> str:
        name = validate_command(name, self.commands)
        self.commands.append(name)
        (self.audio / name).mkdir(parents=True, exist_ok=True)
        self.save()
        return name

    def remove_command(self, name: str) -> None:
        if name == SILENCE_LABEL or name not in self.commands:
            raise ValueError("지울 수 없는 명령입니다.")
        self.commands.remove(name)
        folder = self.audio / name
        if folder.exists():
            shutil.rmtree(folder)
        self.save()

    def count(self, label: str) -> int:
        folder = self.audio / label
        if not folder.is_dir():
            return 0
        return sum(1 for path in folder.glob("*.wav") if path.is_file())

    def list_wavs(self, label: str) -> list[Path]:
        folder = self.audio / label
        if not folder.is_dir():
            return []
        return sorted(path for path in folder.glob("*.wav") if path.is_file())

    def new_wav_path(self, label: str) -> Path:
        folder = self.audio / label
        folder.mkdir(parents=True, exist_ok=True)
        index = 1
        while True:
            path = folder / f"{index:04d}.wav"
            if not path.exists():
                return path
            index += 1

    def _sanitize(self) -> None:
        cleaned: list[str] = []
        for raw in self.commands:
            name = str(raw).strip()
            if not name or name == SILENCE_LABEL or name in cleaned:
                continue
            if any(char in name for char in _INVALID_CHARS):
                continue
            cleaned.append(name[:20])
            if len(cleaned) >= MAX_COMMANDS:
                break
        self.commands = cleaned or list(DEFAULT_COMMANDS)


def _clamp_int(value: object, low: int, high: int, default: int) -> int:
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return min(high, max(low, number))
