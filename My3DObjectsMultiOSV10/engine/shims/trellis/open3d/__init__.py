"""Stand-in for Open3D. TRELLIS's package imports its text-to-3D pipeline,
which imports open3d at the top; only that pipeline's mesh post-processing
uses it, and My3DObjects runs the image pipeline only.

The module is still *read* at import time — type annotations such as
`mesh: o3d.geometry.TriangleMesh` are evaluated when the class is defined —
so names resolve to placeholders (open3d.geometry, open3d.geometry.TriangleMesh
…). Using one (calling it) raises."""


class _Missing:
    def __init__(self, name):
        self._name = name

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Missing(f"{self._name}.{name}")

    def __call__(self, *args, **kwargs):
        raise RuntimeError(f"open3d is not installed ({self._name} was called).")

    def __repr__(self):
        return f"<open3d stand-in {self._name}>"


def __getattr__(name):
    if name.startswith("__"):
        raise AttributeError(name)
    return _Missing(f"open3d.{name}")
