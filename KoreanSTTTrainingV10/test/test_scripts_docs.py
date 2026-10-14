import importlib.util
import os
import re
import shutil
import subprocess
import sys
import unittest

from kws.model import build_model, parameter_count
from kws.paths import SOURCE_ROOT
from test.helpers import parse_keys, project_with_model, temp_dir, trained_model

SCRIPTS = {
    "run_record.bat": "kws.record",
    "run_train.bat": "kws.train",
    "run_export.bat": "kws.export",
    "run_test.bat": "kws.infer",
    "run_selftest.bat": "kws.selftest",
    "run_synth_test.bat": "kws.synth_eval",
    "run_eval.bat": "kws.evaluate",
}


def run_bat(name, *args, root=None, timeout=600):
    env = os.environ.copy()
    if root is not None:
        env["KWS_ROOT"] = str(root)
    return subprocess.run(
        ["cmd", "/c", str(SOURCE_ROOT / name), *map(str, args)],
        cwd=SOURCE_ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


class ScriptFilesTest(unittest.TestCase):
    def test_every_script_targets_an_existing_module(self):
        for name, module in SCRIPTS.items():
            with self.subTest(script=name):
                text = (SOURCE_ROOT / name).read_text(encoding="utf-8")
                self.assertIn(f"-m {module}", text)
                self.assertIn("setup_python.bat", text)
                self.assertIsNotNone(importlib.util.find_spec(module))

    def test_gui_and_cpp_scripts_exist(self):
        for name in ("run.bat", "run_gui.bat", "build_cpp.bat", "run_cpp.bat", "run_tests.bat", "scripts/setup_python.bat"):
            with self.subTest(script=name):
                self.assertTrue((SOURCE_ROOT / name).is_file())
        self.assertIsNotNone(importlib.util.find_spec("gui.app"))

    def test_gui_entry_point(self):
        completed = subprocess.run(
            [sys.executable, "-c", "import main; import gui.app"],
            cwd=SOURCE_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)


@unittest.skipUnless(sys.platform == "win32", "Windows 배치 파일")
class BatchRunTest(unittest.TestCase):
    def test_run_test_bat_recognizes_wav(self):
        root = project_with_model(temp_dir())
        wav = sorted((root / "data" / "audio" / "퇴근").glob("*.wav"))[0]
        completed = run_bat("run_test.bat", wav, "0.5", root=root)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertEqual(parse_keys(completed.stdout).get("TOP_LABEL"), "퇴근")

    def test_run_train_and_export_bat(self):
        audio, _ = trained_model()
        root = temp_dir()
        shutil.copytree(audio, root / "data" / "audio")
        trained = run_bat("run_train.bat", "--epochs", "3", "--no-int8", root=root)
        self.assertEqual(trained.returncode, 0, trained.stdout + trained.stderr)
        self.assertTrue((root / "models" / "latest" / "command_kws.onnx").is_file())
        exported = run_bat("run_export.bat", "--no-int8", root=root)
        self.assertEqual(exported.returncode, 0, exported.stdout + exported.stderr)

    def test_run_eval_bat(self):
        from test.test_synth_practice import write_heldout

        root = project_with_model(temp_dir())
        completed = run_bat("run_eval.bat", write_heldout(temp_dir()), "--threshold", "0.5", root=root)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertEqual(parse_keys(completed.stdout).get("TOTAL"), "30")

    def test_run_record_bat_rejects_bad_count(self):
        completed = run_bat("run_record.bat", "출근", "99", root=temp_dir())
        self.assertEqual(completed.returncode, 1)

    def test_run_selftest_bat(self):
        completed = run_bat("run_selftest.bat", "--skip-train", "--skip-cpp")
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("SELFTEST OK", completed.stdout)

    def test_build_cpp_bat(self):
        completed = run_bat("build_cpp.bat")
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertTrue((SOURCE_ROOT / "cpp" / "build" / "test_logmel.exe").is_file())


class DocumentsTest(unittest.TestCase):
    def test_documents_exist_and_link(self):
        readme = (SOURCE_ROOT / "README.md").read_text(encoding="utf-8")
        for name in ("Architecture.md", "UsersGuide.md"):
            with self.subTest(document=name):
                self.assertTrue((SOURCE_ROOT / name).is_file())
                self.assertIn(name, readme)

    def test_documented_parameter_count(self):
        count = parameter_count(build_model(5))
        architecture = (SOURCE_ROOT / "Architecture.md").read_text(encoding="utf-8")
        self.assertIn(f"{count:,}", architecture)
        self.assertIn(f"{parameter_count(build_model(11)):,}", architecture)

    def test_documented_device_bundle_size_adds_up(self):
        architecture = (SOURCE_ROOT / "Architecture.md").read_text(encoding="utf-8")
        rows = re.findall(r"^\| `([^`]+)` \| ([\d,]+) \| 필요 \|$", architecture, flags=re.MULTILINE)
        self.assertEqual(len(rows), 6)
        total = sum(int(size.replace(",", "")) for _, size in rows)
        self.assertIn(f"{total:,}", architecture)

    def test_gitignore_keeps_recordings_and_weights_out(self):
        ignore = (SOURCE_ROOT / ".gitignore").read_text(encoding="utf-8")
        for pattern in (".venv/", "cpp/build/", "data/*", "models/*", "__pycache__/"):
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, ignore)


if __name__ == "__main__":
    unittest.main()
