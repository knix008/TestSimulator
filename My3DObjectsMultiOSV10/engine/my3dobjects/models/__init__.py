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
    # (name, zip url, commit, check file[, folder under models/<id>]): code
    # from elsewhere, downloaded with the model's own source.
    extra_sources = ()
    gated = False             # the license must be accepted on Hugging Face
    size_label = ""
    source_zip = ""
    commit = ""
    check_file = ""           # a file the source download must contain
    textured = False          # the result has a texture (else vertex colours)
    output = ""               # texture | vertex-colors | shape (default from `textured`)
    options = []              # option descriptors for the app's panel
    packages = ()             # pip packages only this model needs
    common_defaults = {}      # recommended values of COMMON_OPTIONS for this model
    # Versions of one model share a family; the app offers a version picker.
    family = ""
    family_name = ""
    version = ""
    version_label = ""
    # The license does not cover every country: installed only after the
    # user has accepted that in the app (see Service.accept_license).
    region_restricted = False
    license_note = None

    @property
    def source_id(self):
        return self.id

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

    def fetch_extras(self, home, weights_dir, log):
        """Downloads at install time that are not Hugging Face files (weights
        the model's own code fetches from elsewhere)."""

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
            "output": self.output or ("texture" if self.textured else "vertex-colors"),
            "options": self.options,
            "common": common_options(self),
            "family": self.family or self.id,
            "familyName": self.family_name or self.name,
            "version": self.version,
            "versionLabel": self.version_label,
            "regionRestricted": self.region_restricted,
            "licenseNote": self.license_note,
        }


def option(key, kind, default, **extra):
    return {"key": key, "type": kind, "default": default, **extra}


# `group` sorts the options in the app's conversion settings window: the
# input image, the model itself (each model's own options, which carry no
# group) and the surface clean-up afterwards. Surface options can be changed
# on a finished result without converting again (pipeline.SURFACE_OPTIONS).
COMMON_OPTIONS = [
    option("removeBackground", "bool", True, group="input"),
    option("foregroundRatio", "number", 0.85, min=0.5, max=1.0, step=0.05, group="input"),
    # Loose pieces smaller than this share (%) of the largest one are removed.
    option("minPartSize", "number", 0.5, min=0, max=20, step=0.5, group="surface"),
    # Each level splits every triangle in four before smoothing (×4 faces).
    option("subdivide", "number", 0, min=0, max=2, step=1, integer=True, group="surface"),
    # Taubin smoothing passes over the finished surface (0 = none).
    option("smoothing", "number", 0, min=0, max=50, step=1, integer=True, group="surface"),
    # Stand the result upright: a photo taken from above makes a model that
    # assumes a level camera lean towards the viewer (see pipeline.upright).
    option("straighten", "bool", True, group="surface"),
]


def common_options(spec):
    """The options every model takes, with this model's recommended defaults
    (ModelSpec.common_defaults)."""
    defaults = getattr(spec, "common_defaults", None) or {}
    return [{**o, "default": defaults.get(o["key"], o["default"])} for o in COMMON_OPTIONS]


def normalize_options(spec, raw, device):
    """Clamps the options sent with a job to what the model accepts."""
    raw = raw or {}
    out = {}
    for opt in common_options(spec) + spec.options:
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
    from .hunyuan3d import VERSIONS as HUNYUAN3D
    from .spar3d import SPAR3D
    from .trellis import Trellis

    return [StableFast3D(), SPAR3D(), TripoSR(), Trellis(), *(cls() for cls in HUNYUAN3D)]


MODELS = _registry()
DEFAULT_MODEL = "sf3d"


def get(model_id):
    return next((m for m in MODELS if m.id == model_id), None)
