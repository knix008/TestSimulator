"""Stand-in for plyfile. TRELLIS imports PlyData / PlyElement at the top of
its Gaussian representation, used only to save and load Gaussian PLY files —
never on the image → mesh path My3DObjects runs. Using them raises."""


class _Unused:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("plyfile is not installed (TRELLIS's Gaussian PLY files are not used).")

    @classmethod
    def read(cls, *args, **kwargs):
        raise RuntimeError("plyfile is not installed (TRELLIS's Gaussian PLY files are not used).")

    @classmethod
    def describe(cls, *args, **kwargs):
        raise RuntimeError("plyfile is not installed (TRELLIS's Gaussian PLY files are not used).")


class PlyData(_Unused):
    pass


class PlyElement(_Unused):
    pass


__all__ = ["PlyData", "PlyElement"]
