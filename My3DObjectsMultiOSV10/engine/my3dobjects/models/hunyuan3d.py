"""Hunyuan3D (Tencent): shape generation from one image, in several versions.

Each version is its own model (its own weights, options and install state),
grouped under the family "hunyuan3d" so the app can offer a version picker:

  2.1               tencent/Hunyuan3D-2.1   hunyuan3d-dit-v2-1        (hy3dshape)
  2.0 / 2.0 Turbo   tencent/Hunyuan3D-2     hunyuan3d-dit-v2-0[-turbo] (hy3dgen)
  2.0 mini / Turbo  tencent/Hunyuan3D-2mini hunyuan3d-dit-v2-mini[-turbo]

Only the shape part runs here: the texture ("paint") models need compiled
CUDA extensions and 20+ GB of GPU memory. The result is an untextured mesh.

The Tencent Hunyuan 3D community licenses do not cover the European Union,
the United Kingdom or South Korea, so these models are `region_restricted`:
the engine installs one only after the user has accepted that in the app.
"""

import os
import sys

from . import ModelSpec, option

LICENSE_NOTE = {
    "ko": "Tencent Hunyuan 3D Community License는 사용 지역에서 유럽 연합 · 영국 · 대한민국을 제외합니다. "
          "이 지역에서 쓰는 것은 라이선스가 허락하지 않습니다. 월 사용자 100만 명 이상의 상업적 사용도 별도 허가가 필요합니다.",
    "en": "The Tencent Hunyuan 3D Community License excludes the European Union, the United Kingdom and South Korea "
          "from its territory: use there is not licensed. Commercial use above 1 million monthly users needs a separate license.",
}


