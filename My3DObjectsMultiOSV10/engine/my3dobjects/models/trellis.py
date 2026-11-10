"""TRELLIS (Microsoft, MIT): image → 3D through a structured 3D latent.

Two rectified-flow transformers run one after the other: the first finds
which voxels of a 64³ grid the object occupies (the "sparse structure"), the
second fills those voxels with latent features; a decoder turns them into a
FlexiCubes mesh with vertex colours. TRELLIS can also decode 3D Gaussians and
radiance fields and bake a texture from them, but that needs compiled CUDA
renderers (diff-gaussian-rasterization, nvdiffrast); here only the mesh is
decoded, so the result is a vertex-coloured mesh like TripoSR's — with the
much better shape and colours of a 1.1 B-parameter model.

Compiled libraries TRELLIS imports are replaced by pure PyTorch stand-ins in
shims/trellis, so nothing is compiled and it runs on CUDA, Apple GPUs and the
CPU (slowly — minutes):

  xformers   block-diagonal attention → torch scaled_dot_product_attention
  spconv     submanifold sparse convolution → gather + matmul per offset
  kaolin     check_tensor (FlexiCubes' only use of it)
  open3d, utils3d, plyfile   imported at the top of modules this path never calls

Two pieces come from elsewhere at install time: FlexiCubes (Apache-2.0, a git
submodule of the TRELLIS repository, so not in its zip) and the DINOv2
ViT-L/14 image encoder (Meta, Apache-2.0), which TRELLIS loads with
torch.hub from GitHub and dl.fbaipublicfiles.com.
"""

import json
import os
import sys

from . import ModelSpec, option

SHIMS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "shims")
TRELLIS_SHIMS = os.path.join(SHIMS, "trellis")

FLEXICUBES_COMMIT = "815e075a2a400d06c48d94c347674344ed6ae5c5"
FLEXICUBES_ZIP = f"https://codeload.github.com/MaxtirError/FlexiCubes/zip/{FLEXICUBES_COMMIT}"
FLEXICUBES_DIR = os.path.join("src", "trellis", "representations", "mesh", "flexicubes")

# The parts of the pipeline the mesh needs (pipeline.json lists the Gaussian
# and radiance-field decoders too; they are neither downloaded nor loaded).
MESH_MODELS = ("sparse_structure_decoder", "sparse_structure_flow_model", "slat_flow_model", "slat_decoder_mesh")
CKPTS = {
    "sparse_structure_decoder": "ckpts/ss_dec_conv3d_16l8_fp16",
    "sparse_structure_flow_model": "ckpts/ss_flow_img_dit_L_16l8_fp16",
    "slat_flow_model": "ckpts/slat_flow_img_dit_L_64l8p2_fp16",
    "slat_decoder_mesh": "ckpts/slat_dec_mesh_swin8_B_64l8m256c_fp16",
}
# Z-up (TRELLIS) → Y-up (glTF), as TRELLIS's own GLB export turns it:
# (x, y, z) → (x, z, -y). The picture's front then faces +Z.
Z_UP_TO_Y_UP = ((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0))


def environment():
    """The attention / convolution backends TRELLIS reads at import."""
    return {
        "ATTN_BACKEND": "sdpa",             # dense attention: PyTorch's own
        "SPARSE_ATTN_BACKEND": "xformers",  # sparse attention: shims/trellis/xformers
        "SPARSE_BACKEND": "spconv",         # sparse convolution: shims/trellis/spconv
        "SPCONV_ALGO": "native",
        # DINOv2's own code would try the xformers stand-in, which only has
        # what TRELLIS calls: use its plain attention.
        "XFORMERS_DISABLED": "1",
    }


# The DINOv2 hub repository at an explicit branch: without one torch.hub
# asks GitHub which default branch it has, even when the code is cached.
DINOV2_HUB = "facebookresearch/dinov2:main"


