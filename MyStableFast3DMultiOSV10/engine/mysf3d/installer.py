"""First-run installation, run by the engine inside its own virtual environment.

The common part, needed by every model:

  torch     PyTorch and torchvision — the CUDA build when an NVIDIA GPU is
            present, the CPU build otherwise, the default build on macOS
  packages  the libraries the models import
  optional  the remeshing libraries; failing here only disables remeshing
  bgmodel   the background-removal model (rembg, u2net)

Then, per model, the first time it is used (see models/):

  source    the model's code at a fixed commit, from GitHub
  weights   the weights from Hugging Face (some are gated: a token may be needed)
  verify    imports the model once

Finished steps are recorded in <home>/install-state.json, so an interrupted
installation continues where it stopped. Packages go in with `uv pip install`
into this interpreter's own environment.
"""

import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

# Bump when the steps or the pins below change: an older installation is then
# redone from the start.
RECIPE = 2

TORCH_BUILDS = {
    "cuda": {"torch": "2.8.0", "torchvision": "0.23.0", "index": "https://download.pytorch.org/whl/cu128"},
    "cpu": {"torch": "2.8.0", "torchvision": "0.23.0", "index": "https://download.pytorch.org/whl/cpu"},
    # PyPI's own wheels: MPS on Apple silicon, CPU on Linux ARM.
    "default": {"torch": "2.8.0", "torchvision": "0.23.0", "index": None},
    # The last PyTorch with Intel-Mac wheels.
    "mac-intel": {"torch": "2.2.2", "torchvision": "0.17.2", "index": None},
}

PACKAGES = [
    "einops==0.7.0",
    "jaxtyping==0.2.31",
    "omegaconf==2.3.0",
    "transformers==4.42.3",
    "open_clip_torch==2.24.0",
    "trimesh==4.4.1",
    "numpy==1.26.4",
    "huggingface-hub==0.23.4",
    "rembg==2.0.57",
    "onnxruntime",
    "scikit-image",
    "safetensors",
    "pillow",
]
OPTIONAL_PACKAGES = ["gpytoolbox==0.2.0", "pynanoinstantmeshes==0.0.3"]

BASE_STEPS = ["torch", "packages", "optional", "bgmodel"]
MODEL_STEPS = ["source", "weights", "verify"]


class NeedsToken(Exception):
    """The weights are gated and no (valid) Hugging Face token was given."""


class Cancelled(Exception):
    pass


def detect_gpu():
    """The NVIDIA GPU's name from nvidia-smi, or '' when there is none.
    Needs no Python packages, so it works before PyTorch is installed."""
    exe = shutil.which("nvidia-smi")
    if not exe and os.name == "nt":
        candidate = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvidia-smi.exe")
        exe = candidate if os.path.isfile(candidate) else None
    if not exe:
        return ""
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=15, **no_window(),
        )
    except Exception:
        return ""
    if out.returncode != 0 or not out.stdout.strip():
        return ""
    return out.stdout.strip().splitlines()[0].strip()


def torch_build(system=None, machine=None, gpu=None):
    """Which PyTorch build this machine gets (a key of TORCH_BUILDS)."""
    system = system or platform.system()
    machine = (machine or platform.machine()).lower()
    if system == "Darwin":
        return "default" if machine in ("arm64", "aarch64") else "mac-intel"
    if machine in ("arm64", "aarch64"):
        return "default"
    if gpu is None:
        gpu = detect_gpu()
    return "cuda" if gpu else "cpu"


def no_window():
    if os.name == "nt":
        return {"creationflags": 0x08000000}  # CREATE_NO_WINDOW
    return {}