class _Hunyuan(ModelSpec):
    family = "hunyuan3d"
    family_name = "Hunyuan3D"
    region_restricted = True
    license_note = LICENSE_NOTE
    faces_front = True                # the photo's view is already +Z
    output = "shape"
    textured = False
    gated = False
    package_root = "hy3dgen"          # the importable package (shape part)
    code_subdir = ""                  # where it sits inside the source zip
    subfolder = ""                    # the weights' folder in the repo
    weight_file = "model.fp16.safetensors"
    turbo_vae = ""                    # Turbo versions decode with their own VAE
    turbo = False
    vram_gb = 8.0                     # below this, the parts take turns on the GPU
    # The defaults are Tencent's own demo values (gradio_app.py).
    default_steps = 30
    default_guidance = 5.0
    packages = ("diffusers==0.30.3", "opencv-python-headless", "pymeshlab==2023.12.post3")

    @property
    def files(self):
        names = [f"{self.subfolder}/config.yaml", f"{self.subfolder}/{self.weight_file}"]
        if self.turbo_vae:
            names += [f"{self.turbo_vae}/config.yaml", f"{self.turbo_vae}/model.fp16.safetensors"]
        return tuple(names)

    @property
    def options(self):
        return [
            option("steps", "number", self.default_steps, min=1 if self.turbo else 10,
                   max=20 if self.turbo else 100, step=1, integer=True),
            option("guidanceScale", "number", self.default_guidance, min=1.0, max=15.0, step=0.5),
            option("octreeResolution", "select", 256, choices=[{"value": 256}, {"value": 384}, {"value": 512}]),
            option("faceLimit", "number", 40000, min=5000, max=200000, step=5000, integer=True),
            option("seed", "number", 1234, min=0, max=2147483647, step=1, integer=True),
        ]

    def source_dir(self, home):
        # Every version of one code base shares its download.
        return os.path.join(home, "models", self.source_id, "src")

    def code_dir(self, home):
        src = self.source_dir(home)
        return os.path.join(src, self.code_subdir) if self.code_subdir else src

    def prepare(self, home):
        path = self.code_dir(home)
        if path not in sys.path:
            sys.path.insert(0, path)

    def import_check(self):
        __import__(f"{self.package_root}.pipelines" if self.package_root == "hy3dshape" else f"{self.package_root}.shapegen")

    def _pipeline_class(self):
        if self.package_root == "hy3dshape":
            from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
        else:
            from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        return Hunyuan3DDiTFlowMatchingPipeline

    def _postprocessors(self):
        if self.package_root == "hy3dshape":
            from hy3dshape.postprocessors import FaceReducer, FloaterRemover, DegenerateFaceRemover
        else:
            from hy3dgen.shapegen import FaceReducer, FloaterRemover, DegenerateFaceRemover
        return FloaterRemover(), DegenerateFaceRemover(), FaceReducer()

    def load(self, home, weights_dir, log):
        import torch

        self.prepare(home)
        root = os.path.dirname(weights_dir) if os.path.basename(weights_dir) in (self.subfolder, self.turbo_vae) else weights_dir

        def local(name):
            # Each file from the Hugging Face cache (they may sit in different
            # snapshots when downloaded at different times).
            path = os.path.join(root, name)
            if os.path.isfile(path):
                return path
            from huggingface_hub import hf_hub_download

            return hf_hub_download(self.repo, name, local_files_only=True)

        cls = self._pipeline_class()
        config = local(f"{self.subfolder}/config.yaml")
        ckpt = local(f"{self.subfolder}/{self.weight_file}")
        log.info(f"Hunyuan3D {self.version_label}: {ckpt}")
        pipeline = cls.from_single_file(
            ckpt, config, device="cpu", dtype=torch.float32,
            use_safetensors=self.weight_file.endswith(".safetensors"),
        )
        if self.turbo_vae:
            from hy3dgen.shapegen.models import ShapeVAE

            pipeline.vae = ShapeVAE.from_single_file(
                local(f"{self.turbo_vae}/model.fp16.safetensors"),
                local(f"{self.turbo_vae}/config.yaml"),
                device="cpu", dtype=torch.float32, use_safetensors=True,
            )
            pipeline.vae.enable_flashvdm_decoder(enabled=True, adaptive_kv_selection=True, topk_mode="mean", mc_algo="mc")
        return HunyuanRunner(pipeline, self, log)

    def install_hooks(self, model, engine):
        p = model.pipeline
        p._export = engine.staged("mesh", p._export)

    def run(self, model, image, options, device, engine):
        import numpy as np
        import torch
        import trimesh

        p = model.pipeline
        steps = int(options["steps"])

        def progress(step, _t, _out):
            engine.within(min(1.0, (step + 1) / steps))

        engine.stage("model")
        generator = torch.Generator(device="cpu").manual_seed(int(options["seed"]))
        with torch.inference_mode():
            result = p(
                image=image,
                num_inference_steps=steps,
                guidance_scale=float(options["guidanceScale"]),
                generator=generator,
                octree_resolution=int(options["octreeResolution"]),
                num_chunks=20000 if device == "cpu" or (self.turbo and not model.low_vram) else 8000,
                mc_algo="mc",
                output_type="trimesh",
                enable_pbar=False,
                callback=progress,
                callback_steps=1,
            )
        mesh = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(mesh, (list, tuple)):
            mesh = mesh[0]
        if mesh is None or len(mesh.faces) == 0:
            raise RuntimeError("Hunyuan3D found no surface in this image.")

        engine.stage("remesh")
        floaters, degenerate, reducer = self._postprocessors()
        mesh = floaters(mesh)
        mesh = degenerate(mesh)
        mesh = reducer(mesh, max_facenum=int(options["faceLimit"]))
        if not isinstance(mesh, trimesh.Trimesh):
            mesh = trimesh.Trimesh(vertices=np.asarray(mesh.vertices), faces=np.asarray(mesh.faces), process=False)
        # About one unit tall like the other models' results, standing on its
        # centre (the app puts it on the floor).
        extent = float(np.max(mesh.extents)) or 1.0
        mesh.apply_translation(-mesh.bounding_box.centroid)
        mesh.apply_scale(1.0 / extent)
        # A light clay colour: the shape has no texture.
        mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=np.tile([200, 196, 188, 255], (len(mesh.vertices), 1)))
        return mesh

    def to_json(self, lang_neutral=True):
        out = super().to_json(lang_neutral)
        out.update(regionRestricted=True, licenseNote=self.license_note)
        return out


