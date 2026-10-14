"""Supertonic 2로 만든 합성 학습·평가 음원과 학습 데이터 출처."""

from __future__ import annotations

from pathlib import Path

from kws import paths

SYNTH_NAME = "합성"
RECORDING_NAME = "내 녹음"


def synth_root() -> Path:
    return paths.root() / "data" / "synth"


def train_dir() -> Path:
    return synth_root() / "train"


def test_dir() -> Path:
    return synth_root() / "test"


def practice_model_dir() -> Path:
    return paths.root() / "models" / "synth_eval"


def synth_count(label: str) -> int:
    folder = train_dir() / label
    return len(list(folder.glob("*.wav"))) if folder.is_dir() else 0


def available() -> bool:
    root = train_dir()
    return root.is_dir() and any(root.glob("*/*.wav"))


def missing_synth(labels: list[str]) -> list[str]:
    """합성 학습 음이 하나도 없는 클래스. 명령을 바꿨으면 다시 만들어야 한다."""
    return [label for label in labels if synth_count(label) == 0]


def training_sources(audio_root: Path, use_synth: bool, use_recordings: bool, recording_repeat: int = 1) -> list:
    from kws.train import DataSource

    sources = []
    if use_synth:
        sources.append(DataSource(train_dir(), SYNTH_NAME, 1))
    if use_recordings:
        sources.append(DataSource(Path(audio_root), RECORDING_NAME, max(1, int(recording_repeat))))
    if not sources:
        raise ValueError("학습 데이터를 하나 이상 고르세요.")
    return sources
