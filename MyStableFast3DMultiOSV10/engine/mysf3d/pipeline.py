"""Image → 3D: one loaded model at a time, the device it runs on, and the
steps around it (background removal, export).

The GPU is used when there is one (CUDA, else Apple's MPS), the CPU otherwise.
When a conversion fails on the GPU (out of memory, a driver error) the model
moves to the CPU and the same image is converted again there, so a result
always comes back; the log says what happened.
"""

import gc
import io
import os
import threading
import time
import zipfile

from .models import normalize_options

# Stage → (start, end) of the overall progress bar.
STAGES = {
    "queued": (0.0, 0.0),
    "loading": (0.0, 0.05),
    "background": (0.05, 0.12),
    "model": (0.12, 0.55),
    "mesh": (0.55, 0.65),
    "remesh": (0.65, 0.70),
    "uv": (0.70, 0.78),
    "bake": (0.78, 0.95),
    "export": (0.95, 1.0),
    "done": (1.0, 1.0),
}


class Cancelled(Exception):
    pass


def device_name(device):
    import torch

    if device == "cuda":
        try:
            return torch.cuda.get_device_name(0)
        except Exception:
            return "CUDA GPU"
    if device == "mps":
        return "Apple GPU (MPS)"
    return "CPU"


def pick_device(preference="auto"):
    import torch

    if preference == "cpu":
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def is_device_error(err):
    import torch

    oom = getattr(torch.cuda, "OutOfMemoryError", None)
    if oom is not None and isinstance(err, oom):
        return True
    text = str(err).lower()
    return any(k in text for k in ("cuda", "cudnn", "cublas", "out of memory", "mps", "metal", "device-side"))