class HunyuanRunner:
    """The pipeline as the engine handles a model: `.to(device)` puts it on a
    device. On a GPU with less memory than the version needs, the three parts
    (image encoder, diffusion model, shape decoder) stay in main memory and
    each goes to the GPU only while it runs."""

    def __init__(self, pipeline, spec, log):
        self.pipeline = pipeline
        self.spec = spec
        self.log = log
        self.low_vram = False
        self.on_gpu = ""
        for name in ("conditioner", "model", "vae"):
            getattr(pipeline, name).register_forward_pre_hook(self._swap_in(name))

    def _swap_in(self, name):
        def hook(_module, _args):
            if not self.low_vram or self.on_gpu == name:
                return
            import torch

            p = self.pipeline
            for other in ("conditioner", "model", "vae"):
                if other != name:
                    getattr(p, other).to("cpu")
            torch.cuda.empty_cache()
            getattr(p, name).to(p.device)
            self.on_gpu = name
        return hook

    def to(self, device):
        import torch

        p = self.pipeline
        self.low_vram = False
        self.on_gpu = ""
        if device == "cuda":
            # What is free now, not the card's size: another program (or a
            # second engine) on the GPU leaves less, and on Windows running
            # past it does not fail but spills into main memory, very slowly.
            torch.cuda.empty_cache()
            free, total = (x / 1024 ** 3 for x in torch.cuda.mem_get_info())
            if free < self.spec.vram_gb:
                p.to("cpu", torch.float16)
                p.device = torch.device("cuda")
                self.low_vram = True
                self.log.info(
                    f"Hunyuan3D {self.spec.version_label}: {free:.1f} of {total:.0f} GB of GPU memory free, "
                    f"{self.spec.vram_gb:.0f} GB wanted — its parts take turns on the GPU (a little slower)."
                )
                return self
            p.to("cuda", torch.float16)
        elif device == "mps":
            p.to("mps", torch.float16)
        else:
            p.to("cpu", torch.float32)
        return self


class Hunyuan3D21(_Hunyuan):
    id = "hunyuan3d-2.1"
    version = "2.1"
    version_label = "2.1"
    name = "Hunyuan3D 2.1"
    summary = {
        "ko": "Hunyuan3D 최신 공개판(2025년 6월). 세밀한 형상, 텍스처 없음. GPU 메모리 10 GB 권장(적으면 나눠 올림). 지역 제한 라이선스.",
        "en": "The latest open Hunyuan3D (June 2025). Detailed shape, no texture. 10 GB of GPU memory advised (less works, part by part). Region-limited license.",
    }
    license = "Tencent Hunyuan 3D 2.1 Community License"
    license_url = "https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE"
    page = "https://huggingface.co/tencent/Hunyuan3D-2.1"
    repo = "tencent/Hunyuan3D-2.1"
    subfolder = "hunyuan3d-dit-v2-1"
    weight_file = "model.fp16.ckpt"
    size_label = "7.4 GB"
    source_id = "hunyuan3d-2.1"
    commit = "82920d643c0dc2f7bfd7255f45f62d386edfe60c"
    source_zip = f"https://codeload.github.com/Tencent-Hunyuan/Hunyuan3D-2.1/zip/{commit}"
    code_subdir = "hy3dshape"
    package_root = "hy3dshape"
    check_file = os.path.join("hy3dshape", "hy3dshape", "pipelines.py")
    vram_gb = 10.0
    default_guidance = 5.0
    # timm unpinned: the base install already has one, which must not change.
    packages = _Hunyuan.packages + ("timm",)