def mesh_arrays(result):
    """Vertices (V, 3), faces (F, 3) and colours (V, 4, uint8) from a TRELLIS
    MeshExtractResult, Y up, colours clamped to 0..1 first."""
    import numpy as np

    verts = result.vertices.detach().float().cpu().numpy()
    faces = result.faces.detach().cpu().numpy().astype(np.int64)
    verts = verts @ np.asarray(Z_UP_TO_Y_UP)
    attrs = result.vertex_attrs
    if attrs is not None and attrs.shape[0] == verts.shape[0]:
        rgb = attrs[:, :3].detach().float().clamp(0, 1).cpu().numpy()
    else:
        rgb = np.full((verts.shape[0], 3), 0.78)
    colours = np.concatenate([np.round(rgb * 255), np.full((rgb.shape[0], 1), 255)], axis=1).astype(np.uint8)
    return verts, faces, colours


def model_input(image):
    """TRELLIS's own preprocessing after its crop: 518 × 518, the colour
    multiplied by the alpha (black background), RGB."""
    import numpy as np
    from PIL import Image

    img = image.convert("RGBA").resize((518, 518), Image.Resampling.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 255.0
    rgb = arr[:, :, :3] * arr[:, :, 3:4]
    return Image.fromarray((rgb * 255.0).round().astype(np.uint8))


class Trellis(ModelSpec):
    id = "trellis"
    name = "TRELLIS"
    summary = {
        "ko": "Microsoft의 대형 모델(1.1B). 형상과 색이 가장 정교한 편. 정점 색 메시. GPU 메모리 12 GB 이상 권장(CPU는 몇 분). MIT 라이선스.",
        "en": "Microsoft's large model (1.1 B): among the most detailed shapes and colours. Vertex-coloured mesh. 12 GB of GPU memory or more advised (minutes on a CPU). MIT license.",
    }
    license = "MIT"
    license_url = "https://huggingface.co/microsoft/TRELLIS-image-large/blob/main/README.md"
    page = "https://huggingface.co/microsoft/TRELLIS-image-large"
    repo = "microsoft/TRELLIS-image-large"
    files = ("pipeline.json",) + tuple(f"{p}.{ext}" for p in CKPTS.values() for ext in ("json", "safetensors"))
    gated = False
    size_label = "3.9 GB"
    commit = "193e0502b5cb3eb5997ec457d5340e95d09b158e"
    source_zip = f"https://codeload.github.com/microsoft/TRELLIS/zip/{commit}"
    check_file = os.path.join("trellis", "pipelines", "trellis_image_to_3d.py")
    extra_sources = (("flexicubes", FLEXICUBES_ZIP, FLEXICUBES_COMMIT, "flexicubes.py", FLEXICUBES_DIR),)
    packages = ("easydict",)
    textured = False
    output = "vertex-colors"
    faces_front = True                # turned to face +Z in run()
    dinov2 = "dinov2_vitl14_reg"
    vram_gb = 12.0
    # The flexicubes surface is already smooth: no subdivision by default.
    common_defaults = {"smoothing": 2, "subdivide": 0}
    # The defaults are TRELLIS's own demo values (app.py).
    options = [
        option("seed", "number", 0, min=0, max=2147483647, step=1, integer=True),
        option("ssSteps", "number", 12, min=1, max=50, step=1, integer=True),
        option("ssGuidance", "number", 7.5, min=0.0, max=10.0, step=0.5),
        option("slatSteps", "number", 12, min=1, max=50, step=1, integer=True),
        option("slatGuidance", "number", 3.0, min=0.0, max=10.0, step=0.5),
    ]

    def torch_home(self, home):
        return os.path.join(home, "models", self.id, "torch-hub")

    def prepare(self, home):
        for key, value in environment().items():
            os.environ[key] = value
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        os.environ["TORCH_HOME"] = self.torch_home(home)
        for path in (TRELLIS_SHIMS, self.source_dir(home)):
            if path not in sys.path:
                sys.path.insert(0, path)

    def import_check(self):
        import trellis.pipelines.trellis_image_to_3d  # noqa: F401
        from trellis.representations.mesh.flexicubes.flexicubes import FlexiCubes  # noqa: F401

    def fetch_extras(self, home, weights_dir, log):
        """DINOv2 (code from GitHub, weights from Meta) into this model's
        torch hub folder, so loading later needs no network."""
        import torch

        self.prepare(home)
        torch.hub.set_dir(os.path.join(self.torch_home(home), "hub"))
        log.info(f"TRELLIS: the DINOv2 image encoder ({self.dinov2}, 1.2 GB) …")
        torch.hub.load(DINOV2_HUB, self.dinov2, pretrained=True, trust_repo=True)

    def _patch_image_cond_model(self):
        """TRELLIS loads DINOv2 with torch.hub.load('facebookresearch/dinov2', …),
        which looks up the repository's default branch online every time;
        the same with the branch named, from the cached copy."""
        from torchvision import transforms

        from trellis.pipelines.trellis_image_to_3d import TrellisImageTo3DPipeline as cls

        if getattr(cls._init_image_cond_model, "_my3dobjects", False):
            return

        def _init_image_cond_model(pipeline, name):
            import torch

            model = torch.hub.load(DINOV2_HUB, name, pretrained=True, trust_repo=True)
            model.eval()
            pipeline.models["image_cond_model"] = model
            pipeline.image_cond_model_transform = transforms.Compose([
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])

        _init_image_cond_model._my3dobjects = True
        cls._init_image_cond_model = _init_image_cond_model

    def _patch_mesh_extractor(self):
        """SparseFeatures2Mesh builds its grids on "cuda" when created; build
        them on the CPU and move them to wherever the features are."""
        from trellis.representations.mesh import cube2mesh
        from trellis.representations.mesh.flexicubes.flexicubes import FlexiCubes

        cls = cube2mesh.SparseFeatures2Mesh
        if getattr(cls.__init__, "_my3dobjects", False):
            return
        init, call = cls.__init__, cls.__call__

        def __init__(self, device="cuda", res=64, use_color=True):
            init(self, device="cpu", res=res, use_color=use_color)

        def __call__(self, cubefeats, training=False):
            dev = cubefeats.feats.device
            if str(self.device) != str(dev):
                self.mesh_extractor = FlexiCubes(device=dev)
                self.reg_c = self.reg_c.to(dev)
                self.reg_v = self.reg_v.to(dev)
                self.device = dev
            return call(self, cubefeats, training)

        __init__._my3dobjects = True
        cls.__init__ = __init__
        cls.__call__ = __call__

    def local_files(self, weights_dir):
        """name → local path of one of `files`. The installer hands over the
        folder of the last file (…/ckpts); the files are found from the
        snapshot root, else in the Hugging Face cache one by one (they may sit
        in different snapshots when downloaded at different times)."""
        root = weights_dir
        if not os.path.isfile(os.path.join(root, "pipeline.json")) and os.path.basename(root) == "ckpts":
            root = os.path.dirname(root)

        def local(name):
            path = os.path.join(root, *name.split("/"))
            if os.path.isfile(path):
                return path
            from huggingface_hub import hf_hub_download

            return hf_hub_download(self.repo, name, local_files_only=True)

        return local

    def load(self, home, weights_dir, log):
        import torch

        self.prepare(home)
        torch.hub.set_dir(os.path.join(self.torch_home(home), "hub"))
        self._patch_mesh_extractor()
        self._patch_image_cond_model()
        from trellis import models as tmodels
        from trellis.pipelines import samplers
        from trellis.pipelines.trellis_image_to_3d import TrellisImageTo3DPipeline

        local = self.local_files(weights_dir)
        with open(local("pipeline.json"), encoding="utf-8") as f:
            args = json.load(f)["args"]
        parts = {}
        for key in MESH_MODELS:
            path = local(args["models"][key] + ".json")[: -len(".json")]
            log.info(f"TRELLIS: {key} ← {os.path.basename(path)}")
            parts[key] = tmodels.from_pretrained(path)
        # TrellisImageTo3DPipeline's __init__, without loading the decoders
        # the mesh does not use; DINOv2 comes from the torch hub folder.
        pipeline = TrellisImageTo3DPipeline(
            parts,
            getattr(samplers, args["sparse_structure_sampler"]["name"])(**args["sparse_structure_sampler"]["args"]),
            getattr(samplers, args["slat_sampler"]["name"])(**args["slat_sampler"]["args"]),
            args["slat_normalization"],
            args["image_cond_model"],
        )
        pipeline.sparse_structure_sampler_params = args["sparse_structure_sampler"]["params"]
        pipeline.slat_sampler_params = args["slat_sampler"]["params"]
        return TrellisRunner(pipeline, self, log)

    def install_hooks(self, model, engine):
        p = model.pipeline
        steps = {"ss": 1, "slat": 1}

        def counted(name, sampler, start, span):
            once = sampler.sample_once
            count = {"n": 0}

            def sample_once(*args, **kwargs):
                count["n"] += 1
                engine.within(start + span * min(1.0, count["n"] / max(1, steps[name])))
                return once(*args, **kwargs)

            def reset():
                count["n"] = 0

            sampler.sample_once = sample_once
            return reset

        model.reset_ss = counted("ss", p.sparse_structure_sampler, 0.0, 0.4)
        model.reset_slat = counted("slat", p.slat_sampler, 0.4, 0.6)
        model.steps = steps
        p.decode_slat = engine.staged("mesh", p.decode_slat)

    def run(self, model, image, options, device, engine):
        import numpy as np
        import torch
        import trimesh

        p = model.pipeline
        model.steps.update(ss=int(options["ssSteps"]), slat=int(options["slatSteps"]))
        model.reset_ss()
        model.reset_slat()
        engine.stage("model")
        with torch.no_grad():
            out = p.run(
                model_input(image),
                seed=int(options["seed"]),
                sparse_structure_sampler_params={"steps": int(options["ssSteps"]), "cfg_strength": float(options["ssGuidance"])},
                slat_sampler_params={"steps": int(options["slatSteps"]), "cfg_strength": float(options["slatGuidance"])},
                formats=["mesh"],
                preprocess_image=False,
            )
        result = out["mesh"][0]
        if result.vertices is None or result.vertices.shape[0] == 0 or result.faces.shape[0] == 0:
            raise RuntimeError("TRELLIS found no surface in this image.")
        verts, faces, colours = mesh_arrays(result)
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=colours, process=False)
        # About one unit across like the other models' results, centred.
        extent = float(np.max(mesh.extents)) or 1.0
        mesh.apply_translation(-mesh.bounding_box.centroid)
        mesh.apply_scale(1.0 / extent)
        return mesh


