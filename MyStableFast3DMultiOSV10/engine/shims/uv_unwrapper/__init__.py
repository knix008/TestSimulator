"""Stand-in for SF3D's compiled `uv_unwrapper` package (see mysf3d/raster.py).

The unwrapping itself is upstream's Python (uv_unwrapper/unwrap.py in the SF3D
source the installer downloaded, located by MYSF3D_SF3D_SRC); only the one
compiled operator it calls is registered here in pure PyTorch.
"""

import importlib.util
import os
import sys

from mysf3d.raster import register_ops

register_ops()


def _load_upstream():
    src = os.environ.get("MYSF3D_SF3D_SRC", "")
    path = os.path.join(src, "uv_unwrapper", "uv_unwrapper", "unwrap.py")
    if not os.path.isfile(path):
        raise ImportError(f"SF3D source not found: {path}")
    spec = importlib.util.spec_from_file_location("uv_unwrapper.unwrap", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["uv_unwrapper.unwrap"] = module
    spec.loader.exec_module(module)
    return module


Unwrapper = _load_upstream().Unwrapper

__all__ = ["Unwrapper"]