class _Hunyuan20Code(_Hunyuan):
    source_id = "hunyuan3d-2.0"
    commit = "f8db63096c8282cb27354314d896feba5ba6ff8a"
    source_zip = f"https://codeload.github.com/Tencent-Hunyuan/Hunyuan3D-2/zip/{commit}"
    check_file = os.path.join("hy3dgen", "shapegen", "pipelines.py")
    license = "Tencent Hunyuan 3D 2.0 Community License"


class Hunyuan3D20(_Hunyuan20Code):
    id = "hunyuan3d-2.0"
    version = "2.0"
    version_label = "2.0"
    name = "Hunyuan3D 2.0"
    summary = {
        "ko": "Hunyuan3D 2.0 기본판. 텍스처 없는 형상. GPU 메모리 6 GB 이상 권장. 지역 제한 라이선스.",
        "en": "Hunyuan3D 2.0. Shape without texture. 6 GB of GPU memory or more advised. Region-limited license.",
    }
    license_url = "https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE.txt"
    page = "https://huggingface.co/tencent/Hunyuan3D-2"
    repo = "tencent/Hunyuan3D-2"
    subfolder = "hunyuan3d-dit-v2-0"
    size_label = "4.9 GB"
    vram_gb = 7.0


class Hunyuan3D20Turbo(Hunyuan3D20):
    id = "hunyuan3d-2.0-turbo"
    version = "2.0-turbo"
    version_label = "2.0 Turbo"
    name = "Hunyuan3D 2.0 Turbo"
    summary = {
        "ko": "Hunyuan3D 2.0을 5단계로 줄인 빠른 판. 텍스처 없는 형상. 지역 제한 라이선스.",
        "en": "Hunyuan3D 2.0 distilled to 5 steps: much faster. Shape without texture. Region-limited license.",
    }
    subfolder = "hunyuan3d-dit-v2-0-turbo"
    turbo_vae = "hunyuan3d-vae-v2-0-turbo"
    turbo = True
    default_steps = 5
    size_label = "5.3 GB"


class Hunyuan3DMini(_Hunyuan20Code):
    id = "hunyuan3d-2mini"
    version = "2.0-mini"
    version_label = "2.0 mini"
    name = "Hunyuan3D 2.0 mini"
    summary = {
        "ko": "Hunyuan3D 2.0의 작은 판(0.6B). 텍스처 없는 형상. 가볍고 CPU에서도 됩니다. 지역 제한 라이선스.",
        "en": "The small Hunyuan3D 2.0 (0.6B). Shape without texture; light enough for a CPU. Region-limited license.",
    }
    license_url = "https://huggingface.co/tencent/Hunyuan3D-2mini/blob/main/LICENSE"
    page = "https://huggingface.co/tencent/Hunyuan3D-2mini"
    repo = "tencent/Hunyuan3D-2mini"
    subfolder = "hunyuan3d-dit-v2-mini"
    size_label = "3.8 GB"
    vram_gb = 5.0


class Hunyuan3DMiniTurbo(Hunyuan3DMini):
    id = "hunyuan3d-2mini-turbo"
    version = "2.0-mini-turbo"
    version_label = "2.0 mini Turbo"
    name = "Hunyuan3D 2.0 mini Turbo"
    summary = {
        "ko": "Hunyuan3D 2.0 mini를 5단계로 줄인 가장 빠른 판. 텍스처 없는 형상. 지역 제한 라이선스.",
        "en": "Hunyuan3D 2.0 mini distilled to 5 steps: the fastest. Shape without texture. Region-limited license.",
    }
    subfolder = "hunyuan3d-dit-v2-mini-turbo"
    turbo_vae = "hunyuan3d-vae-v2-mini-turbo"
    turbo = True
    default_steps = 5
    size_label = "4.2 GB"


VERSIONS = [Hunyuan3D21, Hunyuan3D20, Hunyuan3D20Turbo, Hunyuan3DMini, Hunyuan3DMiniTurbo]
