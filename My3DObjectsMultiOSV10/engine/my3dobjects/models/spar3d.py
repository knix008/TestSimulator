"""Stable Point Aware 3D (SPAR3D, Stability AI): Stable Fast 3D's successor.

It first samples a coloured point cloud of the whole object (including the
back the photo does not show) with a small diffusion model, then builds the
mesh from the image and that point cloud. The result is like SF3D's — a
UV-unwrapped mesh with a PBR texture — with a better back side.

Its code base is SF3D's: the same compiled `texture_baker` / `uv_unwrapper`
packages (replaced by the pure PyTorch shims), the same DINOv2 image encoder,
the same optional remeshing. What it adds:

  alpha_clip  AlphaCLIP (Apache-2.0) for the material / lighting estimator,
              downloaded as source like the model's own code; its CLIP
              ViT-L/14 weights (0.9 GB, OpenAI) are fetched at install time.
  loralib     imported by AlphaCLIP.

`transparent_background` (SPAR3D's own background remover) is imported but
not used here — the engine removes the background itself — so a stand-in in
shims/spar3d keeps it from being installed.
"""

import os
import sys
import types

from . import option
from .sf3d import SHIMS, StableFast3D, _Unavailable, remesh_available

SPAR3D_SHIMS = os.path.join(SHIMS, "spar3d")

ALPHA_CLIP_COMMIT = "ef9262bc539728bf8ef2dfe9c402ae12bbfcd9ff"
ALPHA_CLIP_ZIP = f"https://codeload.github.com/SunzeY/AlphaCLIP/zip/{ALPHA_CLIP_COMMIT}"
# Below this much free GPU memory SPAR3D runs in its own low-VRAM mode: the
# point diffusion, the main model and the estimators take turns on the GPU
# (about 7 GB instead of 10.5 GB, a little slower).
LOW_VRAM_BELOW_GB = 11.0


def _ensure_pkg_resources():
    """AlphaCLIP does `from pkg_resources import packaging`. The engine's
    environment has no setuptools; `packaging` itself is installed."""
    try:
        import pkg_resources  # noqa: F401
    except Exception:
        import packaging
        import packaging.version  # noqa: F401

        stub = types.ModuleType("pkg_resources")
        stub.packaging = packaging
        sys.modules["pkg_resources"] = stub


def encoders_covered(keys):
    """True when the checkpoint holds the weights of every DINOv2 image
    encoder the model builds (the main one and the point diffusion's)."""
    keys = list(keys)
    main = any(k.startswith("image_tokenizer.model.") for k in keys)
    pdiff = [k for k in keys if k.startswith("pdiff_image_tokenizer.")]
    return main and (not pdiff or any(k.startswith("pdiff_image_tokenizer.model.") for k in pdiff))


