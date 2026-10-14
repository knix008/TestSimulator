import os
import shutil
import subprocess
import unittest

import numpy as np

from kws.audio import load_model_wav, save_wav
from kws.features import FeatureExtractor
from kws.paths import SOURCE_ROOT
from test.helpers import find_gpp, parse_keys, temp_dir, trained_model

_exe = {}


def build_test_logmel():
    if "path" not in _exe:
        gpp = find_gpp()
        out = temp_dir() / "test_logmel.exe"
        base = [str(gpp), "-std=c++17", "-O2", "-I", str(SOURCE_ROOT / "cpp"), "-o", str(out), str(SOURCE_ROOT / "cpp" / "test_logmel.cpp")]
        completed = subprocess.run([*base[:3], "-static", *base[3:]], capture_output=True, text=True)
        if completed.returncode != 0:
            completed = subprocess.run(base, capture_output=True, text=True)
        if completed.returncode != 0:
            raise AssertionError(completed.stderr)
        _exe["path"] = out
    return _exe["path"]


def run_exe(exe, *args):
    env = os.environ.copy()
    gpp = find_gpp()
    if gpp is not None:
        env["PATH"] = str(gpp.parent) + os.pathsep + env.get("PATH", "")
    return subprocess.run(
        [str(exe), *map(str, args)], capture_output=True, text=True, encoding="utf-8", errors="replace", env=env
    )


@unittest.skipIf(find_gpp() is None, "g++가 없습니다")
class CppLogMelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exe = build_test_logmel()
        cls.extractor = FeatureExtractor()
        rng = np.random.default_rng(0)
        time_axis = np.arange(16000, dtype=np.float32) / 16000.0
        cls.tone = (0.25 * np.sin(2 * np.pi * 523 * time_axis)).astype(np.float32)
        cls.extractor.fit([cls.tone, *rng.normal(0, 0.15, size=(4, 16000)).astype(np.float32)])

    def compare(self, wav, sample_rate=16000):
        folder = temp_dir()
        self.extractor.write_runtime_files(folder, ["출근", "무음"], "무음")
        wav_path = folder / "sample.wav"
        save_wav(wav_path, wav, sample_rate)
        expected = self.extractor.transform(load_model_wav(wav_path)).reshape(-1)
        out = folder / "cpp.bin"
        completed = run_exe(self.exe, folder, wav_path, out)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        got = np.fromfile(out, dtype=np.float32)
        self.assertEqual(got.shape, expected.shape)
        self.assertLess(float(np.max(np.abs(got - expected))), 2e-3)

    def test_exact_second(self):
        self.compare(self.tone)

    def test_long_clip_picks_loudest_second(self):
        self.compare(np.concatenate([np.zeros(2000, np.float32), self.tone, np.zeros(4000, np.float32)]))

    def test_short_clip_is_padded(self):
        self.compare(self.tone[:8000])

    def test_quiet_clip(self):
        self.compare((self.tone * 0.004).astype(np.float32))

    def test_wrong_sample_rate_is_rejected(self):
        folder = temp_dir()
        self.extractor.write_runtime_files(folder, ["출근", "무음"], "무음")
        wav_path = folder / "8k.wav"
        save_wav(wav_path, np.zeros(8000, np.float32), 8000)
        completed = run_exe(self.exe, folder, wav_path, folder / "out.bin")
        self.assertEqual(completed.returncode, 1)

    def test_usage_message(self):
        self.assertEqual(run_exe(self.exe).returncode, 2)


@unittest.skipUnless(os.environ.get("ONNXRUNTIME_ROOT"), "ONNXRUNTIME_ROOT가 없어 kws_infer를 빌드하지 않습니다")
class CppOnnxInferTest(unittest.TestCase):
    def test_kws_infer_matches_python(self):
        root = os.environ["ONNXRUNTIME_ROOT"]
        build = temp_dir() / "build"
        cmake = shutil.which("cmake")
        self.assertIsNotNone(cmake, "cmake가 필요합니다")
        subprocess.run([cmake, "-S", str(SOURCE_ROOT / "cpp"), "-B", str(build), f"-DONNXRUNTIME_ROOT={root}"], check=True)
        subprocess.run([cmake, "--build", str(build), "--config", "Release"], check=True)
        exe = next(path for path in (build / "Release" / "kws_infer.exe", build / "kws_infer.exe", build / "kws_infer") if path.exists())
        for dll in list((os.path.join(root, "lib"),)):
            for item in os.listdir(dll):
                if item.endswith(".dll"):
                    shutil.copy2(os.path.join(dll, item), exe.parent)
        audio, model = trained_model()
        wav = sorted((audio / "경비").glob("*.wav"))[0]
        completed = subprocess.run([str(exe), str(model), str(wav), "0.5"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(parse_keys(completed.stdout).get("TOP_LABEL"), "경비")


if __name__ == "__main__":
    unittest.main()
