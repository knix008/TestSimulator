"""SPAR3D and TRELLIS as the engine sees them — registry entries, options,
install recipe (extra sources, weight files), the pieces of their adapters
that need no model — and the installer's extra-source download."""

import io
import json
import os
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, ".."))

from my3dobjects import installer, models  # noqa: E402
from my3dobjects.models import spar3d as spar3d_mod  # noqa: E402
from my3dobjects.models import trellis as trellis_mod  # noqa: E402

try:
    import torch
except Exception:  # noqa: BLE001
    torch = None


class Log:
    def __init__(self):
        self.lines = []

    def info(self, msg, **_kw):
        self.lines.append(msg)

    warn = error = info


class RegistryTest(unittest.TestCase):
    def test_new_models_are_listed_once_in_order(self):
        ids = [m.id for m in models.MODELS]
        self.assertEqual(ids[:4], ["sf3d", "spar3d", "triposr", "trellis"])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(models.DEFAULT_MODEL, "sf3d")

    def test_spar3d_entry(self):
        m = models.get("spar3d")
        j = m.to_json()
        self.assertEqual(j["name"], "SPAR3D")
        self.assertTrue(j["gated"])                      # Stability AI: accept the license on Hugging Face
        self.assertEqual(j["output"], "texture")
        self.assertEqual(m.repo, "stabilityai/stable-point-aware-3d")
        self.assertEqual(m.files, ("config.yaml", "model.safetensors"))
        self.assertTrue(m.source_zip.endswith(m.commit))
        self.assertEqual(m.check_file, os.path.join("spar3d", "system.py"))
        self.assertIn("ko", j["summary"])
        self.assertIn("en", j["summary"])

    def test_trellis_entry(self):
        m = models.get("trellis")
        j = m.to_json()
        self.assertEqual(j["license"], "MIT")
        self.assertFalse(j["gated"])
        self.assertEqual(j["output"], "vertex-colors")
        self.assertTrue(m.faces_front)
        self.assertEqual(m.repo, "microsoft/TRELLIS-image-large")
        # Only what the mesh needs: the pipeline file and four models.
        self.assertEqual(m.files[0], "pipeline.json")
        self.assertEqual(len(m.files), 1 + 2 * len(trellis_mod.MESH_MODELS))
        self.assertFalse(any("slat_dec_gs" in f or "slat_dec_rf" in f or "_enc_" in f for f in m.files))
        for key in trellis_mod.MESH_MODELS:
            self.assertIn(trellis_mod.CKPTS[key] + ".safetensors", m.files)

    def test_extra_sources_are_pinned(self):
        for m in (models.get("spar3d"), models.get("trellis")):
            self.assertTrue(m.extra_sources)
            for extra in m.extra_sources:
                name, url, commit, check = extra[:4]
                self.assertTrue(url.startswith("https://codeload.github.com/") and url.endswith(commit), url)
                self.assertEqual(len(commit), 40)
                self.assertTrue(name and check)
        flexi = models.get("trellis").extra_sources[0]
        self.assertEqual(flexi[4], os.path.join("src", "trellis", "representations", "mesh", "flexicubes"))

    def test_packages_do_not_touch_the_pinned_base(self):
        base = {p.split("==")[0].lower() for p in installer.PACKAGES}
        for m in (models.get("spar3d"), models.get("trellis")):
            for p in m.packages:
                self.assertNotIn(p.split("==")[0].lower(), base, p)
        # What the stand-ins replace is never installed.
        installs = " ".join(models.get("trellis").packages + models.get("spar3d").packages)
        for name in ("xformers", "spconv", "kaolin", "open3d", "utils3d", "plyfile", "transparent", "flash"):
            self.assertNotIn(name, installs)


class OptionsTest(unittest.TestCase):
    def test_spar3d_options(self):
        spec = models.get("spar3d")
        o = models.normalize_options(spec, {}, "cuda")
        self.assertEqual(o["textureResolution"], 1024)
        self.assertEqual(o["guidanceScale"], 3.0)
        self.assertEqual(o["seed"], 0)
        self.assertEqual(o["foregroundRatio"], 0.75)
        self.assertEqual(models.normalize_options(spec, {}, "cpu")["textureResolution"], 512)
        o = models.normalize_options(spec, {"guidanceScale": "99", "seed": "-4", "remesh": "quad"}, "cuda")
        self.assertEqual(o["guidanceScale"], 10.0)
        self.assertEqual(o["seed"], 0)
        self.assertEqual(o["remesh"], "quad")
        remesh = next(x for x in spec.options if x["key"] == "remesh")
        self.assertEqual(remesh.get("needs"), "remesh")

    def test_trellis_options_are_its_demo_defaults(self):
        spec = models.get("trellis")
        o = models.normalize_options(spec, {}, "cuda")
        self.assertEqual((o["ssSteps"], o["ssGuidance"], o["slatSteps"], o["slatGuidance"]), (12, 7.5, 12, 3.0))
        self.assertEqual(o["subdivide"], 0)
        o = models.normalize_options(spec, {"ssSteps": "0", "slatSteps": "500", "ssGuidance": "-1"}, "cpu")
        self.assertEqual((o["ssSteps"], o["slatSteps"], o["ssGuidance"]), (1, 50, 0.0))
        self.assertIsInstance(o["ssSteps"], int)

    def test_every_option_has_ui_text(self):
        """The app labels every option from i18n (opt.<key>, optTip.<key>)."""
        with open(os.path.join(ROOT, "src", "i18n.js"), encoding="utf-8") as f:
            text = f.read()
        for m in models.MODELS:
            for o in m.options:
                self.assertGreaterEqual(text.count(f"    {o['key']}:"), 4, f"{m.id}: {o['key']} needs ko+en label and tip")


