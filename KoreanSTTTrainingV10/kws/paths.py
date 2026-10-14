"""프로젝트 경로와 모델 파일 이름."""

from __future__ import annotations

import os
from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parents[1]

ONNX_FILENAME = "command_kws.onnx"
ONNX_INT8_FILENAME = "command_kws.int8.onnx"
CHECKPOINT_FILENAME = "model.pt"
FRONTEND_NPZ = "frontend.npz"
META_FILENAME = "meta.json"


def root() -> Path:
    override = os.environ.get("KWS_ROOT")
    if override:
        return Path(override)
    return SOURCE_ROOT


def is_saved_model(path: Path) -> bool:
    folder = Path(path)
    if not folder.is_dir() or not (folder / META_FILENAME).is_file():
        return False
    return (folder / ONNX_FILENAME).is_file() or (folder / CHECKPOINT_FILENAME).is_file()


def saved_model_dirs(project_root: Path) -> list[Path]:
    models = Path(project_root) / "models"
    if not models.is_dir():
        return []
    found = [path for path in models.iterdir() if is_saved_model(path)]
    found.sort(key=lambda path: (0 if path.name == "latest" else 1, path.name))
    return found
