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

    def test_versions_share_a_family(self):
        hy = [m for m in models.MODELS if m.family == "hunyuan3d"]
        self.assertGreaterEqual(len(hy), 5)
        self.assertEqual(len({m.id for m in hy}), len(hy))
        for m in hy:
            j = m.to_json()
            self.assertTrue(j["regionRestricted"] and j["licenseNote"]["ko"] and j["versionLabel"])
            self.assertEqual(j["familyName"], "Hunyuan3D")
            self.assertEqual(j["output"], "shape")
            # Turbo versions decode with their own VAE, downloaded with them.
            self.assertEqual(bool(m.turbo_vae), m.turbo)
            self.assertTrue(all(f.startswith(m.subfolder + "/") or f.startswith(m.turbo_vae + "/") for f in m.files))
        # The 2.0 versions share one source download.
        self.assertEqual(len({m.source_id for m in hy if m.id != "hunyuan3d-2.1"}), 1)

    def test_common_options_take_model_defaults(self):
        spec = models.get("triposr")
        keys = [o["key"] for o in models.common_options(spec)]
        self.assertEqual(keys[:2], ["removeBackground", "foregroundRatio"])
        self.assertIn("straighten", keys)
        opts = models.normalize_options(spec, {"smoothing": "99"}, "cuda")
        self.assertEqual(opts["smoothing"], 50)
        self.assertTrue(opts["straighten"])
        self.assertEqual(opts["subdivide"], 1)
        self.assertEqual(models.normalize_options(spec, {"subdivide": "5"}, "cuda")["subdivide"], 2)
        # Every common option says where the settings window shows it, and
        # the surface ones are exactly those a finished result can redo.
        from mysf3d.pipeline import SURFACE_OPTIONS

        common = models.common_options(spec)
        self.assertTrue(all(o.get("group") in ("input", "surface") for o in common))
        self.assertEqual(sorted(o["key"] for o in common if o["group"] == "surface"), sorted(SURFACE_OPTIONS))


