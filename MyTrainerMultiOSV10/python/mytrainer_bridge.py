"""MyTrainer bridge: lets a PyTorch script talk to the MyTrainer app.

The app starts the script with the environment variable MYTRAINER_RUN_DIR set to a
folder holding the prepared data (meta.json + raw float32 files). The script uses:

    mt.load_data()            -> dict of torch tensors: x_train, y_train, x_val, y_val, x_test, y_test
    mt.device()               -> "cuda", "mps" or "cpu"
    mt.batches(x, y, n, shuffle=False)   -> mini-batches (also handles pause / stop / probes)
    mt.watch(model, loss_fn)  -> weights, gradients and activations for the app
    mt.trace(name, tensor, layout=None)  -> records a layer output (returns the tensor)
    mt.report_batch(epoch, loss) / mt.report_epoch(epoch, logs, lr=None)
    mt.should_stop()          -> True after the user pressed Stop
    mt.finish(model, test_logs) / mt.serve(model)

Messages to the app are single lines on stdout starting with "@@MT "; commands
from the app arrive as JSON lines on stdin. Everything else the script prints is
shown in the app's console. Without the app (no MYTRAINER_RUN_DIR) the functions
still work: data is read from ./mytrainer_data next to the script, if present.
"""
import json
import math
import os
import queue
import sys
import threading
import time
import traceback

import numpy as np
import torch

_PREFIX = "@@MT "
_state = {
    "model": None,
    "loss_fn": None,
    "data": None,
    "meta": {},
    "capture": None,
    "stop": False,
    "paused": False,
    "step": False,
    "epoch": 0,
    "last_batch": 0.0,
    "started": time.time(),
    "history": [],
    "probe": None,
}
_commands = queue.Queue()
_lock = threading.Lock()
MAX_VALUES = 300_000


def _send(kind, **data):
    line = _PREFIX + json.dumps({"type": kind, **data}, default=_json_default, allow_nan=False)
    with _lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def _json_default(value):
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, torch.Tensor):
        return value.detach().cpu().tolist()
    return str(value)


