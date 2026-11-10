"""Stand-in for SF3D's (and SPAR3D's) compiled `uv_unwrapper` package (see my3dobjects/raster.py).

The unwrapping itself is upstream's Python (uv_unwrapper/unwrap.py in the SF3D
(or SPAR3D) source the installer downloaded, located by MY3DOBJECTS_SF3D_SRC or MY3DOBJECTS_SPAR3D_SRC); only the one
compiled operator it calls is registered here in pure PyTorch.
"""

import importlib.util
import os
import sys

from my3dobjects.raster import register_ops

register_ops()


def _load_upstream():
    # SF3D and SPAR3D ship the same unwrapper; whichever model is prepared
    # says where its source is.
    candidates = [
        os.path.join(os.environ.get(var, ""), "uv_unwrapper", "uv_unwrapper", "unwrap.py")
        for var in ("MY3DOBJECTS_SF3D_SRC", "MY3DOBJECTS_SPAR3D_SRC")
        if os.environ.get(var)
    ]
    path = next((p for p in candidates if os.path.isfile(p)), None)
    if path is None:
        raise ImportError(f"uv_unwrapper source not found (looked in: {candidates or 'nowhere'})")
    spec = importlib.util.spec_from_file_location("uv_unwrapper.unwrap", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["uv_unwrapper.unwrap"] = module
    spec.loader.exec_module(module)
    return module


Unwrapper = _load_upstream().Unwrapper

__all__ = ["Unwrapper"]