class AdapterPiecesTest(unittest.TestCase):
    def test_trellis_backends(self):
        env = trellis_mod.environment()
        self.assertEqual(env["SPARSE_BACKEND"], "spconv")
        self.assertEqual(env["SPARSE_ATTN_BACKEND"], "xformers")
        self.assertEqual(env["ATTN_BACKEND"], "sdpa")
        self.assertEqual(env["XFORMERS_DISABLED"], "1")
        self.assertTrue(trellis_mod.DINOV2_HUB.endswith(":main"))

    def test_trellis_prepare_puts_the_shims_first(self):
        spec = models.get("trellis")
        with tempfile.TemporaryDirectory() as home:
            saved_path, saved_env = list(sys.path), dict(os.environ)
            try:
                spec.prepare(home)
                self.assertEqual(sys.path[0], spec.source_dir(home))
                self.assertEqual(sys.path[1], trellis_mod.TRELLIS_SHIMS)
                self.assertTrue(os.environ["TORCH_HOME"].startswith(home))
            finally:
                sys.path[:] = saved_path
                os.environ.clear()
                os.environ.update(saved_env)

    def test_trellis_finds_files_from_the_ckpts_folder(self):
        spec = models.get("trellis")
        with tempfile.TemporaryDirectory() as snap:
            os.makedirs(os.path.join(snap, "ckpts"))
            for name in spec.files:
                with open(os.path.join(snap, *name.split("/")), "w") as f:
                    f.write("{}")
            local = spec.local_files(os.path.join(snap, "ckpts"))
            self.assertEqual(local("pipeline.json"), os.path.join(snap, "pipeline.json"))
            name = trellis_mod.CKPTS["slat_decoder_mesh"] + ".json"
            self.assertTrue(os.path.isfile(local(name)))

    def test_model_input_is_premultiplied_518(self):
        from PIL import Image

        img = Image.new("RGBA", (300, 200), (200, 100, 50, 128))
        out = trellis_mod.model_input(img)
        self.assertEqual(out.size, (518, 518))
        self.assertEqual(out.mode, "RGB")
        r, g, b = out.getpixel((259, 259))
        self.assertAlmostEqual(r, 200 * 128 / 255, delta=1.5)
        self.assertAlmostEqual(b, 50 * 128 / 255, delta=1.5)

    @unittest.skipIf(torch is None, "torch is not installed")
    def test_mesh_arrays_turn_z_up_to_y_up(self):
        class Result:
            vertices = torch.tensor([[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
            faces = torch.tensor([[0, 1, 2]])
            vertex_attrs = torch.tensor([[2.0, 0.5, -1.0, 0, 0, 0]] * 3)

        verts, faces, colours = trellis_mod.mesh_arrays(Result)
        self.assertEqual(verts[0].tolist(), [0.0, 1.0, 0.0])    # TRELLIS up (+Z) is Y up
        self.assertEqual(verts[2].tolist(), [0.0, 0.0, -1.0])   # TRELLIS +Y goes to -Z
        self.assertEqual(faces.tolist(), [[0, 1, 2]])
        self.assertEqual(colours[0].tolist(), [255, 128, 0, 255])

    @unittest.skipIf(torch is None, "torch is not installed")
    def test_set_precision_keeps_dtype_in_step(self):
        class Part(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.lin = torch.nn.Linear(2, 2)
                self.dtype = torch.float16
                self.use_fp16 = True

            def convert_to_fp16(self):
                self.lin.half()

            def convert_to_fp32(self):
                self.lin.float()

        parts = {"slat_flow_model": Part(), "image_cond_model": torch.nn.Linear(2, 2)}
        trellis_mod.set_precision(parts, half=False)
        self.assertEqual(parts["slat_flow_model"].dtype, torch.float32)
        self.assertFalse(parts["slat_flow_model"].use_fp16)
        self.assertEqual(parts["slat_flow_model"].lin.weight.dtype, torch.float32)
        trellis_mod.set_precision(parts, half=True)
        self.assertEqual(parts["slat_flow_model"].dtype, torch.float16)
        self.assertEqual(parts["slat_flow_model"].lin.weight.dtype, torch.float16)
        self.assertEqual(parts["image_cond_model"].weight.dtype, torch.float32)  # DINOv2 stays fp32

    def test_spar3d_encoder_check(self):
        self.assertTrue(spar3d_mod.encoders_covered(["image_tokenizer.model.embeddings.x", "backbone.y"]))
        self.assertTrue(spar3d_mod.encoders_covered([
            "image_tokenizer.model.a", "pdiff_image_tokenizer.model.b", "pdiff_image_tokenizer.ln.weight"]))
        self.assertFalse(spar3d_mod.encoders_covered(["backbone.y"]))
        self.assertFalse(spar3d_mod.encoders_covered(["image_tokenizer.model.a", "pdiff_image_tokenizer.ln.weight"]))

    def test_spar3d_pkg_resources_stand_in(self):
        saved = sys.modules.pop("pkg_resources", None)
        try:
            spar3d_mod._ensure_pkg_resources()
            import pkg_resources

            self.assertTrue(hasattr(pkg_resources, "packaging"))
            self.assertTrue(hasattr(pkg_resources.packaging, "version"))
        finally:
            if saved is not None:
                sys.modules["pkg_resources"] = saved


class ExtraSourceTest(unittest.TestCase):
    def _zip(self, folder, files):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for name, text in files.items():
                z.writestr(f"{folder}/{name}", text)
        return buf.getvalue()

    def test_download_unpack_and_reuse(self):
        with tempfile.TemporaryDirectory() as home:
            archive = os.path.join(home, "flexi.zip")
            with open(archive, "wb") as f:
                f.write(self._zip("FlexiCubes-abc", {"flexicubes.py": "x = 1\n", "tables.py": ""}))
            url = "file:" + archive.replace("\\", "/") if os.name != "nt" else "file:///" + archive.replace("\\", "/")
            inst = installer.Installer(home, "uv", Log())
            spec = models.get("trellis")
            sub = os.path.join("src", "trellis", "representations", "mesh", "flexicubes")
            inst._extra_source_files(spec, "flexicubes", url, "c" * 40, "flexicubes.py", sub)
            target = os.path.join(home, "models", "trellis", sub)
            self.assertTrue(os.path.isfile(os.path.join(target, "flexicubes.py")))
            with open(os.path.join(target, ".my3dobjects-commit")) as f:
                self.assertEqual(f.read(), "c" * 40)
            # Same commit: not downloaded again (the archive is gone).
            os.remove(archive)
            inst._extra_source_files(spec, "flexicubes", url, "c" * 40, "flexicubes.py", sub)
            # Without a folder it goes to models/<id>/<name>.
            with open(archive, "wb") as f:
                f.write(self._zip("AlphaCLIP-x", {"alpha_clip/alpha_clip.py": ""}))
            inst._extra_source_files(models.get("spar3d"), "alpha_clip", url, "d" * 40,
                                     os.path.join("alpha_clip", "alpha_clip.py"))
            self.assertTrue(os.path.isfile(os.path.join(home, "models", "spar3d", "alpha_clip", "alpha_clip", "alpha_clip.py")))

    def test_incomplete_archive_is_an_error(self):
        with tempfile.TemporaryDirectory() as home:
            archive = os.path.join(home, "bad.zip")
            with open(archive, "wb") as f:
                f.write(self._zip("Thing", {"other.py": ""}))
            url = "file:///" + archive.replace("\\", "/").lstrip("/")
            inst = installer.Installer(home, "uv", Log())
            with self.assertRaises(RuntimeError):
                inst._extra_source_files(models.get("trellis"), "flexicubes", url, "e" * 40, "flexicubes.py")


class BundleTest(unittest.TestCase):
    def test_every_engine_folder_ships_with_the_app(self):
        """Each folder of engine Python files is a resource of the desktop
        bundle (the globs are per folder, so a new shim is easy to miss)."""
        with open(os.path.join(ROOT, "src-tauri", "tauri.conf.json"), encoding="utf-8") as f:
            resources = json.load(f)["bundle"]["resources"]
        globs = {k.replace("\\", "/") for k in resources}
        for base in ("my3dobjects", "shims"):
            for dirpath, _dirs, files in os.walk(os.path.join(ROOT, "engine", base)):
                if "__pycache__" in dirpath or not any(n.endswith(".py") for n in files):
                    continue
                rel = os.path.relpath(dirpath, ROOT).replace("\\", "/")
                self.assertIn(f"../{rel}/*.py", globs, f"{rel} is not bundled")


if __name__ == "__main__":
    unittest.main()