class SPAR3D(StableFast3D):
    id = "spar3d"
    name = "SPAR3D"
    summary = {
        "ko": "Stable Fast 3D의 후속판. 점 구름을 먼저 만들어 보이지 않는 뒷면까지 더 정확합니다. UV·PBR 텍스처. GPU에서 몇 초. Stability AI.",
        "en": "Stable Fast 3D's successor: it samples a point cloud first, so the unseen back is more faithful. UV-unwrapped PBR texture, a few seconds on a GPU. Stability AI.",
    }
    license = "Stability AI Community License"
    license_url = "https://huggingface.co/stabilityai/stable-point-aware-3d/blob/main/LICENSE.md"
    page = "https://huggingface.co/stabilityai/stable-point-aware-3d"
    repo = "stabilityai/stable-point-aware-3d"
    files = ("config.yaml", "model.safetensors")
    gated = True
    size_label = "3.6 GB"
    commit = "fdc311b16809e6a8adc2f5a3407ebb3db1a95bd1"
    source_zip = f"https://codeload.github.com/Stability-AI/stable-point-aware-3d/zip/{commit}"
    check_file = os.path.join("spar3d", "system.py")
    # AlphaCLIP's code, next to the model's (installer: extra_sources).
    extra_sources = (("alpha_clip", ALPHA_CLIP_ZIP, ALPHA_CLIP_COMMIT, os.path.join("alpha_clip", "alpha_clip.py")),)
    packages = ("loralib==0.1.2", "ftfy", "regex")
    textured = True
    # SPAR3D crops the object to 1/1.3 of the picture (its run.py default).
    common_defaults = {"smoothing": 10, "subdivide": 1, "foregroundRatio": 0.75}
    options = StableFast3D.options + [
        # The point diffusion's classifier-free guidance (config default 3).
        option("guidanceScale", "number", 3.0, min=1.0, max=10.0, step=0.5),
        option("seed", "number", 0, min=0, max=2147483647, step=1, integer=True),
    ]

    _prepared = False

    def extra_dir(self, home, name):
        return os.path.join(home, "models", self.id, name)

    def clip_dir(self, home):
        return os.path.join(home, "models", self.id, "clip")

    def prepare(self, home):
        if SPAR3D._prepared:
            return
        src = self.source_dir(home)
        os.environ["MY3DOBJECTS_SPAR3D_SRC"] = src
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        os.environ["ALPHA_CLIP_PATH"] = self.clip_dir(home)
        for path in (SHIMS, SPAR3D_SHIMS, self.extra_dir(home, "alpha_clip"), src):
            if path not in sys.path:
                sys.path.insert(0, path)
        for name in ("gpytoolbox", "pynanoinstantmeshes"):
            try:
                __import__(name)
            except Exception:
                sys.modules[name] = _Unavailable(name)
        _ensure_pkg_resources()
        SPAR3D._prepared = True

    def import_check(self):
        import spar3d.system  # noqa: F401

    def fetch_extras(self, home, weights_dir, log):
        """The CLIP weights AlphaCLIP starts from, named in the config: fetched
        now so the first conversion does not wait for (or fail on) them."""
        from omegaconf import OmegaConf

        self.prepare(home)
        cfg = OmegaConf.load(os.path.join(weights_dir, "config.yaml"))
        name = OmegaConf.select(cfg, "image_estimator.model", default=None) or "ViT-L/14@336px"
        import alpha_clip.alpha_clip as ac

        url = ac._MODELS.get(name)
        if not url:
            return
        os.makedirs(self.clip_dir(home), exist_ok=True)
        log.info(f"SPAR3D: CLIP weights for the estimator ({name}) …")
        ac._download(url, self.clip_dir(home))

    def _patch_dinov2(self, weight_path):
        """Build DINOv2 from its config instead of downloading 1.2 GB of
        weights — when model.safetensors holds the encoder (it does for SF3D;
        checked here, not assumed)."""
        from safetensors import safe_open
        from transformers.models.dinov2.configuration_dinov2 import Dinov2Config

        from spar3d.models.tokenizers import dinov2

        with safe_open(weight_path, framework="pt") as f:
            keys = list(f.keys())
        covered = encoders_covered(keys)
        if not covered or getattr(dinov2.Dinov2Model.from_pretrained, "_my3dobjects", False):
            return
        original = dinov2.Dinov2Model.from_pretrained

        def from_config(cls, name, *args, **kwargs):
            if str(name).rstrip("/").endswith("dinov2-large"):
                from .sf3d import DINOV2_LARGE

                return cls(Dinov2Config(**DINOV2_LARGE))
            return original.__func__(cls, name, *args, **kwargs)

        from_config._my3dobjects = True
        dinov2.Dinov2Model.from_pretrained = classmethod(from_config)

    def load(self, home, weights_dir, log):
        self.prepare(home)
        import torch

        self._patch_dinov2(os.path.join(weights_dir, "model.safetensors"))
        from spar3d.system import SPAR3D as Model

        low_vram = False
        if torch.cuda.is_available() and os.environ.get("SPAR3D_USE_CPU") != "1":
            torch.cuda.empty_cache()
            free, total = (x / 1024 ** 3 for x in torch.cuda.mem_get_info())
            low_vram = free < LOW_VRAM_BELOW_GB
            if low_vram:
                log.info(
                    f"SPAR3D: {free:.1f} of {total:.0f} GB of GPU memory free — low-VRAM mode "
                    "(its parts take turns on the GPU, about 7 GB)."
                )
        model = Model.from_pretrained(weights_dir, config_name="config.yaml",
                                      weight_name="model.safetensors", low_vram_mode=low_vram)
        model.eval()
        return model

    def on_device(self, device):
        if device == "cpu":
            os.environ["SPAR3D_USE_CPU"] = "1"
        else:
            os.environ.pop("SPAR3D_USE_CPU", None)

    def install_hooks(self, model, engine):
        from spar3d.models.mesh import Mesh

        # Low-VRAM mode rebuilds the parts on every run, so the stages come
        # from the methods, not from hooks on the blocks.
        model.forward_pdiff_cond = engine.staged("model", model.forward_pdiff_cond)
        model.triplane_to_meshes = engine.staged("mesh", model.triplane_to_meshes)
        model.baker.rasterize = engine.staged("bake", model.baker.rasterize)
        if not getattr(Mesh.unwrap_uv, "_my3dobjects", False):
            Mesh.unwrap_uv = engine.staged("uv", Mesh.unwrap_uv)
            Mesh.triangle_remesh = engine.staged("remesh", Mesh.triangle_remesh)
            Mesh.quad_remesh = engine.staged("remesh", Mesh.quad_remesh)

    def run(self, model, image, options, device, engine):
        import random
        from contextlib import nullcontext

        import numpy as np
        import torch

        if options.get("remesh", "none") != "none" and not remesh_available():
            engine.log.warn("Remeshing is not installed; converting without it.")
            options["remesh"] = "none"
        seed = int(options.get("seed", 0))
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        guidance = float(options.get("guidanceScale", 3.0))
        model.cfg.guidance_scale = guidance
        if getattr(model, "sampler", None) is not None:
            model.sampler.guidance_scale = guidance
        autocast = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if device == "cuda" else nullcontext()
        with torch.no_grad(), autocast:
            mesh, _glob = model.run_image(
                image,
                bake_resolution=int(options["textureResolution"]),
                remesh=options["remesh"],
                vertex_count=int(options["vertexCount"]),
            )
        return mesh
