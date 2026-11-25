#!/usr/bin/env python3
"""
sr_worker.py: the PyTorch / OpenCV super-resolution models of MyImageViewer, run by the host
(src-tauri/src/host/superres.rs) with the Python of the app's own environment.

  python sr_worker.py --probe
      one JSON line: torch / opencv versions and the device "auto" would use
  python sr_worker.py --family swinir|edsr|aurasr|espcn --model FILE [--task …] [--size …]
                      --scale N [--tile T] [--device auto|gpu|cpu] INPUT OUTPUT

  swinir  --task classical|lightweight|real --size S|M|L   (models/sr_models/network_swinir.py)
  edsr    official EDSR (32 blocks × 256), ×2 / ×3 / ×4     (sr_models/edsr.py)
  aurasr  AuraSR v2 (GigaGAN, ×4), the `aura-sr` package; config.json beside the model
  espcn   ESPCN ×2 / ×3 / ×4 through OpenCV dnn_superres (OpenCL GPU when there is one)

Device: auto = NVIDIA CUDA, else Apple MPS, else CPU; gpu = CUDA / MPS or an error; cpu.
A GPU out of memory retries with smaller tiles, then on the CPU. See-through pictures:
the colour goes through the model, the alpha is resized (bicubic).

stderr lines the host reads:   DEVICE <cuda|mps|opencl|cpu> <name>    PROGRESS <0-100>
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "sr_models"))


def _say(line: str) -> None:
    print(line, file=sys.stderr, flush=True)


def _cpu_name() -> str:
    return f"CPU ({os.cpu_count()} threads)"


def _pick_device(want: str):
    import torch

    if want in ("auto", "gpu"):
        if torch.cuda.is_available():
            return torch.device("cuda"), torch.cuda.get_device_name(0)
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return torch.device("mps"), "Apple GPU (MPS)"
        if want == "gpu":
            raise RuntimeError("NO_GPU: no CUDA or MPS device is available to PyTorch")
    return torch.device("cpu"), _cpu_name()


def probe() -> int:
    out = {}
    try:
        import torch

        dev, name = _pick_device("auto")
        out.update(torch=torch.__version__, cuda=torch.version.cuda, cudaAvailable=torch.cuda.is_available(),
                   device=dev.type, deviceName=name)
    except Exception as exc:  # noqa: BLE001
        out["torchError"] = str(exc)
    try:
        import cv2

        out["opencv"] = cv2.__version__
        # 4.x only: 5.x reads the ESPCN TensorFlow models as ONNX and fails
        out["superres"] = hasattr(cv2, "dnn_superres") and cv2.__version__.startswith("4.")
    except Exception as exc:  # noqa: BLE001
        out["opencvError"] = str(exc)
    for mod in ("aura_sr", "numpy", "PIL"):
        try:
            __import__(mod)
            out[mod] = True
        except Exception:  # noqa: BLE001
            out[mod] = False
    print(json.dumps(out))
    return 0


# ── the image in and out ──

def load_image(path):
    from PIL import Image

    src = Image.open(path)
    alpha = src.getchannel("A") if src.mode in ("RGBA", "LA", "PA") else None
    return src.convert("RGB"), alpha


def save_image(rgb, alpha, path):
    from PIL import Image

    if alpha is not None:
        rgb.putalpha(alpha.resize(rgb.size, Image.BICUBIC))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    rgb.save(path, "PNG")


def make_reporter(lo: int, hi: int):
    last = [-1]

    def report(f: float) -> None:
        p = int(lo + max(0.0, min(1.0, f)) * (hi - lo))
        if p != last[0]:
            last[0] = p
            _say(f"PROGRESS {p}")

    return report


def half_dtype(device):
    """The 16-bit type for a GPU: bfloat16 where the hardware has it (FP32's range, so
    attention scores cannot overflow, which turned SwinIR's FP16 output black), else
    float16; None on the CPU."""
    import torch

    if device.type == "cuda":
        return torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    if device.type == "mps":
        return torch.float16
    return None


def tiled(model, img, scale: int, tile: int, multiple: int, device, report, overlap: int = 32, half: bool = False):
    """img: 1×3×H×W (any range). Tile by tile with `overlap` px shared between neighbours and
    averaged (fewer seams); the result is gathered on the CPU so a big picture does not fill
    the GPU. `half`: FP16 autocast on a GPU (faster, half the memory)."""
    import contextlib

    import torch

    _, c, h, w = img.shape
    tile = min(tile, h, w)
    tile -= tile % multiple
    overlap = max(0, min(overlap, tile // 2))
    stride = max(multiple, tile - overlap)
    hs = list(range(0, h - tile, stride)) + [h - tile]
    ws = list(range(0, w - tile, stride)) + [w - tile]
    out = torch.zeros(1, c, h * scale, w * scale)
    weight = torch.zeros_like(out)
    total, done = len(hs) * len(ws), 0
    for y in hs:
        for x in ws:
            patch = img[..., y:y + tile, x:x + tile].to(device)
            low = half_dtype(device) if half else None
            with (torch.autocast(device.type, dtype=low) if low is not None else contextlib.nullcontext()):
                res = model(patch)
            res = res.float()
            if low is not None and not torch.isfinite(res).all():
                # Overflowed in half precision: this tile again in FP32
                res = model(patch).float()
            res = res.cpu()
            out[..., y * scale:(y + tile) * scale, x * scale:(x + tile) * scale].add_(res)
            weight[..., y * scale:(y + tile) * scale, x * scale:(x + tile) * scale].add_(1)
            done += 1
            report(done / total)
    return out.div_(weight)


def with_gpu_fallback(device, name, tile, work):
    """work(device, tile) → result; a GPU out of memory halves the tile, then uses the CPU."""
    import torch

    while True:
        try:
            return work(device, tile)
        except RuntimeError as exc:
            text = str(exc).lower()
            if device.type == "cpu" or not any(k in text for k in ("out of memory", "cuda", "mps", "cublas", "cudnn")):
                raise
            if device.type == "cuda":
                torch.cuda.empty_cache()
            if tile > 96:
                tile = max(64, (tile // 2) // 8 * 8)
                _say(f"[sr] GPU memory: retrying with {tile} px tiles")
            else:
                device = torch.device("cpu")
                _say(f"DEVICE cpu {_cpu_name()}")
                tile = 256


# ── SwinIR ──

def swinir_model(task: str, size: str, scale: int):
    from network_swinir import SwinIR as net

    common = dict(upscale=scale, in_chans=3, img_size=64, window_size=8, img_range=1., mlp_ratio=2)
    if task == "classical":
        return net(depths=[6] * 6, embed_dim=180, num_heads=[6] * 6, upsampler="pixelshuffle", resi_connection="1conv", **common), "params"
    if task == "lightweight":
        return net(depths=[6] * 4, embed_dim=60, num_heads=[6] * 4, upsampler="pixelshuffledirect", resi_connection="1conv", **common), "params"
    if task == "real" and size == "L":
        return net(depths=[6] * 9, embed_dim=240, num_heads=[8] * 9, upsampler="nearest+conv", resi_connection="3conv", **common), "params_ema"
    if task == "real":
        return net(depths=[6] * 6, embed_dim=180, num_heads=[6] * 6, upsampler="nearest+conv", resi_connection="1conv", **common), "params_ema"
    raise ValueError(f"unknown SwinIR task {task}")


def run_torch_net(args, build, value_range: float, multiple: int, default_tile: dict):
    """SwinIR and EDSR: a plain image-to-image network, tiled."""
    import numpy as np
    import torch
    from PIL import Image

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    device, name = _pick_device(args.device)
    _say(f"DEVICE {device.type} {name}")
    _say("PROGRESS 2")
    model = build()
    model.eval()
    _say("PROGRESS 8")
    rgb, alpha = load_image(args.input)
    arr = np.asarray(rgb, dtype=np.float32) * (value_range / 255.0)
    h0, w0 = arr.shape[:2]
    img = torch.from_numpy(arr.transpose(2, 0, 1).copy()).unsqueeze(0)
    if multiple > 1:
        # Pad to a multiple of the window (mirrored, as the official SwinIR test does)
        hp, wp = (h0 // multiple + 1) * multiple - h0, (w0 // multiple + 1) * multiple - w0
        img = torch.cat([img, torch.flip(img, [2])], 2)[:, :, :h0 + hp, :]
        img = torch.cat([img, torch.flip(img, [3])], 3)[:, :, :, :w0 + wp]
    report = make_reporter(10, 95)
    tile = args.tile if args.tile and args.tile > 0 else default_tile.get(device.type, 256)

    def work(dev, t):
        model.to(dev)
        return tiled(model, img, args.scale, t, max(multiple, 8), dev, report, args.overlap, args.precision == "fp16")

    with torch.inference_mode():
        out = with_gpu_fallback(device, name, tile, work)
        # (still inside: an in-place op on an inference tensor outside the mode is an error)
        out = out[..., :h0 * args.scale, :w0 * args.scale].squeeze(0).clamp(0, value_range).numpy()
    res = (out.transpose(1, 2, 0) * (255.0 / value_range)).round().astype(np.uint8)
    save_image(Image.fromarray(res, "RGB"), alpha, args.output)
    _say("PROGRESS 100")
    return 0


def run_swinir(args):
    import torch

    def build():
        model, key = swinir_model(args.task, args.size, args.scale)
        state = torch.load(args.model, map_location="cpu", weights_only=True)
        if isinstance(state, dict):
            state = state.get(key, state.get("params", state))
        model.load_state_dict(state, strict=True)
        return model

    return run_torch_net(args, build, 1.0, 8, {"cuda": 512, "mps": 256})


def run_edsr(args):
    import torch
    from edsr import EDSR

    def build():
        model = EDSR(args.scale)
        state = torch.load(args.model, map_location="cpu", weights_only=True)
        missing, unexpected = model.load_state_dict(state, strict=False)
        # The mean shifts are fixed constants; anything else missing means a wrong file
        real = [k for k in list(missing) + list(unexpected) if not k.startswith(("sub_mean", "add_mean"))]
        if real:
            raise RuntimeError(f"EDSR weights do not fit: {real[:4]}")
        return model

    return run_torch_net(args, build, 255.0, 1, {"cuda": 384, "mps": 192, "cpu": 192})


# ── AuraSR ──

def run_aurasr(args):
    import torch
    from aura_sr import AuraSR
    from safetensors.torch import load_file

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    device, name = _pick_device(args.device)
    _say(f"DEVICE {device.type} {name}")
    _say("PROGRESS 2")
    config = json.loads((Path(args.model).parent / "config.json").read_text())
    rgb, alpha = load_image(args.input)
    w, h = rgb.size
    # 64 px tiles; "overlap" seams = a second pass offset by 32 px blended in (cleaner, twice
    # the work), "single" = one pass. Counted for the progress bar.
    size = config.get("input_image_size", 64)
    overlapped = args.seams != "single"
    total = math.ceil(h / size) * math.ceil(w / size)
    if overlapped:
        total += math.ceil((h + size) / size) * math.ceil((w + size) / size)
    batch = args.batch if args.batch and args.batch > 0 else (8 if device.type != "cpu" else 2)
    report = make_reporter(12, 95)

    def work(dev, _tile):
        model = AuraSR(config, device=str(dev))
        model.upsampler.load_state_dict(load_file(args.model, device="cpu"), strict=True)
        model.upsampler.to(dev).eval()
        _say("PROGRESS 10")
        net = model.upsampler
        forward = net.forward
        done = [0]

        def counted(*a, **k):
            res = forward(*a, **k)
            done[0] += res.shape[0]
            report(done[0] / total)
            return res

        net.forward = counted
        low = half_dtype(dev) if args.precision == "fp16" else None
        import contextlib
        with (torch.autocast(dev.type, dtype=low) if low is not None else contextlib.nullcontext()):
            if overlapped:
                return model.upscale_4x_overlapped(rgb, max_batch_size=batch)
            return model.upscale_4x(rgb, max_batch_size=batch)

    with torch.inference_mode():
        out = with_gpu_fallback(device, name, 512, work)
    save_image(out.convert("RGB"), alpha, args.output)
    _say("PROGRESS 100")
    return 0


# ── ESPCN (OpenCV) ──

def run_espcn(args):
    import cv2
    import numpy as np
    from PIL import Image

    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(args.model)
    sr.setModel("espcn", args.scale)
    use_gpu = args.device in ("auto", "gpu") and cv2.ocl.haveOpenCL()
    if args.device == "gpu" and not use_gpu:
        raise RuntimeError("NO_GPU: OpenCL is not available to OpenCV")
    if use_gpu:
        cv2.ocl.setUseOpenCL(True)
        sr.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        sr.setPreferableTarget(cv2.dnn.DNN_TARGET_OPENCL)
        dev = cv2.ocl.Device.getDefault()
        _say(f"DEVICE opencl {dev.name() if dev is not None else 'OpenCL'}")
    else:
        _say(f"DEVICE cpu {_cpu_name()}")
    _say("PROGRESS 10")
    rgb, alpha = load_image(args.input)
    bgr = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    try:
        out = sr.upsample(bgr)
    except cv2.error:
        if not use_gpu:
            raise
        _say(f"DEVICE cpu {_cpu_name()}")
        sr.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        out = sr.upsample(bgr)
    _say("PROGRESS 95")
    save_image(Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)), alpha, args.output)
    _say("PROGRESS 100")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--family", choices=["swinir", "edsr", "aurasr", "espcn"])
    ap.add_argument("--task", choices=["classical", "lightweight", "real"], default="classical")
    ap.add_argument("--size", choices=["S", "M", "L"], default="M")
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--model")
    ap.add_argument("--tile", type=int, default=0)
    ap.add_argument("--device", choices=["auto", "gpu", "cpu"], default="auto")
    ap.add_argument("--overlap", type=int, default=32)
    ap.add_argument("--precision", choices=["fp32", "fp16"], default="fp32")
    ap.add_argument("--batch", type=int, default=0)
    ap.add_argument("--seams", choices=["overlap", "single"], default="overlap")
    ap.add_argument("input", nargs="?")
    ap.add_argument("output", nargs="?")
    args = ap.parse_args()
    if args.probe:
        return probe()
    if not (args.family and args.model and args.input and args.output):
        ap.error("--family, --model, INPUT and OUTPUT are needed")
    try:
        return {"swinir": run_swinir, "edsr": run_edsr, "aurasr": run_aurasr, "espcn": run_espcn}[args.family](args)
    except Exception as exc:  # noqa: BLE001  (the host shows the last lines)
        _say(f"Super-resolution failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
