import os
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

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


def build_kws_infer() -> Path:
    """scripts/build_kws_infer.ps1로 kws_infer를 빌드한다. ONNX Runtime이 없으면 공식 패키지를 받는다."""
    if "kws_infer" not in _exe:
        completed = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(SOURCE_ROOT / "scripts" / "build_kws_infer.ps1"),
                "-BuildDir",
                str(SOURCE_ROOT / "cpp" / "build" / "test_msvc"),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=1200,
        )
        if completed.returncode != 0:
            raise AssertionError(completed.stdout[-4000:] + completed.stderr[-4000:])
        _exe["kws_infer"] = Path(parse_keys(completed.stdout)["KWS_INFER"])
    return _exe["kws_infer"]


def cpp_probs(stdout: str, labels: list[str]) -> np.ndarray:
    found: dict[str, float] = {}
    for line in stdout.splitlines():
        name, tab, value = line.partition("\t")
        if tab and name in labels:
            found[name] = float(value)
    return np.array([found[label] for label in labels], dtype=np.float64)


@unittest.skipUnless(sys.platform == "win32", "kws_infer 빌드는 Windows MSVC 기준입니다")
class CppOnnxInferTest(unittest.TestCase):
    """C++ kws_infer가 두 구조의 ONNX에서 Python과 같은 확률과 판정을 내는지 확인한다."""

    def check_arch(self, arch: str) -> None:
        from kws.infer import ModelBundle, decide

        exe = build_kws_infer()
        audio, model = trained_model(arch)
        bundle = ModelBundle(model)
        classifier = bundle.classifier("onnx")
        for label in bundle.labels:
            with self.subTest(arch=arch, label=label):
                wav_path = sorted((audio / label).glob("*.wav"))[0]
                completed = subprocess.run(
                    [str(exe), str(model), str(wav_path), "0.5"], capture_output=True, text=True, encoding="utf-8"
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                values = parse_keys(completed.stdout)
                expected = classifier.predict_proba(load_model_wav(wav_path))
                # C++는 확률을 소수 셋째 자리까지 출력한다.
                np.testing.assert_allclose(cpp_probs(completed.stdout, bundle.labels), expected, atol=2e-3)
                decision = decide(expected, bundle.labels, bundle.silence_label, 0.5)
                self.assertEqual(values["TOP_LABEL"], decision.top_label)
                self.assertEqual(values["ACCEPTED"], "1" if decision.accepted else "0")
                self.assertEqual(values["LABEL"], decision.label)
                self.assertEqual(values["TOP_LABEL"], label)

    def test_kws_infer_matches_python_dscnn(self):
        self.check_arch("dscnn_v2")

    def test_kws_infer_matches_python_bc_resnet(self):
        self.check_arch("bcresnet1")

    def test_kws_infer_usage_and_bad_model(self):
        exe = build_kws_infer()
        self.assertEqual(subprocess.run([str(exe)], capture_output=True).returncode, 2)
        audio, _ = trained_model()
        wav = sorted((audio / "경비").glob("*.wav"))[0]
        completed = subprocess.run([str(exe), str(temp_dir()), str(wav)], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(completed.returncode, 1)


if __name__ == "__main__":
    unittest.main()
