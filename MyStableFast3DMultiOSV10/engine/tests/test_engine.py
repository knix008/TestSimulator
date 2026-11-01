"""Engine pieces that need no model: PyTorch build choice, option clamping,
job progress, the log buffer and the HTTP API (with a stub service)."""

import io
import json
import os
import sys
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mysf3d import installer, models  # noqa: E402
from mysf3d.logbuf import LogBuffer, TeeStream  # noqa: E402
from mysf3d.pipeline import Job, Cancelled  # noqa: E402


class TorchBuildTest(unittest.TestCase):
    def test_build_per_machine(self):
        self.assertEqual(installer.torch_build("Windows", "AMD64", gpu="NVIDIA RTX"), "cuda")
        self.assertEqual(installer.torch_build("Windows", "AMD64", gpu=""), "cpu")
        self.assertEqual(installer.torch_build("Linux", "x86_64", gpu=""), "cpu")
        self.assertEqual(installer.torch_build("Linux", "aarch64", gpu=""), "default")
        self.assertEqual(installer.torch_build("Darwin", "arm64"), "default")
        self.assertEqual(installer.torch_build("Darwin", "x86_64"), "mac-intel")

    def test_every_build_is_pinned(self):
        for build in installer.TORCH_BUILDS.values():
            self.assertTrue(build["torch"] and build["torchvision"])


class OptionsTest(unittest.TestCase):
    def test_sf3d_defaults_follow_the_device(self):
        spec = models.get("sf3d")
        self.assertEqual(models.normalize_options(spec, {}, "cuda")["textureResolution"], 1024)
        self.assertEqual(models.normalize_options(spec, {}, "cpu")["textureResolution"], 512)
        self.assertEqual(models.normalize_options(spec, {"textureResolution": "2048"}, "cpu")["textureResolution"], 2048)

    def test_values_are_clamped_and_checked(self):
        spec = models.get("sf3d")
        o = models.normalize_options(spec, {"foregroundRatio": "7", "remesh": "evil", "vertexCount": "5", "removeBackground": "false"}, "cuda")
        self.assertEqual(o["foregroundRatio"], 1.0)
        self.assertEqual(o["remesh"], "none")
        self.assertEqual(o["vertexCount"], 100)
        self.assertFalse(o["removeBackground"])
        self.assertEqual(models.normalize_options(spec, {"vertexCount": "-1"}, "cuda")["vertexCount"], -1)

    def test_triposr_options(self):
        spec = models.get("triposr")
        self.assertEqual(models.normalize_options(spec, {}, "cpu")["mcResolution"], 192)
        self.assertEqual(models.normalize_options(spec, {"mcResolution": 320}, "cuda")["mcResolution"], 320)
        self.assertEqual(models.normalize_options(spec, {"threshold": 999}, "cuda")["threshold"], 60.0)

    def test_registry(self):
        ids = [m.id for m in models.MODELS]
        self.assertEqual(ids[0], models.DEFAULT_MODEL)
        self.assertIn("triposr", ids)
        for m in models.MODELS:
            j = m.to_json()
            self.assertTrue(j["name"] and j["license"] and j["page"].startswith("https://"))
            self.assertTrue(m.source_zip.endswith(m.commit))


class JobTest(unittest.TestCase):
    def test_progress_moves_forward_through_stages(self):
        job = Job("j", b"x", {})
        job.enter("background")
        a = job.progress
        job.enter("model")
        job.within(0.5)
        b = job.progress
        job.enter("bake")
        self.assertLess(a, b)
        self.assertLess(b, job.progress)
        job.finish("done")
        self.assertEqual(job.progress, 1.0)
        self.assertEqual(job.image_bytes, b"")
        self.assertIn("model", job.timings)

    def test_cancel_stops_at_the_next_stage(self):
        job = Job("j", b"x", {})
        job.cancel_requested = True
        with self.assertRaises(Cancelled):
            job.enter("model")


class LogTest(unittest.TestCase):
    def test_since_and_capacity(self):
        log = LogBuffer(capacity=3)
        for i in range(5):
            log.info(f"line {i}")
        lines, last = log.since(0)
        self.assertEqual([l["msg"] for l in lines], ["line 2", "line 3", "line 4"])
        self.assertEqual(last, 5)
        self.assertEqual(log.since(4)[0][0]["msg"], "line 4")

    def test_tee_keeps_the_end_of_progress_bars(self):
        log = LogBuffer()
        tee = TeeStream(log, "warn", "py")
        tee.write("10%\r50%\r100% done\nnext")
        tee.write(" line\n")
        msgs = [l["msg"] for l in log.since(0)[0]]
        self.assertEqual(msgs, ["100% done", "next line"])


class ApiTest(unittest.TestCase):
    """The HTTP layer with a stand-in service (no installation, no model)."""

    @classmethod
    def setUpClass(cls):
        from mysf3d import server

        class Stub:
            selected = "sf3d"
            jobs = {}
            order = []

            def health(self):
                return {"ok": True, "service": "mysf3d", "state": "ready"}

            def models_json(self):
                return [m.to_json() for m in models.MODELS]

            def configure(self, body):
                return sorted(body)

            def submit(self, data, q, name, model):
                job = Job("abc", data, q, name, model)
                job.files["result.glb"] = b"glTF"
                job.finish("done")
                self.jobs["abc"] = job
                self.order.append("abc")
                return job

            def cancel(self, job_id):
                return job_id in self.jobs

            def retry_install(self):
                return False

            def install_model(self, model_id):
                return True

        cls.log = LogBuffer()
        cls.log.info("hello")
        cls.httpd = server.Server(("127.0.0.1", 0), BaseHTTPRequestHandler)
        cls.httpd.RequestHandlerClass = server.make_handler(Stub(), cls.log)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            return r.status, r.headers, r.read()

    def post(self, path, data=b"", ctype="application/octet-stream"):
        req = urllib.request.Request(self.base + path, data=data, method="POST", headers={"Content-Type": ctype})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())

    def test_health_answers_any_origin(self):
        status, headers, body = self.get("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual(json.loads(body)["service"], "mysf3d")

    def test_logs_and_models(self):
        _, _, body = self.get("/api/logs?after=0")
        self.assertEqual(json.loads(body)["lines"][0]["msg"], "hello")
        _, _, body = self.get("/api/models")
        self.assertEqual(json.loads(body)["selected"], "sf3d")

    def test_job_round_trip(self):
        r = self.post("/api/jobs?model=sf3d&name=a.png&textureResolution=512", b"PNG")
        self.assertEqual(r["id"], "abc")
        _, _, body = self.get("/api/jobs/abc")
        self.assertEqual(json.loads(body)["state"], "done")
        status, headers, body = self.get("/api/jobs/abc/result.glb")
        self.assertEqual(body, b"glTF")
        self.assertEqual(headers["Content-Type"], "model/gltf-binary")
        self.assertTrue(self.post("/api/jobs/abc/cancel")["ok"])

    def test_config_and_errors(self):
        r = self.post("/api/config", json.dumps({"device": "cpu", "model": "triposr"}).encode(), "application/json")
        self.assertEqual(r["changed"], ["device", "model"])
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.post("/api/jobs", b"")
        self.assertEqual(e.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.get("/api/jobs/nope")
        self.assertEqual(e.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
