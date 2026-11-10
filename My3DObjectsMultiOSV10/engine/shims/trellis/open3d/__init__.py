"""Stand-in for Open3D. TRELLIS's package imports its text-to-3D pipeline,
which imports open3d at the top; only that pipeline's mesh post-processing
uses it, and My3DObjects runs the image pipeline only. Using it raises."""


def __getattr__(name):
    if name.startswith("__"):
        raise AttributeError(name)
    raise RuntimeError(f"open3d is not installed (open3d.{name} was asked for).")