def resize_foreground(image, ratio):
    """Crops to the opaque part, pads it square and then so it fills `ratio`
    of the side (the preprocessing both models were trained with)."""
    import numpy as np
    from PIL import Image

    arr = np.asarray(image)
    ys, xs = np.where(arr[..., 3] > 0)
    if ys.size == 0:
        return image
    fg = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    size = max(fg.shape[0], fg.shape[1])
    ph, pw = size - fg.shape[0], size - fg.shape[1]
    sq = np.pad(fg, ((ph // 2, ph - ph // 2), (pw // 2, pw - pw // 2), (0, 0)))
    side = int(sq.shape[0] / ratio)
    p = side - sq.shape[0]
    out = np.pad(sq, ((p // 2, p - p // 2), (p // 2, p - p // 2), (0, 0)))
    return Image.fromarray(out)


class Engine:
    def __init__(self, home, log):
        self.home = home
        self.log = log
        self.spec = None
        self.model = None
        self.device = "cpu"
        self.preference = "auto"
        self.rembg_session = None
        self.lock = threading.RLock()
        self._job = None

    # ── Loading ───────────────────────────────────────────
    def load(self, spec, weights_dir, preference="auto"):
        """Makes `spec` the loaded model (unloading another one first)."""
        import torch

        with self.lock:
            self.preference = preference
            if self.spec is spec and self.model is not None:
                target = pick_device(preference)
                if target != self.device:
                    self.move_to(target)
                return
            self.unload()
            started = time.time()
            self.log.info(f"Loading {spec.name} from {weights_dir} …")
            model = spec.load(self.home, weights_dir, self.log)
            self.spec = spec
            self.model = model
            spec.install_hooks(model, self)
            self.move_to(pick_device(preference))
            self.log.info(
                f"{spec.name} ready on {device_name(self.device)} in {time.time() - started:.1f} s "
                f"(PyTorch {torch.__version__}, {torch.get_num_threads()} CPU threads)."
            )

    def unload(self):
        import torch

        if self.model is None:
            return
        self.log.info(f"Unloading {self.spec.name}.")
        self.model = None
        self.spec = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def move_to(self, device):
        import torch

        try:
            self.model.to(device)
            self.device = device
        except Exception as e:  # noqa: BLE001 — any GPU failure means: use the CPU
            if device == "cpu":
                raise
            self.log.warn(f"Could not move the model to {device_name(device)} ({e}); using the CPU.")
            self.model.to("cpu")
            self.device = "cpu"
        on_device = getattr(self.spec, "on_device", None)
        if on_device:
            on_device(self.device)
        if self.device != "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()

    def set_preference(self, preference):
        with self.lock:
            self.preference = preference
            if self.model is None:
                return
            target = pick_device(preference)
            if target != self.device:
                self.log.info(f"Device: {device_name(self.device)} → {device_name(target)}")
                self.move_to(target)

    def background_session(self):
        if self.rembg_session is None:
            import rembg

            self.rembg_session = rembg.new_session("u2net")
        return self.rembg_session

    # ── Progress, used by the model specs' hooks ──────────
    def stage(self, name):
        if self._job is not None:
            self._job.enter(name)

    def within(self, fraction):
        if self._job is not None:
            self._job.within(fraction)

    def staged(self, name, fn):
        engine = self

        def run(*args, **kwargs):
            engine.stage(name)
            return fn(*args, **kwargs)

        run._mysf3d = True
        return run

    def hook_blocks(self, blocks):
        """Progress through the model stage from its transformer blocks
        (and a chance to cancel between them)."""
        total = max(1, len(blocks))
        for i, block in enumerate(blocks):
            def tick(_module, _inputs, i=i):
                self.within(i / total)
            block.register_forward_pre_hook(tick)

    # ── Converting ────────────────────────────────────────
    def convert(self, job):
        """Runs one job with the loaded model; fills job.files. Raises Cancelled."""
        with self.lock:
            spec = self.spec
            job.model = spec.id
            job.model_name = spec.name
            job.options = normalize_options(spec, job.raw_options, self.device)
            self._job = job
            try:
                return self._convert_on(self.device, job)
            except Cancelled:
                raise
            except Exception as e:  # noqa: BLE001
                if self.device == "cpu" or not is_device_error(e):
                    raise
                self.log.warn(f"The conversion failed on {device_name(self.device)}: {str(e).splitlines()[0]}")
                self.log.warn("Moving the model to the CPU and converting again (slower).")
                self.move_to("cpu")
                job.fallback = True
                job.options = normalize_options(spec, job.raw_options, "cpu")
                return self._convert_on("cpu", job)
            finally:
                self._job = None

    def _convert_on(self, device, job):
        import torch
        from PIL import Image, ImageOps

        job.device = device
        job.device_name = device_name(device)
        job.enter("background")
        image = Image.open(io.BytesIO(job.image_bytes))
        image = ImageOps.exif_transpose(image).convert("RGBA")
        job.input_size = image.size
        has_alpha = image.getextrema()[3][0] < 255
        if job.options["removeBackground"] and not has_alpha:
            import rembg

            image = rembg.remove(image, session=self.background_session())
        job.check()
        image = resize_foreground(image, job.options["foregroundRatio"])
        prepared = io.BytesIO()
        image.save(prepared, format="PNG")
        job.files["input.png"] = prepared.getvalue()

        if device == "cuda":
            torch.cuda.reset_peak_memory_stats()
        mesh = self.spec.run(self.model, image, job.options, device, self)
        if device == "cuda":
            job.peak_memory = int(torch.cuda.max_memory_allocated())
        # Both models return the object facing -Z (seen from where the photo
        # was taken). glTF's front is +Z — the app's Front view and its first
        # camera look from there — so turn it round.
        import numpy as np
        import trimesh

        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))

        job.enter("export")
        job.files["result.glb"] = mesh.export(file_type="glb", include_normals=True)
        job.stats = {"vertices": int(len(mesh.vertices)), "faces": int(len(mesh.faces))}
        if "textureResolution" in job.options:
            job.stats["textureResolution"] = job.options["textureResolution"]
        job._mesh = mesh
        return job.files

    @staticmethod
    def export_obj_zip(mesh, name="model"):
        """OBJ + MTL + texture in one zip (trimesh writes the three files)."""
        from trimesh.exchange.obj import export_obj

        text, files = export_obj(mesh, include_texture=True, return_texture=True, mtl_name=f"{name}.mtl")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(f"{name}.obj", text)
            for fname, data in (files or {}).items():
                z.writestr(fname, data)
        return buf.getvalue()


class Job:
    """One conversion: its state for /api/jobs/<id> and its result files."""

    def __init__(self, job_id, image_bytes, options, name="", model=""):
        self.id = job_id
        self.name = name
        self.model = model
        self.model_name = ""
        self.image_bytes = image_bytes
        self.raw_options = options
        self.options = {}
        self.state = "queued"
        self.stage = "queued"
        self.progress = 0.0
        self.error = ""
        self.created = time.time()
        self.started = None
        self.finished = None
        self.stage_started = None
        self.timings = {}
        self.files = {}
        self.stats = {}
        self.device = ""
        self.device_name = ""
        self.fallback = False
        self.peak_memory = 0
        self.input_size = None
        self.cancel_requested = False
        self._mesh = None
        self.on_stage = None

    def check(self):
        if self.cancel_requested:
            raise Cancelled()

    def enter(self, stage):
        self.check()
        now = time.time()
        if self.stage_started is not None and self.stage not in ("queued", stage):
            self.timings[self.stage] = round(self.timings.get(self.stage, 0) + now - self.stage_started, 3)
        if stage != self.stage:
            self.stage = stage
            self.stage_started = now
            if self.on_stage:
                self.on_stage(self, stage)
        self.progress = max(self.progress, STAGES.get(stage, (self.progress, self.progress))[0])

    def within(self, fraction):
        """Progress inside the current stage (0–1)."""
        self.check()
        a, b = STAGES.get(self.stage, (self.progress, self.progress))
        self.progress = max(self.progress, a + (b - a) * max(0.0, min(1.0, fraction)))

    def finish(self, state, error=""):
        now = time.time()
        if self.stage_started is not None and self.stage not in ("queued", "done"):
            self.timings[self.stage] = round(self.timings.get(self.stage, 0) + now - self.stage_started, 3)
        self.state = state
        self.error = error
        self.finished = now
        if state == "done":
            self.stage = "done"
            self.progress = 1.0
        self.image_bytes = b""

    def to_json(self):
        now = time.time()
        return {
            "id": self.id,
            "name": self.name,
            "model": self.model,
            "modelName": self.model_name,
            "state": self.state,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "error": self.error,
            "options": self.options,
            "stats": self.stats,
            "timings": self.timings,
            "device": self.device,
            "deviceName": self.device_name,
            "fallback": self.fallback,
            "peakMemory": self.peak_memory,
            "inputSize": list(self.input_size) if self.input_size else None,
            "elapsed": round((self.finished or now) - (self.started or now), 2) if self.started else 0,
            "files": sorted(self.files.keys()) + (["result-obj.zip"] if self._mesh is not None else []),
        }
