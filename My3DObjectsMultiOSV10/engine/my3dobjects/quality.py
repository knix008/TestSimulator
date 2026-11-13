"""Quality settings fitted to the object in the picture.

With "fit quality" on (the default), a conversion looks at the subject after
the background is gone and raises or lowers the quality options the user has
not set: texture and mesh resolution, diffusion steps, how closely the model
follows the picture. A small or plain subject keeps the lighter settings; a
large, busy one (a figure, a town, a patterned surface) gets the sharper ones.
A value the user chose is left as it is.

The measure is the subject's own pixels, not a classifier: the shorter side of
its opaque box, and how much of that box is an edge.
"""

import numpy as np

# Shorter side of the subject, in pixels, and the share of its pixels that sit
# on an edge. Below `coarse` the photo has little to resolve; `fine` is a
# large subject with a busy surface.
COARSE_SPAN = 480
FINE_SPAN = 900
FINE_DETAIL = 0.10

# (cpu, gpu) for each tier. Every value is one the model's option already allows.
_TEXTURE = {"coarse": (512, 512), "medium": (512, 1024), "fine": (1024, 2048)}
_MC = {"coarse": (128, 192), "medium": (192, 256), "fine": (256, 320)}
# TRELLIS stage 1 steps, stage 2 steps (shape and colour), stage 2 guidance.
_TRELLIS = {
    "coarse": ((8, 8, 3.0), (8, 8, 3.0)),
    "medium": ((12, 12, 3.0), (12, 12, 3.0)),
    "fine": ((12, 16, 4.0), (18, 24, 4.0)),
}
# Hunyuan shape grid, face cap, steps, guidance, projected-texture size.
_HY_OCTREE = {"coarse": (256, 256), "medium": (256, 256), "fine": (256, 384)}
_HY_FACES = {"coarse": (20000, 20000), "medium": (40000, 40000), "fine": (40000, 80000)}
_HY_STEPS = {"coarse": (20, 20), "medium": (30, 30), "fine": (30, 40)}
_HY_GUIDE = {"coarse": (5.0, 5.0), "medium": (5.0, 5.0), "fine": (5.0, 6.0)}
_HY_TEX = {"coarse": (1024, 1024), "medium": (1024, 2048), "fine": (1024, 2048)}
_SPAR_GUIDE = {"coarse": (3.0, 3.0), "medium": (3.0, 3.0), "fine": (3.0, 4.0)}

_TIER_WORD = {"coarse": "plain", "medium": "ordinary", "fine": "detailed"}


def subject_profile(image):
    """How much real detail the subject carries: its shorter side in pixels
    and the share of those pixels that lie on an edge. No opaque pixels →
    an ordinary subject, so the recommended settings stay."""
    arr = np.asarray(image.convert("RGBA"))
    alpha = arr[..., 3]
    ys, xs = np.nonzero(alpha > 16)
    if xs.size == 0:
        return {"span": 0, "detail": 0.0, "tier": "medium"}
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    span = min(y1 - y0, x1 - x0)
    crop = arr[y0:y1, x0:x1]
    step = max(1, max(crop.shape[0], crop.shape[1]) // 160)
    small = crop[::step, ::step]
    mask = small[..., 3] > 16
    if int(mask.sum()) < 4 or span < 2:
        detail = 0.0
    else:
        lum = small[..., :3].astype(np.float32).mean(axis=2)
        edges = np.zeros(lum.shape, dtype=bool)
        gy = np.abs(lum[1:, :] - lum[:-1, :]) > 18
        gx = np.abs(lum[:, 1:] - lum[:, :-1]) > 18
        edges[1:, :] |= gy
        edges[:-1, :] |= gy
        edges[:, 1:] |= gx
        edges[:, :-1] |= gx
        detail = float(edges[mask].mean())
    if span < COARSE_SPAN:
        tier = "coarse"
    elif span >= FINE_SPAN and detail >= FINE_DETAIL:
        tier = "fine"
    else:
        tier = "medium"
    return {"span": span, "detail": detail, "tier": tier}


def _options(spec):
    from .models import common_options

    return list(common_options(spec)) + list(spec.options)


def _find(spec, key):
    return next((o for o in _options(spec) if o["key"] == key), None)


def _untouched(raw, key):
    """True when the user did not send this option (or left it on auto)."""
    if not raw or key not in raw or raw[key] in (None, ""):
        return True
    return str(raw[key]) == "auto"


def _pick(table, tier, gpu):
    cpu_val, gpu_val = table[tier]
    return gpu_val if gpu else cpu_val


def _set(spec, options, raw, key, value):
    opt = _find(spec, key)
    if opt is None or not _untouched(raw, key):
        return
    if opt["type"] == "select":
        choices = [c["value"] for c in opt["choices"] if c["value"] != "auto"]
        if value not in choices and str(value) not in {str(c) for c in choices}:
            return
        match = next(c for c in choices if str(c) == str(value))
        options[key] = match
        return
    num = float(value)
    num = max(opt.get("min", num), min(opt.get("max", num), num))
    options[key] = int(round(num)) if opt.get("integer") else num


def fit_quality(spec, image, options, raw, device, log=None):
    """`options` with the quality knobs fitted to `image`. Returns
    (options, profile). Profile is None when fitting is off. `raw` is what
    the user sent, so an explicit choice is never replaced."""
    options = dict(options)
    if not options.get("fitQuality", True):
        return options, None
    profile = subject_profile(image)
    gpu = device != "cpu"
    tier = profile["tier"]
    before = dict(options)

    if _find(spec, "textureResolution"):
        _set(spec, options, raw, "textureResolution", _pick(_TEXTURE, tier, gpu))
    if _find(spec, "mcResolution"):
        _set(spec, options, raw, "mcResolution", _pick(_MC, tier, gpu))
    if spec.id == "spar3d":
        _set(spec, options, raw, "guidanceScale", _pick(_SPAR_GUIDE, tier, gpu))
    if spec.id == "trellis":
        ss, slat, guide = _pick(_TRELLIS, tier, gpu)
        _set(spec, options, raw, "ssSteps", ss)
        _set(spec, options, raw, "slatSteps", slat)
        _set(spec, options, raw, "slatGuidance", guide)
        if options.get("texture", "project") == "project":
            options["textureSize"] = _pick(_HY_TEX, tier, gpu)
    if getattr(spec, "family", "") == "hunyuan3d":
        _set(spec, options, raw, "octreeResolution", _pick(_HY_OCTREE, tier, gpu))
        _set(spec, options, raw, "faceLimit", _pick(_HY_FACES, tier, gpu))
        if not getattr(spec, "turbo", False):
            _set(spec, options, raw, "steps", _pick(_HY_STEPS, tier, gpu))
        _set(spec, options, raw, "guidanceScale", _pick(_HY_GUIDE, tier, gpu))
        if options.get("texture", "project") == "project":
            options["textureSize"] = _pick(_HY_TEX, tier, gpu)

    changed = []
    for key, value in options.items():
        if key == "textureSize":
            if before.get(key) != value:
                changed.append(f"projected texture {value}")
            continue
        if before.get(key) != value:
            changed.append(f"{key} {before.get(key)} → {value}")
    profile = {**profile, "changed": changed}
    if log is not None:
        note = ", ".join(changed) if changed else "the recommended settings already match"
        log.info(f"Quality fitted to the subject ({profile['span']} px, {_TIER_WORD[tier]}): {note}.")
    return options, profile