class Installer:
    def __init__(self, home, uv, log, on_progress=None):
        self.home = home
        self.uv = uv
        self.log = log
        self.on_progress = on_progress or (lambda **_: None)
        self.state_path = os.path.join(home, "install-state.json")
        self.cancelled = False

    # ── State ─────────────────────────────────────────────
    def read_state(self):
        try:
            with open(self.state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            return state if isinstance(state, dict) else {}
        except Exception:
            return {}

    def write_state(self, state):
        os.makedirs(self.home, exist_ok=True)
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, self.state_path)

    def current_state(self):
        """The saved state when it belongs to this recipe, else a fresh one."""
        state = self.read_state()
        if state.get("recipe") != RECIPE:
            return {"recipe": RECIPE, "done": [], "models": {}}
        state.setdefault("done", [])
        state.setdefault("models", {})
        return state

    def base_complete(self):
        state = self.current_state()
        return all(step in state["done"] for step in BASE_STEPS)

    def model_state(self, model_id):
        return self.current_state()["models"].get(model_id, {"done": []})

    def model_complete(self, model_id):
        done = self.model_state(model_id).get("done", [])
        return all(step in done for step in MODEL_STEPS)

    def reset(self):
        try:
            os.remove(self.state_path)
        except FileNotFoundError:
            pass

    # ── Tokens ────────────────────────────────────────────
    def token(self):
        """The token saved from the app's settings, else HF_TOKEN; None lets
        huggingface_hub fall back to the user's own `huggingface-cli login`."""
        try:
            with open(os.path.join(self.home, "hf-token"), "r", encoding="utf-8") as f:
                saved = f.read().strip()
            if saved:
                return saved
        except FileNotFoundError:
            pass
        return os.environ.get("HF_TOKEN") or None

    def has_token(self):
        return bool(self.token())

    def save_token(self, token):
        path = os.path.join(self.home, "hf-token")
        token = (token or "").strip()
        if not token:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
            return
        os.makedirs(self.home, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(token)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    # ── Running ───────────────────────────────────────────
    def _run_steps(self, steps, done, label, record):
        for i, step in enumerate(steps):
            if self.cancelled:
                raise Cancelled()
            if step in done:
                continue
            self.on_progress(step=f"{label}{step}", index=i, total=len(steps), fraction=None)
            started = time.time()
            self.log.info(f"[{label}{i + 1}/{len(steps)}] {step} …")
            result = record(step)
            done.append(step)
            self.log.info(f"[{label}{i + 1}/{len(steps)}] {step} done ({time.time() - started:.0f} s)")
            yield step, result

    def install_base(self):
        state = self.current_state()
        gpu = detect_gpu()
        build = torch_build(gpu=gpu)
        if state.get("build") and state["build"] != build:
            self.log.info(f"PyTorch build changes from {state['build']} to {build}; installing it again.")
            state["done"] = [s for s in state["done"] if s != "torch"]
            for m in state["models"].values():
                m["done"] = [s for s in m.get("done", []) if s != "verify"]
        state["build"] = build
        state["gpu"] = gpu
        self.write_state(state)
        if all(step in state["done"] for step in BASE_STEPS):
            return state
        self.log.info(
            f"Installing into {sys.prefix} — Python {platform.python_version()}, "
            f"{platform.system()} {platform.machine()}, "
            + (f"GPU: {gpu}" if gpu else "no NVIDIA GPU (the CPU build of PyTorch is used)")
        )
        for step, result in self._run_steps(
            BASE_STEPS, state["done"], "", lambda step: getattr(self, f"step_{step}")(state)
        ):
            if isinstance(result, dict):
                state.update(result)
            self.write_state(state)
        self.on_progress(step="done", fraction=1.0)
        return state

    def install_model(self, spec):
        """Installs one model (see models/). Raises NeedsToken for a gated
        model without a usable token."""
        state = self.current_state()
        entry = state["models"].setdefault(spec.id, {"done": []})
        if entry.get("commit") and entry["commit"] != spec.commit:
            entry["done"] = []
        if all(step in entry["done"] for step in MODEL_STEPS):
            return entry
        self.log.info(f"Installing the model {spec.name} …")
        for step, result in self._run_steps(
            MODEL_STEPS, entry["done"], f"{spec.id} ", lambda step: getattr(self, f"model_{step}")(spec, entry)
        ):
            if isinstance(result, dict):
                entry.update(result)
            state["models"][spec.id] = entry
            self.write_state(state)
        self.on_progress(step="done", fraction=1.0)
        return entry

    def pip(self, args, check=True):
        """uv pip install … into this interpreter, its output into the log."""
        cmd = [self.uv, "pip", "install", "--python", sys.executable, *args]
        env = dict(os.environ)
        env.setdefault("UV_HTTP_TIMEOUT", "600")
        env["UV_NO_PROGRESS"] = "1"
        env["NO_COLOR"] = "1"
        self.log.info("$ uv pip install " + " ".join(args), src="uv")
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
            text=True, encoding="utf-8", errors="replace", bufsize=1, **no_window(),
        )
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                self.log.info(line, src="uv")
            if self.cancelled:
                proc.kill()
        code = proc.wait()
        if self.cancelled:
            raise Cancelled()
        if code != 0 and check:
            raise RuntimeError(f"uv pip install failed (exit code {code}); see the log above.")
        return code

    def constraints_file(self, state):
        build = TORCH_BUILDS[state["build"]]
        path = os.path.join(self.home, "constraints.txt")
        # The pinned base packages too, so a model's own packages cannot
        # upgrade what the other models were set up with.
        pinned = [p for p in PACKAGES if "==" in p and not p.startswith("numpy")]
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"torch=={build['torch']}\ntorchvision=={build['torchvision']}\nnumpy==1.26.4\n")
            f.write("".join(f"{p}\n" for p in pinned))
        return path

    # ── Base steps ────────────────────────────────────────
    def step_torch(self, state):
        build = TORCH_BUILDS[state["build"]]
        args = [f"torch=={build['torch']}", f"torchvision=={build['torchvision']}", "numpy==1.26.4"]
        if build["index"]:
            # torch itself from the PyTorch index (its +cu / +cpu builds sort
            # above PyPI's plain version), everything else from PyPI.
            args += ["--index-url", build["index"], "--extra-index-url", "https://pypi.org/simple",
                     "--index-strategy", "unsafe-best-match"]
        args += ["--reinstall-package", "torch", "--reinstall-package", "torchvision"]
        self.pip(args)

    def step_packages(self, state):
        self.pip([*PACKAGES, "--constraint", self.constraints_file(state)])

    def step_optional(self, state):
        code = self.pip([*OPTIONAL_PACKAGES, "--constraint", self.constraints_file(state)], check=False)
        if code != 0:
            self.log.warn("The remeshing libraries could not be installed; conversion works, remeshing is off.")
        return {"remesh": code == 0}

    def step_bgmodel(self, state):
        u2net = os.path.join(self.home, "u2net")
        os.environ["U2NET_HOME"] = u2net
        os.makedirs(u2net, exist_ok=True)
        import rembg  # noqa: WPS433 — installed by an earlier step

        self.log.info("Loading the background-removal model (u2net, downloaded once) …")
        rembg.new_session("u2net")

    # ── Model steps ───────────────────────────────────────
    def model_source(self, spec, entry):
        result = self._model_source_files(spec)
        # Packages only this model needs (installed here, so models set up
        # before there were any stay complete).
        if spec.packages:
            self.log.info(f"Packages for {spec.name}: {' '.join(spec.packages)}")
            self.pip([*spec.packages, "--constraint", self.constraints_file(self.current_state())])
        return result

    def _model_source_files(self, spec):
        target = spec.source_dir(self.home)
        marker = os.path.join(target, ".mysf3d-commit")
        # Versions of one model share their code: downloaded once.
        if os.path.isfile(os.path.join(target, spec.check_file)) and os.path.isfile(marker):
            with open(marker, encoding="utf-8") as f:
                if f.read().strip() == spec.commit:
                    self.log.info(f"{spec.name} source already here ({spec.commit[:10]}).")
                    return {"commit": spec.commit}
        self.log.info(f"Downloading the {spec.name} source ({spec.commit[:10]}) …")
        with tempfile.TemporaryDirectory(dir=self.home) as tmp:
            archive = os.path.join(tmp, "src.zip")
            self.download(spec.source_zip, archive)
            with zipfile.ZipFile(archive) as z:
                z.extractall(tmp)
            roots = [d for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d))]
            if len(roots) != 1:
                raise RuntimeError(f"The {spec.name} archive has an unexpected layout.")
            if os.path.isdir(target):
                shutil.rmtree(target)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.move(os.path.join(tmp, roots[0]), target)
        if not os.path.isfile(os.path.join(target, spec.check_file)):
            raise RuntimeError(f"The {spec.name} source is incomplete.")
        with open(marker, "w", encoding="utf-8") as f:
            f.write(spec.commit)
        return {"commit": spec.commit}

    def model_weights(self, spec, entry):
        local = self.find_weights(spec)
        if local:
            self.log.info(f"{spec.name} weights found: {local}")
        else:
            self.log.info(f"Downloading the {spec.name} weights from {spec.page} ({spec.size_label}) …")
            local = self.download_weights(spec)
        for repo, name in spec.extra_files:
            self._hub_download(spec, repo, name)
        return {"weights": local}

    def model_verify(self, spec, entry):
        import torch  # noqa: WPS433

        cuda = torch.cuda.is_available()
        mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
        name = torch.cuda.get_device_name(0) if cuda else ("Apple GPU (MPS)" if mps else "CPU")
        self.log.info(f"PyTorch {torch.__version__}; CUDA {'yes' if cuda else 'no'}, MPS {'yes' if mps else 'no'}; device: {name}")
        spec.prepare(self.home)
        spec.import_check()
        return {"torch": torch.__version__}

    # ── Weights ───────────────────────────────────────────
    def find_weights(self, spec):
        """The folder holding the model's files when they are already in the
        Hugging Face cache (no network needed), else ''."""
        try:
            from huggingface_hub import hf_hub_download
        except ImportError:
            return ""
        paths = []
        for name in spec.files:
            try:
                paths.append(hf_hub_download(spec.repo, name, local_files_only=True))
            except Exception:
                return ""
        return os.path.dirname(paths[-1])

    def download_weights(self, spec):
        paths = [self._hub_download(spec, spec.repo, name) for name in spec.files]
        return os.path.dirname(paths[-1])

    def _hub_download(self, spec, repo, name):
        import huggingface_hub
        from huggingface_hub import hf_hub_download
        from huggingface_hub.utils import GatedRepoError, RepositoryNotFoundError, HfHubHTTPError

        try:
            return hf_hub_download(repo, name, local_files_only=True)
        except Exception:
            pass
        self._hook_hub_progress(huggingface_hub)
        try:
            return hf_hub_download(repo, name, token=self.token())
        except (GatedRepoError, RepositoryNotFoundError) as e:
            raise NeedsToken(f"{spec.name}: {str(e).splitlines()[0]}") from e
        except HfHubHTTPError as e:
            status = getattr(getattr(e, "response", None), "status_code", 0)
            if status in (401, 403):
                raise NeedsToken(f"{spec.name}: {str(e).splitlines()[0]}") from e
            raise

    def _hook_hub_progress(self, hub):
        """huggingface_hub reports downloads through tqdm; a subclass passes
        the byte counts on to the app's progress bar."""
        module = getattr(hub, "file_download", None)
        base = getattr(module, "tqdm", None)
        if module is None or base is None or getattr(base, "_mysf3d", False):
            return
        installer = self

        class Progress(base):
            _mysf3d = True

            def update(self, n=1):
                out = super().update(n)
                # Counted here: without a terminal the bar is disabled, and a
                # disabled tqdm never moves its own count (stuck at 0 %).
                self._mysf3d_done = getattr(self, "_mysf3d_done", 0) + (n or 0)
                total = self.total or 0
                if total:
                    done = max(self._mysf3d_done, self.n or 0)
                    installer.on_progress(fraction=min(1.0, done / total), done=done, size=total)
                if installer.cancelled:
                    raise Cancelled()
                return out

        module.tqdm = Progress

    # ── Downloads ─────────────────────────────────────────
    def download(self, url, dest):
        req = urllib.request.Request(url, headers={"User-Agent": "MyStableFast3D"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            done = 0
            while True:
                chunk = resp.read(1 << 16)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if self.cancelled:
                    raise Cancelled()
                if total:
                    self.on_progress(fraction=done / total, done=done, size=total)
