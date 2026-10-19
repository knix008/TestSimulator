"""Describes this Python for MyTrainer: version, and whether PyTorch / NumPy are installed.

Prints one JSON line. Never fails: a missing or broken package is reported, not raised.
"""
import json
import platform
import sys

info = {
    "executable": sys.executable,
    "version": platform.python_version(),
    "implementation": platform.python_implementation(),
    "bits": 64 if sys.maxsize > 2 ** 32 else 32,
    "venv": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    "torch": None,
    "cuda": False,
    "cudaVersion": None,
    "gpu": None,
    "mps": False,
    "numpy": None,
    "pip": False,
    "venvModule": False,
    "error": None,
}

try:
    import importlib.util

    info["pip"] = importlib.util.find_spec("pip") is not None
    info["venvModule"] = importlib.util.find_spec("venv") is not None and importlib.util.find_spec("ensurepip") is not None
except Exception:  # noqa: BLE001
    pass

try:
    import numpy

    info["numpy"] = numpy.__version__
except Exception:  # noqa: BLE001
    pass

try:
    import torch

    info["torch"] = torch.__version__
    info["cuda"] = bool(torch.cuda.is_available())
    info["cudaVersion"] = torch.version.cuda
    if info["cuda"]:
        info["gpu"] = torch.cuda.get_device_name(0)
    mps = getattr(torch.backends, "mps", None)
    info["mps"] = bool(mps and mps.is_available())
except Exception as error:  # noqa: BLE001
    if not isinstance(error, ModuleNotFoundError):
        info["error"] = f"{type(error).__name__}: {error}"

print(json.dumps(info))