def _finite(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _read_stdin():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            _commands.put(json.loads(line))
        except json.JSONDecodeError:
            pass
    _commands.put({"cmd": "exit"})


def _run_dir():
    path = os.environ.get("MYTRAINER_RUN_DIR")
    if path:
        return path
    here = os.path.dirname(os.path.abspath(sys.argv[0] or "."))
    return os.path.join(here, "mytrainer_data")


if os.environ.get("MYTRAINER_RUN_DIR"):
    threading.Thread(target=_read_stdin, daemon=True).start()


# ───────────────────────── data

def load_data():
    """The data MyTrainer prepared (after preprocessing and splitting), as torch tensors."""
    folder = _run_dir()
    with open(os.path.join(folder, "meta.json"), encoding="utf-8") as handle:
        meta = json.load(handle)
    _state["meta"] = meta
    task = meta["task"]
    data = {"info": meta}
    for part in ("train", "val", "test"):
        info = meta["parts"][part]
        n = info["n"]
        x = np.fromfile(os.path.join(folder, f"x_{part}.f32"), dtype="<f4").reshape([n] + meta["input_shape"]) if n else np.zeros([0] + meta["input_shape"], dtype=np.float32)
        y = np.fromfile(os.path.join(folder, f"y_{part}.f32"), dtype="<f4") if n else np.zeros([0], dtype=np.float32)
        if task["kind"] == "classification":
            if task.get("binaryOutput") == 1 and task["classes"] == 2:
                yt = torch.from_numpy(y.reshape(n, 1).copy())
            else:
                yt = torch.from_numpy(y.astype(np.int64))
        else:
            yt = torch.from_numpy(y.reshape([n] + task["outputShape"]).copy())
        data[f"x_{part}"] = torch.from_numpy(x.copy())
        data[f"y_{part}"] = yt
    _state["data"] = data
    probe = meta.get("probe")
    if probe is not None:
        _state["probe"] = torch.tensor(probe, dtype=torch.float32).reshape([1] + meta["input_shape"])
    return data


def device():
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def batches(x, y, batch_size, shuffle=False):
    """Mini-batches of (x, y). Between batches the app's commands (pause, stop, probe) are handled."""
    n = len(x)
    order = torch.randperm(n) if shuffle else torch.arange(n)
    for start in range(0, n, batch_size):
        _poll()
        if _state["stop"]:
            return
        index = order[start:start + batch_size]
        yield x[index], y[index]


def should_stop():
    _poll()
    return _state["stop"]


def _poll():
    """Handles waiting commands; while paused, waits here until Resume, Step or Stop."""
    while True:
        waiting = _state["paused"] and not _state["stop"]
        try:
            command = _commands.get(timeout=0.2) if waiting else _commands.get_nowait()
        except queue.Empty:
            if waiting:
                continue
            return
        _handle(command)


def _handle(command):
    kind = command.get("cmd")
    if kind == "stop" or kind == "exit":
        _state["stop"] = True
        _state["paused"] = False
        if kind == "exit":
            _state["exit"] = True
    elif kind == "pause":
        _state["paused"] = True
        _send("status", state="paused")
    elif kind == "resume":
        _state["paused"] = False
        _state["step"] = False
        _send("status", state="training")
    elif kind == "step":
        _state["paused"] = False
        _state["step"] = True
    elif kind == "probe":
        x = command.get("x")
        if x is not None:
            _state["probe"] = torch.tensor(x, dtype=torch.float32).reshape([1] + _state["meta"]["input_shape"])
        snapshot(reason=command.get("reason", "probe"), label=command.get("label"))
    elif kind == "predict":
        _predict(command)
    elif kind == "evaluate":
        _evaluate_test()
    elif kind == "weights":
        _send_weights(command.get("requestId"))


# ───────────────────────── visualization hooks

def trace(name, tensor, layout=None):
    """Records a layer's output while MyTrainer takes a snapshot. Returns the tensor unchanged."""
    capture = _state["capture"]
    if capture is not None and isinstance(tensor, torch.Tensor):
        value = tensor.detach()
        if layout == "nchw" and value.dim() == 4:
            value = value.permute(0, 2, 3, 1)
        elif layout == "ncl" and value.dim() == 3:
            value = value.transpose(1, 2)
        capture[name] = value[0].float().cpu().contiguous()
    return tensor


def watch(model, loss_fn=None):
    """Remembers the model (and loss) so snapshots can include weights and gradients."""
    _state["model"] = model
    _state["loss_fn"] = loss_fn
    _send("hello", torch=torch.__version__, python=sys.version.split()[0], device=device(), params=sum(p.numel() for p in model.parameters()))
    # The untrained network, so the app can show the start of training too.
    if _state["data"] is not None and _state["probe"] is not None:
        snapshot("epoch")


def _info(values):
    array = values.detach().float().cpu().numpy()
    flat = array.reshape(-1)
    if flat.size <= MAX_VALUES:
        return {"shape": list(array.shape), "data": [float(v) for v in flat]}
    return {"shape": list(array.shape), "data": None, "stats": _histogram(flat)}


def _histogram(flat, bins=30):
    flat = np.asarray(flat, dtype=np.float64).reshape(-1)
    if flat.size == 0:
        return {"min": 0, "max": 0, "mean": 0, "std": 0, "counts": [0] * bins}
    low, high = float(flat.min()), float(flat.max())
    counts, _ = np.histogram(flat, bins=bins, range=(low, high if high > low else low + 1))
    return {"min": low, "max": high, "mean": float(flat.mean()), "std": float(flat.std()), "counts": counts.tolist()}


def _canonical(module):
    """Weights with the same names and layouts as the TensorFlow.js engine (channels-last kernels)."""
    nn = torch.nn
    out = {}
    kind = type(module).__name__
    if kind == "TokenPositionEmbedding":
        out["embeddings"], out["positions"] = module.embeddings.weight, module.positions
    elif kind == "SelfAttention":
        for part in ("query", "key", "value", "output"):
            linear = getattr(module, part)
            out[part], out[part + "Bias"] = linear.weight.t(), linear.bias
    elif isinstance(module, nn.Conv2d) and module.groups > 1 and module.groups == module.in_channels:
        # Depthwise: (C·m, 1, kh, kw) → TensorFlow.js (kh, kw, C, m).
        c, m = module.in_channels, module.out_channels // module.in_channels
        kh, kw = module.kernel_size
        out["kernel"] = module.weight.reshape(c, m, kh, kw).permute(2, 3, 0, 1)
        if module.bias is not None:
            out["bias"] = module.bias
    elif isinstance(module, nn.Linear):
        out["kernel"] = module.weight.t()
        if module.bias is not None:
            out["bias"] = module.bias
    elif isinstance(module, nn.Conv2d):
        out["kernel"] = module.weight.permute(2, 3, 1, 0)
        if module.bias is not None:
            out["bias"] = module.bias
    elif isinstance(module, nn.Conv1d):
        out["kernel"] = module.weight.permute(2, 1, 0)
        if module.bias is not None:
            out["bias"] = module.bias
    elif isinstance(module, (nn.BatchNorm1d, nn.BatchNorm2d)):
        out["gamma"], out["beta"] = module.weight, module.bias
        out["movingMean"], out["movingVariance"] = module.running_mean, module.running_var
    elif isinstance(module, nn.LayerNorm):
        out["gamma"], out["beta"] = module.weight, module.bias
    elif isinstance(module, nn.Embedding):
        out["embeddings"] = module.weight
    elif isinstance(module, (nn.RNN, nn.LSTM)):
        out["kernel"] = module.weight_ih_l0.t()
        out["recurrentKernel"] = module.weight_hh_l0.t()
        out["bias"] = module.bias_ih_l0 + module.bias_hh_l0
    elif isinstance(module, nn.GRU):
        # PyTorch gate order r, z, n → Keras order z, r, h; PyTorch applies the reset gate after the matrix product.
        u = module.hidden_size

        def reorder(w):
            return torch.cat([w[u:2 * u], w[:u], w[2 * u:]], dim=0)
        out["kernel"] = reorder(module.weight_ih_l0).t()
        out["recurrentKernel"] = reorder(module.weight_hh_l0).t()
        out["bias"] = reorder(module.bias_ih_l0)
        out["recurrentBias"] = reorder(module.bias_hh_l0)
    return {key: value.detach() for key, value in out.items()}


def _send_weights(request_id):
    """Every layer's trained weights in full (the C / ONNX export), by module name."""
    model = _state["model"]
    nodes = {}
    if model is not None:
        for name, module in model.named_children():
            weights = _canonical(module)
            if weights:
                nodes[name] = {key: {"shape": list(value.shape), "data": [float(v) for v in value.float().cpu().numpy().reshape(-1)]} for key, value in weights.items()}
                if isinstance(module, torch.nn.GRU):
                    nodes[name]["resetAfter"] = True
    _send("weights", requestId=request_id, nodes=nodes)


def _gradients(model):
    data = _state["data"]
    loss_fn = _state["loss_fn"]
    if data is None or loss_fn is None or len(data["x_train"]) == 0:
        return {}
    dev = next(model.parameters()).device if any(True for _ in model.parameters()) else "cpu"
    was_training = model.training
    # A training-mode pass updates batch normalization's running statistics: keep them as they were.
    kept = [(buffer, buffer.detach().clone()) for name, buffer in model.named_buffers() if "running_" in name or "num_batches" in name]
    model.train()
    model.zero_grad(set_to_none=True)
    try:
        xb = data["x_train"][:64].to(dev)
        yb = data["y_train"][:64].to(dev)
        loss = loss_fn(model(xb), yb)
        loss.backward()
    except Exception as error:  # noqa: BLE001 — a failing gradient pass must not stop training
        _send("log", level="warning", code="train.gradFailed", params={"message": str(error)})
        return {}
    finally:
        model.train(was_training)
        with torch.no_grad():
            for buffer, value in kept:
                buffer.copy_(value)
    out = {}
    for name, module in model.named_children():
        weights = _canonical_grads(module)
        if weights:
            out[name] = weights
    model.zero_grad(set_to_none=True)
    return out


def _canonical_grads(module):
    params = list(module.parameters(recurse=False))
    if not params or all(p.grad is None for p in params):
        return {}
    swapped = {}
    for p in params:
        swapped[p] = p.data
        p.data = p.grad if p.grad is not None else torch.zeros_like(p)
    try:
        grads = _canonical(module)
    finally:
        for p, original in swapped.items():
            p.data = original
    result = {}
    for key, value in grads.items():
        if key in ("movingMean", "movingVariance"):
            continue
        flat = value.float().cpu().reshape(-1)
        entry = {"meanAbs": float(flat.abs().mean()) if flat.numel() else 0.0}
        if flat.numel() <= 20000:
            entry["shape"] = list(value.shape)
            entry["data"] = [float(v) for v in flat]
        result[key] = entry
    return result


def snapshot(reason="epoch", label=None):
    """Sends every traced activation of the probe input, plus weights and gradients."""
    model = _state["model"]
    probe = _state["probe"]
    if model is None or probe is None:
        return
    dev = next(model.parameters()).device if any(True for _ in model.parameters()) else "cpu"
    grads = _gradients(model)
    was_training = model.training
    model.eval()
    _state["capture"] = {}
    try:
        with torch.no_grad():
            model(probe.to(dev))
    except Exception as error:  # noqa: BLE001
        _send("log", level="warning", code="train.probeFailed", params={"message": str(error)})
    captured = _state["capture"] or {}
    _state["capture"] = None
    model.train(was_training)
    nodes = {}
    for name, value in captured.items():
        nodes[name] = {"act": _info(value)}
    for name, module in model.named_children():
        weights = _canonical(module)
        if not weights:
            continue
        entry = nodes.setdefault(name, {})
        entry["weights"] = {key: _info(value) for key, value in weights.items()}
        entry["stats"] = {key: _histogram(value.float().cpu().numpy()) for key, value in weights.items()}
        if isinstance(module, torch.nn.GRU):
            entry["resetAfter"] = True
        if name in grads:
            entry["grads"] = grads[name]
    _send("snapshot", reason=reason, epoch=_state["epoch"], byName=True, label=label,
          input={"shape": _state["meta"].get("input_shape"), "data": [float(v) for v in probe.reshape(-1)]}, nodes=nodes)
    _extras(model, dev)


def _extras(model, dev):
    """Decision boundary (2-D points) or fitted curve (1-D functions), like the TensorFlow.js engine."""
    meta = _state["meta"]
    data = _state["data"]
    if data is None:
        return
    x = data["x_train"]
    was_training = model.training
    model.eval()
    try:
        with torch.no_grad():
            if meta.get("kind") == "points2d" and list(x.shape[1:]) == [2]:
                low, high = x.min(dim=0).values, x.max(dim=0).values
                pad = (high - low) * 0.1
                low, high = low - pad, high + pad
                grid = 48
                gx = low[0] + (torch.arange(grid) + 0.5) / grid * (high[0] - low[0])
                gy = high[1] - (torch.arange(grid) + 0.5) / grid * (high[1] - low[1])
                yy, xx = torch.meshgrid(gy, gx, indexing="ij")
                points = torch.stack([xx.reshape(-1), yy.reshape(-1)], dim=1)
                values = model(points.to(dev)).float().cpu().reshape(grid * grid, -1)
                _send("boundary", grid=grid, bounds={"minX": float(low[0]), "maxX": float(high[0]), "minY": float(low[1]), "maxY": float(high[1])},
                      outputs=values.shape[1], values=[float(v) for v in values.reshape(-1)])
            elif meta.get("kind") == "function1d" and list(x.shape[1:]) == [1]:
                xs = torch.linspace(float(x.min()), float(x.max()), 160).reshape(-1, 1)
                ys = model(xs.to(dev)).float().cpu().reshape(-1)
                _send("curve", xs=[float(v) for v in xs.reshape(-1)], ys=[float(v) for v in ys])
    finally:
        model.train(was_training)


# ───────────────────────── progress

def report_batch(epoch, loss):
    now = time.time()
    _state["epoch"] = epoch
    if _state["step"]:
        _state["step"] = False
        _state["paused"] = True
        _send("status", state="paused", step=True)
    if now - _state["last_batch"] > 0.12:
        _state["last_batch"] = now
        _send("batch", epoch=epoch, loss=_finite(loss))


def report_epoch(epoch, logs, lr=None):
    """One finished epoch. Takes a snapshot every 'snapshot_every' epochs (MyTrainer's setting)."""
    entry = {
        "epoch": epoch + 1,
        "loss": _finite(logs.get("loss")),
        "acc": _finite(logs.get("acc")),
        "valLoss": _finite(logs.get("val_loss")),
        "valAcc": _finite(logs.get("val_acc")),
        "lr": _finite(lr),
        "time": int((time.time() - _state["started"]) * 1000),
    }
    _state["epoch"] = epoch + 1
    _state["history"].append(entry)
    _send("epoch", epochs=_state["meta"].get("epochs"), **entry)
    every = int(_state["meta"].get("snapshot_every", 1) or 1)
    if (epoch + 1) % every == 0:
        snapshot("epoch")


def finish(model, test_logs=None):
    """End of training: test predictions for the confusion matrix and error views."""
    _state["model"] = model
    evaluation = _evaluate_test(test_logs)
    _send("done", epochs=_state["epoch"], stopped=_state["stop"], history=_state["history"], evaluation=evaluation,
          time=int((time.time() - _state["started"]) * 1000))


def _evaluate_test(test_logs=None):
    model = _state["model"]
    data = _state["data"]
    if model is None or data is None:
        return None
    part = "test" if len(data["x_test"]) else "val"
    x = data[f"x_{part}"]
    if len(x) == 0:
        return None
    dev = next(model.parameters()).device if any(True for _ in model.parameters()) else "cpu"
    was_training = model.training
    model.eval()
    outputs = []
    with torch.no_grad():
        for start in range(0, len(x), 256):
            outputs.append(model(x[start:start + 256].to(dev)).float().cpu().reshape(len(x[start:start + 256]), -1))
    model.train(was_training)
    predictions = torch.cat(outputs, dim=0)
    logs = test_logs or {}
    summary = {"loss": _finite(logs.get("loss")), "acc": _finite(logs.get("acc")), "n": len(x), "part": part}
    y = data[f"y_{part}"].float().reshape(-1)
    _send("evaluation", summary=summary, predictions=[float(v) for v in predictions.reshape(-1)], targets=[float(v) for v in y],
          index=_state["meta"]["parts"][part].get("index", []), outputs=predictions.shape[1])
    return summary


def _predict(command):
    model = _state["model"]
    if model is None:
        return
    dev = next(model.parameters()).device if any(True for _ in model.parameters()) else "cpu"
    n = int(command.get("n", 1))
    x = torch.tensor(command["x"], dtype=torch.float32).reshape([n] + _state["meta"]["input_shape"])
    was_training = model.training
    model.eval()
    with torch.no_grad():
        values = model(x.to(dev)).float().cpu().reshape(-1)
    model.train(was_training)
    _send("prediction", requestId=command.get("requestId"), n=n, values=[float(v) for v in values])


def serve(model):
    """After training: answers the app's probes and predictions until it stops the run."""
    _state["model"] = model
    _state["stop"] = False
    _send("status", state="serving")
    if not os.environ.get("MYTRAINER_RUN_DIR"):
        return
    while not _state.get("exit"):
        try:
            command = _commands.get(timeout=0.5)
        except queue.Empty:
            continue
        if command.get("cmd") in ("stop", "exit"):
            break
        try:
            _handle(command)
        except Exception as error:  # noqa: BLE001
            _send("error", message=str(error), stack=traceback.format_exc())


def _excepthook(kind, value, tb):
    _send("error", message=f"{kind.__name__}: {value}", stack="".join(traceback.format_exception(kind, value, tb)))
    sys.__excepthook__(kind, value, tb)


if os.environ.get("MYTRAINER_RUN_DIR"):
    sys.excepthook = _excepthook
