"""The image-to-3D models the engine can run.

Each model is a ModelSpec: where its code and weights come from, how to load
it, which options it takes (the app builds its option panel from them) and
how to turn one prepared image into a trimesh mesh. Adding a model means
adding a module here and listing it in MODELS.
"""

import os
import sys


class ModelSpec:
    id = ""
    name = ""
    summary = {"ko": "", "en": ""}
    license = ""
    license_url = ""
    page = ""
    repo = ""                 # Hugging Face weights
    files = ()                # files in `repo` the model loads
    extra_files = ()          # (repo, file) also fetched at install time
    gated = False             # the license must be accepted on Hugging Face
    size_label = ""
    source_zip = ""
    commit = ""
    check_file = ""           # a file the source download must contain
    textured = False          # the result has a texture (else vertex colours)
    options = []              # option descriptors for the app's panel

    def source_dir(self, home):
        return os.path.join(home, "models", self.id, "src")

    def prepare(self, home):
        """sys.path and any import patches; called before importing."""
        src = self.source_dir(home)
        if src not in sys.path:
            sys.path.insert(0, src)

    def import_check(self):
        raise NotImplementedError

    def load(self, home, weights_dir, log):
        """The model on the CPU, in eval mode."""
        raise NotImplementedError

    def install_hooks(self, model, engine):
        """Stage reporting: call engine.stage(name) / engine.within(f)."""

    def run(self, model, image, options, device, engine):
        """image: RGBA PIL image, background removed and centred.
        Returns a trimesh.Trimesh."""
        raise NotImplementedError

    def to_json(self, lang_neutral=True):
        return {
            "id": self.id,
            "name": self.name,
            "summary": self.summary,
            "license": self.license,
            "licenseUrl": self.license_url,
            "page": self.page,
            "gated": self.gated,
            "size": self.size_label,
            "textured": self.textured,
            "options": self.options,
        }


def option(key, kind, default, **extra):
    return {"key": key, "type": kind, "default": default, **extra}


COMMON_OPTIONS = [
    option("removeBackground", "bool", True),
    option("foregroundRatio", "number", 0.85, min=0.5, max=1.0, step=0.05),
]


def normalize_options(spec, raw, device):
    """Clamps the options sent with a job to what the model accepts."""
    raw = raw or {}
    out = {}
    for opt in COMMON_OPTIONS + spec.options:
        key, kind, default = opt["key"], opt["type"], opt["default"]
        val = raw.get(key, default)
        if kind == "bool":
            out[key] = str(val).lower() not in ("0", "false", "no", "off", "")
        elif kind == "number":
            try:
                num = float(val)
            except (TypeError, ValueError):
                num = float(default)
            if opt.get("allowOff") is not None and num == opt["allowOff"]:
                out[key] = opt["allowOff"]
                continue
            num = max(opt.get("min", num), min(opt.get("max", num), num))
            out[key] = int(round(num)) if opt.get("integer") else num
        elif kind == "select":
            # "auto" resolves to the device's default; numbers arrive as strings.
            choices = [c["value"] for c in opt["choices"] if c["value"] != "auto"]
            by_device = opt.get("deviceDefault") or {}
            fallback = by_device.get("cpu" if device == "cpu" else "gpu", default)
            if str(val) in ("auto", "None", ""):
                val = fallback
            match = next((c for c in choices if str(c) == str(val)), None)
            out[key] = match if match is not None else (fallback if fallback in choices else choices[0])
    return out


def _registry():
    from .sf3d import StableFast3D
    from .triposr import TripoSR

    return [StableFast3D(), TripoSR()]


MODELS = _registry()
DEFAULT_MODEL = "sf3d"


def get(model_id):
    return next((m for m in MODELS if m.id == model_id), None)
