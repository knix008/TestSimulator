"""Stand-in for utils3d (EasternJournalist/utils3d). TRELLIS imports it at
the top of its Gaussian representation, which uses it only to save and load
Gaussian PLY files — never on the image → mesh path My3DObjects runs.
Using it raises; the real package would also need moderngl."""


def __getattr__(name):
    if name.startswith("__"):
        raise AttributeError(name)
    raise RuntimeError(f"utils3d is not installed (utils3d.{name} was asked for).")
