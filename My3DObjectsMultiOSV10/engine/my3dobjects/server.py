"""The engine's HTTP API (standard library only, so it starts before anything
is installed).

  GET  /api/health                  state, install progress, device, models
  GET  /api/logs?after=<seq>        log lines after <seq>
  GET  /api/models                  the models and whether each is installed
  POST /api/config                  {"hfToken", "device": auto|gpu|cpu, "model": id}
  POST /api/models/<id>/install     install (and load) a model now
  POST /api/install/retry           try again after a failure or a new token
  POST /api/reinstall               forget the installation and restart (exit 75)
  POST /api/jobs?model=…&<options>  body: the image file → {"id": …}
  GET  /api/jobs                    recent jobs
  GET  /api/jobs/<id>               a job's state and progress
  POST /api/jobs/<id>/cancel
  GET  /api/jobs/<id>/result.glb    the model (also input.png, result-obj.zip)

It listens on 127.0.0.1 unless told otherwise, and answers any origin (the
desktop page and a web page served elsewhere both call it).
"""

import argparse
import json
import os
import platform
import queue
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import __version__
from .logbuf import LogBuffer, install_tee

MAX_UPLOAD = 64 * 1024 * 1024
KEEP_JOBS = 12
RESTART_EXIT_CODE = 75


def first_line(err):
    text = str(err)
    return text.splitlines()[0] if text else err.__class__.__name__


