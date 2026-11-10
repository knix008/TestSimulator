"""Stand-in for `transparent_background`, which SPAR3D's spar3d/utils.py
imports for its own background remover. My3DObjects removes backgrounds
itself (rembg) before the model sees the picture, so the remover is never
used and the real package (with its own large model download) is not
installed."""


class Remover:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(
            "transparent_background is not installed; My3DObjects removes the background with rembg."
        )

    def process(self, *args, **kwargs):  # pragma: no cover - never constructed
        raise RuntimeError("transparent_background is not installed.")


__all__ = ["Remover"]
