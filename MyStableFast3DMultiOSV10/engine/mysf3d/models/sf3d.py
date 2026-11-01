"""Stable Fast 3D (Stability AI): a textured, UV-unwrapped mesh with PBR
material in about a second on a GPU."""

import os
import sys
import types

from . import ModelSpec, option

SHIMS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "shims")

# facebook/dinov2-large's config. SF3D builds DINOv2 with from_pretrained(),
# which would download 1.2 GB of weights that model.safetensors then replaces
# anyway (it holds the image encoders too), so it is built from the config.
DINOV2_LARGE = {
    "hidden_size": 1024,
    "num_hidden_layers": 24,
    "num_attention_heads": 16,
    "mlp_ratio": 4,
    "hidden_act": "gelu",
    "hidden_dropout_prob": 0.0,
    "attention_probs_dropout_prob": 0.0,
    "initializer_range": 0.02,
    "layer_norm_eps": 1e-6,
    "image_size": 518,
    "patch_size": 14,
    "num_channels": 3,
    "qkv_bias": True,
    "layerscale_value": 1.0,
    "drop_path_rate": 0.0,
    "use_swiglu_ffn": False,
}


class _Unavailable(types.ModuleType):
    """Placeholder for an optional library that failed to install."""

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        raise RuntimeError(f"{self.__name__} is not installed; remeshing is not available.")


def remesh_available():
    return all(not isinstance(sys.modules.get(n), _Unavailable) for n in ("gpytoolbox", "pynanoinstantmeshes"))


class StableFast3D(ModelSpec):
    id = "sf3d"
    name = "Stable Fast 3D"
    summary = {
        "ko": "UV 펼침과 PBR 텍스처가 있는 메시. GPU에서 약 1초. Stability AI.",
        "en": "A UV-unwrapped mesh with PBR textures, about a second on a GPU. Stability AI.",
    }
    license = "Stability AI Community License"
    license_url = "https://huggingface.co/stabilityai/stable-fast-3d/blob/main/LICENSE.md"
    page = "https://huggingface.co/stabilityai/stable-fast-3d"
    repo = "stabilityai/stable-fast-3d"
    files = ("config.yaml", "model.safetensors")
    gated = True
    size_label = "4 GB"
    commit = "ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2"
    source_zip = f"https://codeload.github.com/Stability-AI/stable-fast-3d/zip/{commit}"
    check_file = os.path.join("sf3d", "system.py")
    textured = True
    options = [
        option(
            "textureResolution", "select", "auto",
            choices=[{"value": "auto"}, {"value": 512}, {"value": 1024}, {"value": 2048}],
            deviceDefault={"gpu": 1024, "cpu": 512},
        ),
        option(
            "remesh", "select", "none",
            choices=[{"value": "none"}, {"value": "triangle"}, {"value": "quad"}],
            needs="remesh",
        ),
        option("vertexCount", "number", -1, min=100, max=200000, step=100, integer=True, allowOff=-1),
    ]

    _prepared = False

    def prepare(self, home):
        if StableFast3D._prepared:
            return
        src = self.source_dir(home)
        os.environ["MYSF3D_SF3D_SRC"] = src
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        for path in (SHIMS, src):
            if path not in sys.path:
                sys.path.insert(0, path)
        for name in ("gpytoolbox", "pynanoinstantmeshes"):
            try:
                __import__(name)
            except Exception:
                sys.modules[name] = _Unavailable(name)

        import open_clip

        create = open_clip.create_model_and_transforms
        if not getattr(create, "_mysf3d", False):
            def create_without_download(model_name, pretrained=None, *args, **kwargs):
                return create(model_name, None, *args, **kwargs)

            create_without_download._mysf3d = True
            open_clip.create_model_and_transforms = create_without_download

        from sf3d.models.tokenizers import dinov2
        from transformers.models.dinov2.configuration_dinov2 import Dinov2Config

        def from_config(cls, *_args, **_kwargs):
            return cls(Dinov2Config(**DINOV2_LARGE))

        dinov2.Dinov2Model.from_pretrained = classmethod(from_config)
        StableFast3D._prepared = True

    def import_check(self):
        import sf3d.system  # noqa: F401

    def load(self, home, weights_dir, log):
        self.prepare(home)
        from sf3d.system import SF3D

        model = SF3D.from_pretrained(weights_dir, config_name="config.yaml", weight_name="model.safetensors")
        model.eval()
        return model

    def on_device(self, device):
        # sf3d.utils.get_device() decides autocast by itself; keep it in step.
        if device == "cpu":
            os.environ["SF3D_USE_CPU"] = "1"
        else:
            os.environ.pop("SF3D_USE_CPU", None)

    def install_hooks(self, model, engine):
        from sf3d.models.mesh import Mesh

        model.get_scene_codes = engine.staged("model", model.get_scene_codes)
        model.triplane_to_meshes = engine.staged("mesh", model.triplane_to_meshes)
        model.baker.rasterize = engine.staged("bake", model.baker.rasterize)
        if not getattr(Mesh.unwrap_uv, "_mysf3d", False):
            Mesh.unwrap_uv = engine.staged("uv", Mesh.unwrap_uv)
            Mesh.triangle_remesh = engine.staged("remesh", Mesh.triangle_remesh)
            Mesh.quad_remesh = engine.staged("remesh", Mesh.quad_remesh)
        blocks = []
        enc = getattr(getattr(getattr(model, "image_tokenizer", None), "model", None), "encoder", None)
        if enc is not None and hasattr(enc, "layer"):
            blocks += list(enc.layer)
        main = getattr(getattr(model, "backbone", None), "main_blocks", None)
        if main is not None:
            blocks += list(main)
        engine.hook_blocks(blocks)

    def run(self, model, image, options, device, engine):
        import torch
        from contextlib import nullcontext

        if options.get("remesh", "none") != "none" and not remesh_available():
            engine.log.warn("Remeshing is not installed; converting without it.")
            options["remesh"] = "none"
        autocast = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if device == "cuda" else nullcontext()
        with torch.no_grad(), autocast:
            mesh, _glob = model.run_image(
                image,
                bake_resolution=int(options["textureResolution"]),
                remesh=options["remesh"],
                vertex_count=int(options["vertexCount"]),
            )
        return mesh