class Service:
    def __init__(self, home, uv, log, autostart=True):
        from . import models

        self.home = home
        self.uv = uv
        self.log = log
        self.models = models
        self.state = "starting"          # starting | installing | install-failed | ready
        self.error = ""
        self.install = {"step": "", "index": 0, "total": 0, "fraction": None, "done": 0, "size": 0}
        self.model_status = {m.id: {"status": "unknown", "error": ""} for m in models.MODELS}
        self.engine = None
        self.device_pref = "auto"
        self.selected = models.DEFAULT_MODEL
        self.accepted_licenses = set()   # model families whose license limits were accepted
        self.jobs = {}
        self.order = []
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        self.model_lock = threading.RLock()
        self.refine_lock = threading.Lock()  # one surface refine at a time
        self.installer = None
        self.base_state = {}
        self.started = time.time()
        self.wake = threading.Event()
        self._load_prefs()
        if autostart:
            threading.Thread(target=self._bring_up, name="bring-up", daemon=True).start()
            threading.Thread(target=self._worker, name="worker", daemon=True).start()

    # ── Preferences ───────────────────────────────────────
    def _prefs_path(self):
        return os.path.join(self.home, "engine-prefs.json")

    def _load_prefs(self):
        try:
            with open(self._prefs_path(), "r", encoding="utf-8") as f:
                prefs = json.load(f)
            if prefs.get("device") in ("auto", "gpu", "cpu"):
                self.device_pref = prefs["device"]
            if self.models.get(prefs.get("model")):
                self.selected = prefs["model"]
            self.accepted_licenses = set(str(x) for x in prefs.get("acceptedLicenses") or [])
        except Exception:
            pass

    def _save_prefs(self):
        try:
            with open(self._prefs_path(), "w", encoding="utf-8") as f:
                json.dump({"device": self.device_pref, "model": self.selected,
                           "acceptedLicenses": sorted(self.accepted_licenses)}, f)
        except Exception:
            pass

    def _torch_pref(self):
        return "cpu" if self.device_pref == "cpu" else "auto"

    # ── Install the common part, then the selected model ──
    def _bring_up(self):
        from .installer import Installer, Cancelled as InstallCancelled

        self.installer = Installer(self.home, self.uv, self.log, on_progress=self._on_install_progress)
        self._refresh_model_status()
        while True:
            try:
                if not self.installer.base_complete():
                    self.state = "installing"
                    self.error = ""
                self.base_state = self.installer.install_base()
                self.state = "ready"
                self.error = ""
                self.install["step"] = "done"
                self._refresh_model_status()
                self.ensure_model(self.selected, quiet=True)
                return
            except InstallCancelled:
                self.state = "install-failed"
                self.error = "cancelled"
            except Exception as e:  # noqa: BLE001
                self.state = "install-failed"
                self.error = first_line(e)
                self.log.error(f"Installation failed: {self.error}")
                self.log.debug(traceback.format_exc())
            self.wake.wait()
            self.wake.clear()

    def _on_install_progress(self, **kw):
        for k, v in kw.items():
            self.install[k] = v
        if "step" in kw and "fraction" not in kw:
            self.install["fraction"] = None

    def _refresh_model_status(self):
        if self.installer is None:
            return
        for spec in self.models.MODELS:
            st = self.model_status[spec.id]
            if st["status"] in ("installing", "loading", "ready", "needs-token", "needs-cert", "failed"):
                continue
            if self.installer.model_complete(spec.id):
                st["status"] = "installed"
            elif spec.region_restricted and spec.family not in self.accepted_licenses:
                st["status"] = "needs-license"
            else:
                st["status"] = "not-installed"

    def ensure_model(self, model_id, quiet=False):
        """Installs `model_id` if needed and makes it the loaded model.
        Returns True when it is ready; with quiet, failures are only logged."""
        from .installer import NeedsToken
        from .netfix import ExpiredCertificate
        from .pipeline import Engine

        spec = self.models.get(model_id)
        if spec is None:
            raise ValueError(f"Unknown model: {model_id}")
        st = self.model_status[spec.id]
        if spec.region_restricted and spec.family not in self.accepted_licenses:
            # Nothing is downloaded until the user has read the license's
            # territory limits in the app and accepted them.
            st.update(status="needs-license", error="")
            self.log.warn(f"{spec.name}: its license limits where it may be used; accept it in the app first.")
            if not quiet:
                raise ValueError(f"{spec.name}: the license has not been accepted")
            return False
        with self.model_lock:
            if self.engine is not None and self.engine.spec is spec and self.engine.model is not None:
                st["status"] = "ready"
                return True
            try:
                if not self.installer.model_complete(spec.id):
                    st.update(status="installing", error="")
                # Complete: returns at once, or adds a package the model has
                # gained since it was installed.
                self.installer.install_model(spec)
                st.update(status="loading", error="")
                entry = self.installer.model_state(spec.id)
                weights = entry.get("weights") or self.installer.find_weights(spec)
                if self.engine is None:
                    self.engine = Engine(self.home, self.log)
                previous = self.engine.spec
                self.engine.load(spec, weights, self._torch_pref())
                if previous is not None and previous is not spec:
                    self.model_status[previous.id]["status"] = "installed"
                st.pop("certHost", None)
                st.update(status="ready", error="")
                return True
            except ExpiredCertificate as e:
                # The app warns and asks; nothing more comes from that host
                # until the user allows it (configure: allowExpiredCert).
                st.update(status="needs-cert", error=str(e), certHost=e.host)
                self.log.warn(f"{spec.name}: {e}. The app asks whether to download from it anyway.")
                if not quiet:
                    raise
            except NeedsToken as e:
                st.update(status="needs-token", error=str(e))
                self.log.warn(
                    f"{spec.name} needs a Hugging Face token: accept the license at {spec.page} "
                    "and enter a token in Settings → Engine."
                )
                if not quiet:
                    raise
            except Exception as e:  # noqa: BLE001
                st.update(status="failed", error=first_line(e))
                self.log.error(f"{spec.name} could not be prepared: {first_line(e)}")
                self.log.debug(traceback.format_exc())
                if not quiet:
                    raise
            finally:
                self.install["step"] = "done"
                self.install["fraction"] = None
        return False

    # ── Commands ──────────────────────────────────────────
    def configure(self, body):
        changed = []
        if "hfToken" in body and self.installer is not None:
            self.installer.save_token(str(body.get("hfToken") or ""))
            changed.append("hfToken")
            for st in self.model_status.values():
                if st["status"] == "needs-token":
                    st.update(status="not-installed", error="")
            if self.state == "ready" and self.model_status[self.selected]["status"] == "not-installed":
                self._background(self.ensure_model, self.selected, True)
        if body.get("device") in ("auto", "gpu", "cpu") and body["device"] != self.device_pref:
            self.device_pref = body["device"]
            changed.append("device")
            if self.engine is not None:
                self._background(self.engine.set_preference, self._torch_pref())
        accept = body.get("acceptLicense")
        if accept and any(m.family == accept and m.region_restricted for m in self.models.MODELS):
            self.accepted_licenses.add(str(accept))
            changed.append("license")
            for m in self.models.MODELS:
                if m.family == accept and self.model_status[m.id]["status"] == "needs-license":
                    self.model_status[m.id].update(status="not-installed", error="")
            if self.state == "ready" and self.models.get(self.selected).family == accept:
                self._background(self.ensure_model, self.selected, True)
        host = body.get("allowExpiredCert")
        if host and any(st.get("certHost") == host for st in self.model_status.values()):
            # Only a host the engine itself reported, after the app's warning;
            # for this run of the engine (once the files are in, it is not
            # needed again).
            from . import netfix

            netfix.allow(host)
            changed.append("certificate")
            self.log.warn(f"Allowed downloads from {host} despite its expired certificate (issuer and name still checked).")
            retry = []
            for spec in self.models.MODELS:
                st = self.model_status[spec.id]
                if st.get("certHost") == host:
                    st.pop("certHost", None)
                    st.update(status="not-installed", error="")
                    retry.append(spec.id)
            # The user agreed for these models' downloads: go on with them
            # whichever model is selected (one at a time, under model_lock).
            if self.state == "ready":
                for model_id in retry:
                    self._background(self.ensure_model, model_id, True)
        model = body.get("model")
        if model and self.models.get(model) and model != self.selected:
            self.selected = model
            changed.append("model")
            if self.state == "ready":
                self._background(self.ensure_model, model, True)
        if changed:
            self._save_prefs()
        return changed

    def install_model(self, model_id):
        if self.models.get(model_id) is None or self.state != "ready":
            return False
        self._background(self.ensure_model, model_id, True)
        return True

    def _background(self, fn, *args):
        threading.Thread(target=fn, args=args, daemon=True).start()

    def retry_install(self):
        if self.state == "install-failed":
            self.wake.set()
            return True
        failed = [m for m, st in self.model_status.items() if st["status"] in ("failed", "needs-token")]
        if self.state == "ready" and self.selected in failed:
            self.model_status[self.selected].update(status="not-installed", error="")
            self._background(self.ensure_model, self.selected, True)
            return True
        return False

    def reinstall(self):
        from .installer import Installer

        if self.installer is not None:
            self.installer.cancelled = True
        Installer(self.home, self.uv, self.log).reset()
        self.log.warn("The engine installation was reset; restarting the engine …")

    # ── Jobs ──────────────────────────────────────────────
    def submit(self, image_bytes, options, name="", model=""):
        from .pipeline import Job

        model = model if self.models.get(model) else self.selected
        job = Job(uuid.uuid4().hex[:12], image_bytes, options, name, model)
        job.on_stage = lambda j, stage: self.log.info(f"[{j.id}] {stage}", src="job")
        with self.lock:
            self.jobs[job.id] = job
            self.order.append(job.id)
            while len(self.order) > KEEP_JOBS:
                old = self.order[0]
                if self.jobs.get(old) and self.jobs[old].state in ("queued", "running"):
                    break
                self.order.pop(0)
                self.jobs.pop(old, None)
        self.queue.put(job.id)
        self.log.info(
            f"[{job.id}] queued: {name or 'image'} ({len(image_bytes) // 1024} KB) → {self.models.get(model).name}",
            src="job",
        )
        return job

    def cancel(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return False
        job.cancel_requested = True
        if job.state == "queued":
            job.finish("cancelled")
        return True

    def refine(self, job_id, options):
        """New surface options on a finished job: smoothing and the like run
        again on the model's mesh, without the model."""
        job = self.jobs.get(job_id)
        if job is None:
            raise LookupError("No such job.")
        if job.state != "done" or self.engine is None:
            raise ValueError("Only a finished conversion can be refined.")
        spec = self.models.get(job.model)
        with self.refine_lock:
            return self.engine.refine(job, spec, options)

    def _worker(self):
        from .pipeline import Cancelled

        while True:
            job_id = self.queue.get()
            job = self.jobs.get(job_id)
            if job is None or job.state != "queued":
                continue
            while self.state != "ready" and not job.cancel_requested:
                time.sleep(0.25)
            if job.cancel_requested:
                job.finish("cancelled")
                continue
            job.state = "running"
            job.started = time.time()
            try:
                job.enter("loading")
                self.ensure_model(job.model)
                self.engine.convert(job)
                job.finish("done")
                st = job.stats
                self.log.info(
                    f"[{job.id}] done in {job.finished - job.started:.1f} s on {job.device_name} "
                    f"({job.model_name}): {st.get('vertices', 0):,} vertices, {st.get('faces', 0):,} faces",
                    src="job",
                )
            except Cancelled:
                job.finish("cancelled")
                self.log.warn(f"[{job.id}] cancelled", src="job")
            except Exception as e:  # noqa: BLE001
                job.finish("failed", first_line(e))
                self.log.error(f"[{job.id}] failed: {first_line(e)}", src="job")
                self.log.debug(traceback.format_exc(), src="job")

    # ── Reports ───────────────────────────────────────────
    def models_json(self):
        out = []
        for spec in self.models.MODELS:
            item = spec.to_json()
            item.update(self.model_status[spec.id])
            item["selected"] = spec.id == self.selected
            out.append(item)
        return out

    def health(self):
        device = {"preference": self.device_pref, "gpu": self.base_state.get("gpu", "")}
        loaded = None
        if self.engine is not None and self.engine.model is not None:
            from .pipeline import device_name

            device.update({"selected": self.engine.device, "name": device_name(self.engine.device)})
            loaded = self.engine.spec.id
        busy = next((j.id for j in self.jobs.values() if j.state == "running"), None)
        remesh = False
        if loaded and any(o.get("needs") == "remesh" for o in self.engine.spec.options):
            from .models.sf3d import remesh_available

            remesh = remesh_available()
        return {
            "ok": True,
            "service": "my3dobjects",
            "version": __version__,
            "state": self.state,
            "error": self.error,
            "install": dict(self.install),
            "build": self.base_state.get("build", ""),
            "torch": self.base_state.get("torch", ""),
            "device": device,
            "model": self.selected,
            "loaded": loaded,
            "models": self.models_json(),
            "capabilities": {"remesh": remesh},
            "hasToken": bool(self.installer and self.installer.has_token()),
            "busy": busy,
            "queued": sum(1 for j in self.jobs.values() if j.state == "queued"),
            "python": platform.python_version(),
            "platform": f"{platform.system()} {platform.machine()}",
            "home": self.home,
            "uptime": round(time.time() - self.started, 1),
            "logSeq": self.log.last_seq,
        }


def make_handler(service, log):
    class Handler(BaseHTTPRequestHandler):
        server_version = "My3DObjects"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # quiet: polling would flood the log
            pass

        # ── Plumbing ──────────────────────────────────────
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

        def _send(self, code, body=b"", ctype="application/json"):
            self.send_response(code)
            self._cors()
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj).encode("utf-8"))

        def _error(self, code, message):
            self._json({"ok": False, "error": message}, code)

        def _body(self, limit=MAX_UPLOAD):
            n = int(self.headers.get("Content-Length") or 0)
            if n > limit:
                raise ValueError(f"The upload is larger than {limit // (1024 * 1024)} MB.")
            return self.rfile.read(n) if n else b""

        def _json_body(self):
            raw = self._body(1 << 16)
            if not raw:
                return {}
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}

        # ── Verbs ─────────────────────────────────────────
        def do_OPTIONS(self):
            self._send(204)

        def do_GET(self):
            try:
                self._route_get()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as e:  # noqa: BLE001
                self._error(500, first_line(e))

        def do_POST(self):
            try:
                self._route_post()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except ValueError as e:
                self._error(400, first_line(e))
            except Exception as e:  # noqa: BLE001
                self._error(500, first_line(e))

        def _route_get(self):
            url = urlparse(self.path)
            parts = [p for p in url.path.split("/") if p]
            q = parse_qs(url.query)
            if url.path in ("/", "/api", "/api/health"):
                return self._json(service.health())
            if url.path == "/api/logs":
                after = int((q.get("after") or ["0"])[0] or 0)
                lines, last = log.since(after)
                return self._json({"lines": lines, "last": last})
            if url.path == "/api/models":
                return self._json({"models": service.models_json(), "selected": service.selected})
            if parts[:2] == ["api", "jobs"]:
                if len(parts) == 2:
                    return self._json({"jobs": [service.jobs[i].to_json() for i in service.order if i in service.jobs]})
                job = service.jobs.get(parts[2])
                if job is None:
                    return self._error(404, "No such job.")
                if len(parts) == 3:
                    return self._json(job.to_json())
                name = parts[3]
                if name == "result-obj.zip" and job._mesh is not None:
                    from .pipeline import Engine

                    return self._send(200, Engine.export_obj_zip(job._mesh), "application/zip")
                data = job.files.get(name)
                if data is None:
                    return self._error(404, "Not available.")
                ctype = {"glb": "model/gltf-binary", "png": "image/png"}.get(name.rsplit(".", 1)[-1], "application/octet-stream")
                return self._send(200, data, ctype)
            return self._error(404, "Not found.")

        def _route_post(self):
            url = urlparse(self.path)
            parts = [p for p in url.path.split("/") if p]
            if url.path == "/api/config":
                return self._json({"ok": True, "changed": service.configure(self._json_body())})
            if url.path == "/api/install/retry":
                return self._json({"ok": service.retry_install()})
            if parts[:2] == ["api", "models"] and len(parts) == 4 and parts[3] == "install":
                return self._json({"ok": service.install_model(parts[2])})
            if url.path == "/api/reinstall":
                service.reinstall()
                self._json({"ok": True, "restarting": True})
                threading.Timer(0.3, lambda: os._exit(RESTART_EXIT_CODE)).start()
                return None
            if parts[:2] == ["api", "jobs"] and len(parts) == 2:
                data = self._body()
                if not data:
                    raise ValueError("No image was sent.")
                q = {k: v[0] for k, v in parse_qs(url.query).items()}
                name = q.pop("name", "") or self.headers.get("X-File-Name", "")
                model = q.pop("model", "")
                job = service.submit(data, q, name, model)
                return self._json({"ok": True, "id": job.id})
            if parts[:2] == ["api", "jobs"] and len(parts) == 4 and parts[3] == "cancel":
                return self._json({"ok": service.cancel(parts[2])})
            if parts[:2] == ["api", "jobs"] and len(parts) == 4 and parts[3] == "refine":
                try:
                    job = service.refine(parts[2], self._json_body())
                except LookupError as e:
                    return self._error(404, str(e))
                return self._json(job.to_json())
            return self._error(404, "Not found.")

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # A page that reloads or aborts a request resets its connection; that
        # is not worth a traceback in the log.
        err = sys.exc_info()[1]
        if isinstance(err, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def watch_parent(pid):
    """Exit with the app that started us, even when it is killed.

    Not by watching stdin: on Windows a thread blocked reading a pipe makes
    any other thread that asks about that handle (GetFileType, isatty — done
    by imports and by subprocess) wait with the GIL held, which froze the
    whole engine while PyTorch loaded."""
    if not pid:
        return

    def run_windows():
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x00100000, False, int(pid))  # SYNCHRONIZE
        if not handle:
            os._exit(0)
        kernel32.WaitForSingleObject(handle, 0xFFFFFFFF)  # releases the GIL while it waits
        os._exit(0)

    def run_posix():
        import time as _time

        while True:
            try:
                os.kill(int(pid), 0)
            except ProcessLookupError:
                os._exit(0)
            except PermissionError:
                pass
            _time.sleep(1.0)

    target = run_windows if os.name == "nt" else run_posix
    threading.Thread(target=target, name="parent-watch", daemon=True).start()


def main(argv=None):
    parser = argparse.ArgumentParser(prog="my3dobjects")
    parser.add_argument("--home", required=True, help="engine folder (venv, models, state)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=57660, help="0 = any free port")
    parser.add_argument("--uv", default="uv", help="the uv binary used to install packages")
    parser.add_argument("--parent-pid", type=int, default=0, help="exit when this process ends")
    args = parser.parse_args(argv)

    os.makedirs(args.home, exist_ok=True)
    os.environ.setdefault("U2NET_HOME", os.path.join(args.home, "u2net"))
    log = LogBuffer(echo=sys.__stdout__)
    install_tee(log)
    watch_parent(args.parent_pid)

    httpd = Server((args.host, args.port), BaseHTTPRequestHandler)
    service = Service(args.home, args.uv, log)
    httpd.RequestHandlerClass = make_handler(service, log)
    port = httpd.server_address[1]
    # The launcher waits for this exact line, and passes on nothing after it
    # (the log comes over HTTP), so it comes before the first log line.
    sys.__stdout__.write(f"MY3DOBJECTS_LISTENING {port}\n")
    sys.__stdout__.flush()
    log.info(f"My3DObjects engine {__version__} on http://{args.host}:{port} (home: {args.home})")
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    return 0