class TrellisRunner:
    """The pipeline as the engine handles a model: `.to(device)` moves every
    part and picks the precision (fp16 on GPUs, fp32 on the CPU)."""

    def __init__(self, pipeline, spec, log):
        self.pipeline = pipeline
        self.spec = spec
        self.log = log
        self.steps = {}

    def to(self, device):
        import torch

        if device == "cuda":
            torch.cuda.empty_cache()
            free, total = (x / 1024 ** 3 for x in torch.cuda.mem_get_info())
            if free < self.spec.vram_gb:
                self.log.warn(
                    f"TRELLIS: {free:.1f} of {total:.0f} GB of GPU memory free, about {self.spec.vram_gb:.0f} GB "
                    "wanted — a large object may run out of memory (it is then converted on the CPU)."
                )
        set_precision(self.pipeline.models, half=device != "cpu")
        for part in self.pipeline.models.values():
            part.to(device)
        return self


def set_precision(parts, half):
    """fp16 or fp32 for the TRELLIS parts. Their convert_to_fp16/32 change
    the weights only; the forward passes cast their inputs to `.dtype`, so
    that (and `.use_fp16`) is set to match. DINOv2 stays fp32."""
    import torch

    for name, part in parts.items():
        if name == "image_cond_model":
            continue
        convert = getattr(part, "convert_to_fp16" if half else "convert_to_fp32", None)
        if convert is None:
            continue
        convert()
        if hasattr(part, "dtype") and not isinstance(type(part).__dict__.get("dtype"), property):
            part.dtype = torch.float16 if half else torch.float32
        if hasattr(part, "use_fp16"):
            part.use_fp16 = bool(half)
