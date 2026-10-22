#!/usr/bin/env python3
"""
rembg_worker.py — AI background removal for Image Viewer (Electron).

Usage:
  python rembg_worker.py <model> <input_path> <output_path>

Models:
  rembg1 | u2net              → u2net (classic rembg)
  rembg2 | bria-rmbg | rmbg2  → bria-rmbg / RMBG-2.0 (prefers local rembg2.onnx)
  rembg3 | isnet-general-use  → isnet-general-use

Progress lines (stderr):
  PROGRESS <percent> <message>
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


MODEL_MAP = {
    "rembg1": "u2net",
    "rembg": "u2net",
    "u2net": "u2net",
    "rembg2": "bria-rmbg",
    "rmbg2": "bria-rmbg",
    "bria-rmbg": "bria-rmbg",
    "rembg3": "isnet-general-use",
    "isnet": "isnet-general-use",
    "isnet-general-use": "isnet-general-use",
}

# Preferred filenames per session (first match wins). rembg2.onnx is the
# Image Rembg / HuggingFace RMBG-2.0 export (~500MB); official rembg
# bria-rmbg.onnx is ~1GB — either works with BriaRmBgSession preprocess.
MODEL_ALIASES = {
    "u2net": ["u2net.onnx"],
    "bria-rmbg": ["rembg2.onnx", "bria-rmbg.onnx", "bria-rmbg-2.0.onnx"],
    "isnet-general-use": ["isnet-general-use.onnx", "isnet.onnx"],
}


def _progress(pct: int, message: str = "") -> None:
    pct = max(0, min(100, int(pct)))
    # Stable machine-readable line for Electron to parse
    print(f"PROGRESS {pct} {message}", file=sys.stderr, flush=True)


def _u2net_home() -> Path:
    env = os.environ.get("U2NET_HOME")
    if env:
        p = Path(env)
    else:
        p = Path.home() / ".u2net"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _candidate_dirs() -> list[Path]:
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    return [
        local / "ImageRembgWinV10" / "models",
        Path(__file__).resolve().parent.parent / "models",
        local / "Programs" / "Image Rembg" / "Assets" / "Models",
        _u2net_home(),
    ]


def _find_local_model(session_name: str) -> Path | None:
    names = MODEL_ALIASES.get(session_name, [f"{session_name}.onnx"])
    for directory in _candidate_dirs():
        if not directory or not directory.is_dir():
            continue
        for name in names:
            src = directory / name
            if src.is_file() and src.stat().st_size > 1_000_000:
                return src
    return None


def _session_class(session_name: str):
    from rembg.sessions.bria_rmbg import BriaRmBgSession
    from rembg.sessions.dis_general_use import DisSession
    from rembg.sessions.u2net import U2netSession

    return {
        "u2net": U2netSession,
        "bria-rmbg": BriaRmBgSession,
        "isnet-general-use": DisSession,
    }[session_name]


def _create_session(session_name: str, model_path: Path | None):
    """Build a rembg session, loading a local ONNX file when available (no re-download)."""
    import onnxruntime as ort

    if model_path is None:
        from rembg import new_session

        return new_session(session_name)

    cls = _session_class(session_name)
    path_str = str(model_path.resolve())

    class LocalSession(cls):  # type: ignore[misc, valid-type]
        @classmethod
        def download_models(cls, *args, **kwargs):
            return path_str

    sess_opts = ort.SessionOptions()
    # HuggingFace rembg2.onnx can fail with full graph optimizations
    if session_name == "bria-rmbg" and model_path.name.lower() == "rembg2.onnx":
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC

    print(f"[rembg] loading local model: {path_str}", file=sys.stderr)
    return LocalSession(session_name, sess_opts)


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "Usage: rembg_worker.py <model> <input_path> <output_path>",
            file=sys.stderr,
        )
        return 2

    model_key = sys.argv[1].strip().lower()
    input_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    if not input_path.is_file():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1

    session_name = MODEL_MAP.get(model_key)
    if not session_name:
        print(f"Unknown model: {model_key}", file=sys.stderr)
        print(f"Known: {', '.join(sorted(MODEL_MAP))}", file=sys.stderr)
        return 1

    _progress(5, "preparing")

    try:
        from rembg import remove
    except ImportError as exc:
        print(
            "Python package 'rembg' is required. Install with: pip install rembg onnxruntime",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 1

    local = _find_local_model(session_name)
    print(f"[rembg] session={session_name} local={local}", file=sys.stderr)

    _progress(15, "loading_model")
    try:
        session = _create_session(session_name, local)
        _progress(35, "running")
        result = remove(input_path.read_bytes(), session=session)
        _progress(90, "writing")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(result)
        _progress(100, "done")
    except Exception as exc:
        print(f"rembg failed: {exc}", file=sys.stderr)
        return 1

    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
