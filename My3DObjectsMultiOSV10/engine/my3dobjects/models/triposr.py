"""TripoSR (Tripo AI & Stability AI, MIT): a mesh with vertex colours from
one image, quick on a GPU and usable on a CPU."""

import os
import sys

from . import ModelSpec, option

SHIMS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "shims")


class TripoSR(ModelSpec):
    id = "triposr"
    name = "TripoSR"
    summary = {
        "ko": "정점 색이 있는 메시. 가볍고 빠르며 라이선스가 자유롭다(MIT). Tripo AI · Stability AI.",
        "en": "A mesh with vertex colours; light, fast and freely licensed (MIT). Tripo AI · Stability AI.",
    }
    license = "MIT"
    license_url = "https://huggingface.co/stabilityai/TripoSR/blob/main/README.md"
    page = "https://huggingface.co/stabilityai/TripoSR"
    repo = "stabilityai/TripoSR"
    files = ("config.yaml", "model.ckpt")
    extra_files = (("facebook/dino-vitb16", "config.json"),)
    gated = False
    size_label = "1.7 GB"
    commit = "107cefdc244c39106fa830359024f6a2f1c78871"
    source_zip = f"https://codeload.github.com/VAST-AI-Research/TripoSR/zip/{commit}"
    check_file = os.path.join("tsr", "system.py")
    textured = False
    # Marching cubes leaves a stepped surface: split once and smoothed well by
    # default (as SF3D).
    common_defaults = {"smoothing": 10, "subdivide": 1}
    options = [
        option(
            "mcResolution", "select", "auto",
            choices=[{"value": "auto"}, {"value": 128}, {"value": 192}, {"value": 256}, {"value": 320}],
            deviceDefault={"gpu": 256, "cpu": 192},
        ),
        option("threshold", "number", 25.0, min=5.0, max=60.0, step=1.0),
    ]

    def prepare(self, home):
        src = self.source_dir(home)
        # torchmcubes (compiled) is replaced by scikit-image (shims/torchmcubes).
        for path in (SHIMS, src):
            if path not in sys.path:
                sys.path.insert(0, path)

    def import_check(self):
        import tsr.system  # noqa: F401

    def load(self, home, weights_dir, log):
        self.prepare(home)
        from tsr.system import TSR

        model = TSR.from_pretrained(weights_dir, config_name="config.yaml", weight_name="model.ckpt")
        model.renderer.set_chunk_size(8192)
        model.eval()
        return model

    def install_hooks(self, model, engine):
        model.extract_mesh = engine.staged("mesh", model.extract_mesh)
        blocks = []
        vit = getattr(getattr(model, "image_tokenizer", None), "model", None)
        enc = getattr(vit, "encoder", None)
        if enc is not None and hasattr(enc, "layer"):
            blocks += list(enc.layer)
        tb = getattr(getattr(model, "backbone", None), "transformer_blocks", None)
        if tb is not None:
            blocks += list(tb)
        engine.hook_blocks(blocks)

    def run(self, model, image, options, device, engine):
        import numpy as np
        import torch
        import trimesh
        from PIL import Image

        # TripoSR wants the object on a 50 % grey background.
        arr = np.asarray(image).astype(np.float32) / 255.0
        rgb = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
        prepared = Image.fromarray((rgb * 255.0).astype(np.uint8))
        engine.stage("model")
        with torch.no_grad():
            scene_codes = model([prepared], device=device)
        meshes = model.extract_mesh(scene_codes, True, resolution=int(options["mcResolution"]),
                                    threshold=float(options["threshold"]))
        mesh = meshes[0]
        # The orientation TripoSR's own demo uses (Y up, facing the viewer).
        mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
        return mesh