class GeometryTest(unittest.TestCase):
    """The clean-up after a model: standing the result upright, smoothing."""

    def setUp(self):
        try:
            import numpy  # noqa: F401
            import trimesh  # noqa: F401
        except ImportError:
            self.skipTest("numpy / trimesh not installed")

    def test_upright_undoes_a_lean_about_x(self):
        import numpy as np
        import trimesh
        from mysf3d.pipeline import upright_angle

        mug = trimesh.creation.cylinder(radius=0.3, height=1.0, sections=48)
        mug.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))  # stand on Y
        self.assertEqual(upright_angle(mug.vertices), 0.0)
        leaning = mug.copy()
        leaning.apply_transform(trimesh.transformations.rotation_matrix(np.radians(20), [1, 0, 0]))
        self.assertAlmostEqual(np.degrees(upright_angle(leaning.vertices)), -20.0, delta=0.6)

    def test_smoothing_keeps_seam_copies_together(self):
        import numpy as np
        import trimesh
        from mysf3d.pipeline import smooth_surface

        ball = trimesh.creation.icosphere(subdivisions=3)
        rng = np.random.default_rng(1)
        ball.vertices = ball.vertices + rng.normal(0, 0.02, ball.vertices.shape)
        # Split every face's corners apart, as UV seams do.
        split = trimesh.Trimesh(ball.vertices[ball.faces].reshape(-1, 3), np.arange(len(ball.faces) * 3).reshape(-1, 3), process=False)
        before = np.std(np.linalg.norm(split.vertices, axis=1))
        smooth_surface(split, 10)
        after = np.linalg.norm(split.vertices, axis=1)
        self.assertLess(np.std(after), before * 0.6)
        # Copies of one corner still meet: no cracks.
        joined = trimesh.Trimesh(split.vertices, split.faces)
        joined.merge_vertices(digits_vertex=6)
        self.assertEqual(len(joined.vertices), len(ball.vertices))

    def test_inward_faces_are_turned_round(self):
        import trimesh
        from mysf3d.pipeline import face_outward

        ball = trimesh.creation.icosphere(subdivisions=2)
        self.assertFalse(face_outward(ball))
        ball.invert()
        self.assertLess(ball.volume, 0)
        self.assertTrue(face_outward(ball))
        self.assertGreater(ball.volume, 0)

    def test_marching_cubes_shim_faces_outward(self):
        # TripoSR hands over a volume that is positive inside the object.
        import numpy as np
        import trimesh

        try:
            import torch
            import skimage  # noqa: F401
        except ImportError:
            self.skipTest("needs torch and scikit-image (the engine's Python)")
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shims"))
        from torchmcubes import marching_cubes

        g = np.linspace(-1, 1, 24)
        x, y, z = np.meshgrid(g, g, g, indexing="ij")
        inside = torch.tensor(0.7 - np.sqrt(x ** 2 + y ** 2 + z ** 2), dtype=torch.float32)
        v, f = marching_cubes(inside, 0.0)
        self.assertGreater(trimesh.Trimesh(v[..., [2, 1, 0]].numpy(), f.numpy()).volume, 0)

    def test_specks_are_dropped_and_the_body_kept(self):
        import trimesh
        from mysf3d.pipeline import drop_fragments

        body = trimesh.creation.icosphere(subdivisions=3)
        speck = trimesh.creation.icosphere(subdivisions=0, radius=0.05)
        speck.apply_translation([2, 0, 0])
        both = trimesh.util.concatenate([body, speck])
        self.assertEqual(drop_fragments(both.copy(), 0), 0)
        self.assertEqual(drop_fragments(both.copy(), 1.0), 0)  # 20 of 1280 faces: 1.6 %
        self.assertEqual(drop_fragments(both, 5.0), 1)
        self.assertEqual(len(both.faces), len(body.faces))

    def test_subdivision_carries_uvs_and_stays_closed(self):
        import numpy as np
        import trimesh
        from mysf3d.pipeline import finish_mesh, joined_surface

        ball = trimesh.creation.icosphere(subdivisions=2)
        # Seams everywhere, each corner with its own UV.
        split = trimesh.Trimesh(ball.vertices[ball.faces].reshape(-1, 3), np.arange(len(ball.faces) * 3).reshape(-1, 3), process=False)
        uv = np.random.default_rng(2).random((len(split.vertices), 2))
        split.visual = trimesh.visual.TextureVisuals(uv=uv, material=trimesh.visual.material.SimpleMaterial())
        out, _ = finish_mesh(split, {"subdivide": 1, "smoothing": 5, "minPartSize": 0.5, "straighten": False})
        self.assertEqual(len(out.faces), 4 * len(ball.faces))
        self.assertEqual(len(out.visual.uv), len(out.vertices))
        joined, inverse = joined_surface(out)
        self.assertTrue(joined.is_watertight)
        # Both copies of a seam point carry one normal.
        n = np.asarray(out.vertex_normals)
        self.assertTrue(np.allclose(n, joined.vertex_normals[inverse]))
        self.assertEqual(len(split.faces), len(ball.faces))  # the raw mesh is left alone

    def test_refine_redoes_only_the_surface(self):
        import trimesh
        from mysf3d.pipeline import Engine

        class Log:
            def info(self, *_):
                pass

        job = Job("r1", b"", {}, "a.png", "triposr")
        job.options = models.normalize_options(models.get("triposr"), {}, "cuda")
        job._raw = trimesh.creation.icosphere(subdivisions=2)
        job.finish("done")
        Engine(".", Log()).refine(job, models.get("triposr"), {"subdivide": 0, "smoothing": 0, "mcResolution": 128})
        self.assertEqual(job.stats["faces"], len(job._raw.faces))
        self.assertEqual(job.options["subdivide"], 0)
        self.assertEqual(job.options["mcResolution"], 256)  # not a surface option: unchanged
        self.assertTrue(job.files["result.glb"].startswith(b"glTF"))
        Engine(".", Log()).refine(job, models.get("triposr"), {"subdivide": 1})
        self.assertEqual(job.stats["faces"], 4 * len(job._raw.faces))


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
