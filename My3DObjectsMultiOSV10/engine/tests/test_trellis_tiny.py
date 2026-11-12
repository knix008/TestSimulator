"""TRELLIS end to end through My3DObjects' adapter — the real TRELLIS code with
tiny random-weight models, on the CPU: the shims (sparse convolution,
block-diagonal attention, kaolin), the mesh extractor's device patch, the
precision switch, the progress hooks and the mesh hand-over.

It needs the TRELLIS source the engine installs (models/trellis/src under
the engine folder: MY3DOBJECTS_ENGINE_HOME, else the app's default) and the
engine's packages (easydict …); without them it skips. No weights
are downloaded and no GPU is used.
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))


def engine_home():
    if os.environ.get("MY3DOBJECTS_ENGINE_HOME"):
        return os.environ["MY3DOBJECTS_ENGINE_HOME"]
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
        return os.path.join(base, "My3DObjects", "engine")
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support", "My3DObjects", "engine")
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "My3DObjects", "engine")


HOME = engine_home()
SRC = os.path.join(HOME, "models", "trellis", "src")
FLEXI = os.path.join(SRC, "trellis", "representations", "mesh", "flexicubes", "flexicubes.py")


def _missing():
    if not os.path.isfile(FLEXI):
        return f"TRELLIS is not installed in {HOME}"
    try:
        import easydict  # noqa: F401
        import torch  # noqa: F401
        import trimesh  # noqa: F401
    except Exception as e:  # noqa: BLE001
        return f"engine packages missing ({e})"
    return ""


@unittest.skipIf(_missing(), _missing() or "")
class TrellisTinyTest(unittest.TestCase):
    def test_image_to_mesh_on_the_cpu(self):
        import numpy as np
        import torch
        from PIL import Image, ImageDraw

        from my3dobjects import models
        from my3dobjects.models import trellis as T

        spec = models.get("trellis")
        spec.prepare(HOME)
        spec._patch_mesh_extractor()

        import trellis.modules.sparse as sp
        from trellis import models as tm
        from trellis.pipelines import samplers
        from trellis.pipelines.trellis_image_to_3d import TrellisImageTo3DPipeline

        self.assertEqual((sp.BACKEND, sp.ATTN), ("spconv", "xformers"))
        import spconv
        import xformers

        self.assertIn("my3dobjects", xformers.__version__)
        self.assertIn("my3dobjects", spconv.__version__)

        class TinyDino(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.patch = torch.nn.Conv2d(3, 32, 37, stride=37)

            def forward(self, x, is_training=True):
                return {"x_prenorm": self.patch(x).flatten(2).transpose(1, 2)}

        def tiny_cond(pipeline, _name):
            from torchvision import transforms

            pipeline.models["image_cond_model"] = TinyDino().eval()
            pipeline.image_cond_model_transform = transforms.Compose([transforms.Normalize([0.5] * 3, [0.5] * 3)])

        class Occupancy(torch.nn.Module):
            """The real decoder runs; its logits become a ball, so the sparse
            stage gets a few hundred voxels whatever the random weights say."""

            def __init__(self, dec):
                super().__init__()
                self.dec = dec

            def forward(self, z):
                out = self.dec(z)
                g = torch.stack(torch.meshgrid(*[torch.arange(out.shape[-1])] * 3, indexing="ij"), -1).float()
                inside = ((g - 15.5) ** 2).sum(-1) < 7.5 ** 2
                return torch.where(inside, 1.0, -1.0)[None, None].expand_as(out).to(out.dtype) + out * 0

            def convert_to_fp16(self):
                self.dec.convert_to_fp16()

            def convert_to_fp32(self):
                self.dec.convert_to_fp32()

        saved = TrellisImageTo3DPipeline._init_image_cond_model
        TrellisImageTo3DPipeline._init_image_cond_model = tiny_cond
        try:
            torch.manual_seed(0)
            ss_flow = tm.SparseStructureFlowModel(
                resolution=16, in_channels=8, model_channels=64, cond_channels=32, out_channels=8, num_blocks=1,
                num_heads=2, patch_size=1, pe_mode="ape", qk_rms_norm=True, use_fp16=True)
            ss_dec = tm.SparseStructureDecoder(
                out_channels=1, latent_channels=8, num_res_blocks=1, num_res_blocks_middle=1,
                channels=[32, 16, 8], use_fp16=True)
            slat_flow = tm.SLatFlowModel(
                resolution=32, in_channels=8, out_channels=8, model_channels=64, cond_channels=32, num_blocks=1,
                num_heads=2, patch_size=2, num_io_res_blocks=1, io_block_channels=[16], pe_mode="ape",
                qk_rms_norm=True, use_fp16=True)
            # model_channels: its upsampling blocks go to /4 and /8 channels,
            # each with a 32-group GroupNorm — so a multiple of 256.
            mesh_dec = tm.SLatMeshDecoder(
                resolution=32, model_channels=256, latent_channels=8, num_blocks=2, num_heads=2, attn_mode="swin",
                window_size=8, use_fp16=True, representation_config={"use_color": True})
            with torch.no_grad():
                mesh_dec.out_layer.weight.normal_(0, 0.02)
            sampler = {"name": "FlowEulerGuidanceIntervalSampler", "args": {"sigma_min": 1e-5}}
            params = {"steps": 25, "cfg_strength": 5.0, "cfg_interval": [0.5, 1.0], "rescale_t": 3.0}
            pipeline = TrellisImageTo3DPipeline(
                {"sparse_structure_flow_model": ss_flow, "sparse_structure_decoder": Occupancy(ss_dec),
                 "slat_flow_model": slat_flow, "slat_decoder_mesh": mesh_dec},
                getattr(samplers, sampler["name"])(**sampler["args"]),
                getattr(samplers, sampler["name"])(**sampler["args"]),
                {"mean": [0.0] * 8, "std": [1.0] * 8},
                "dinov2_vitl14_reg",
            )
        finally:
            TrellisImageTo3DPipeline._init_image_cond_model = saved
        pipeline.sparse_structure_sampler_params = dict(params)
        pipeline.slat_sampler_params = dict(params)

        class Log:
            def info(self, _m):
                pass

            warn = info

        class FakeEngine:
            log = Log()

            def __init__(self):
                self.stages, self.fractions = [], []

            def stage(self, name):
                self.stages.append(name)

            def within(self, f):
                self.fractions.append(f)

            def staged(self, name, fn):
                def run(*a, **k):
                    self.stage(name)
                    return fn(*a, **k)
                return run

        runner = T.TrellisRunner(pipeline, spec, Log())
        runner.to("cpu")
        self.assertEqual(slat_flow.dtype, torch.float32)
        self.assertFalse(slat_flow.use_fp16)
        self.assertEqual(next(slat_flow.blocks.parameters()).dtype, torch.float32)

        engine = FakeEngine()
        spec.install_hooks(runner, engine)
        img = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
        ImageDraw.Draw(img).ellipse((120, 60, 280, 240), fill=(200, 60, 40, 255))
        opts = models.normalize_options(spec, {"ssSteps": 3, "slatSteps": 2}, "cpu")
        mesh = spec.run(runner, img, opts, "cpu", engine)

        self.assertGreater(len(mesh.faces), 100)
        self.assertAlmostEqual(float(np.max(mesh.extents)), 1.0, places=5)
        colours = mesh.visual.vertex_colors
        self.assertEqual(colours.shape, (len(mesh.vertices), 4))
        self.assertEqual(engine.stages[0], "model")
        self.assertIn("mesh", engine.stages)
        self.assertEqual(engine.fractions, sorted(engine.fractions))
        self.assertLessEqual(max(engine.fractions), 1.0)
        self.assertGreater(len(mesh.export(file_type="glb")), 1000)


if __name__ == "__main__":
    unittest.main()
