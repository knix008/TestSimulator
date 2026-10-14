import unittest

import numpy as np

from kws.audio import load_model_wav
from kws.infer import REJECT_LABEL, ModelBundle, OnnxClassifier, TorchClassifier, decide, softmax
from test.helpers import LABELS, parse_keys, project_with_model, run_module, temp_dir, trained_model


class DecideTest(unittest.TestCase):
    labels = ["출근", "퇴근", "무음"]

    def test_softmax_sums_to_one(self):
        probs = softmax(np.array([1000.0, 1001.0, 999.0]))
        self.assertAlmostEqual(float(probs.sum()), 1.0, places=5)
        self.assertEqual(int(np.argmax(probs)), 1)

    def test_accepts_confident_command(self):
        decision = decide(np.array([0.9, 0.05, 0.05]), self.labels, "무음", 0.7)
        self.assertTrue(decision.accepted)
        self.assertEqual(decision.label, "출근")

    def test_silence_is_rejected(self):
        decision = decide(np.array([0.1, 0.1, 0.8]), self.labels, "무음", 0.7)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.label, REJECT_LABEL)
        self.assertEqual(decision.near_label, "출근")

    def test_low_confidence_is_rejected(self):
        decision = decide(np.array([0.5, 0.3, 0.2]), self.labels, "무음", 0.7)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.top_label, "출근")

    def test_threshold_boundary_is_inclusive(self):
        self.assertTrue(decide(np.array([0.7, 0.2, 0.1]), self.labels, "무음", 0.7).accepted)

    def test_label_count_mismatch(self):
        with self.assertRaises(ValueError):
            decide(np.array([0.5, 0.5]), self.labels, "무음", 0.7)


class ClassifierTest(unittest.TestCase):
    def test_bundle_lists_engines(self):
        _, model = trained_model()
        bundle = ModelBundle(model)
        self.assertEqual(bundle.labels, LABELS)
        self.assertEqual(bundle.silence_label, "무음")
        self.assertEqual(bundle.engines(), ["onnx", "pytorch"])
        self.assertIsInstance(bundle.classifier("onnx"), OnnxClassifier)
        self.assertIsInstance(bundle.classifier("pytorch"), TorchClassifier)
        with self.assertRaises(ValueError):
            bundle.classifier("tflite")

    def test_missing_model(self):
        with self.assertRaises(FileNotFoundError):
            ModelBundle(temp_dir())

    def test_recognizes_training_files_with_both_engines(self):
        audio, model = trained_model()
        bundle = ModelBundle(model)
        engines = {name: bundle.classifier(name) for name in ("onnx", "pytorch")}
        correct = 0
        total = 0
        for index, label in enumerate(LABELS):
            for path in sorted((audio / label).glob("*.wav"))[:6]:
                wav = load_model_wav(path)
                onnx_probs = engines["onnx"].predict_proba(wav)
                torch_probs = engines["pytorch"].predict_proba(wav)
                np.testing.assert_allclose(onnx_probs, torch_probs, atol=1e-3)
                correct += int(int(np.argmax(onnx_probs)) == index)
                total += 1
        self.assertGreaterEqual(correct / total, 0.9)


class InferCliTest(unittest.TestCase):
    def test_reports_machine_readable_result(self):
        root = project_with_model(temp_dir())
        wav = sorted((root / "data" / "audio" / "경비").glob("*.wav"))[0]
        completed = run_module("kws.infer", str(wav), "0.5", root=root)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        values = parse_keys(completed.stdout)
        self.assertEqual(values["ENGINE"], "onnx")
        self.assertEqual(values["TOP_LABEL"], "경비")
        self.assertEqual(values["ACCEPTED"], "1")
        self.assertEqual(values["LABEL"], "경비")

    def test_silence_returns_wait(self):
        root = project_with_model(temp_dir())
        wav = sorted((root / "data" / "audio" / "무음").glob("*.wav"))[0]
        completed = run_module("kws.infer", str(wav), "--engine", "pytorch", root=root)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        values = parse_keys(completed.stdout)
        self.assertEqual(values["ACCEPTED"], "0")
        self.assertEqual(values["LABEL"], "대기")
        self.assertEqual(values["ENGINE"], "pytorch")

    def test_missing_model_is_an_error(self):
        root = temp_dir()
        audio, _ = trained_model()
        wav = sorted((audio / "출근").glob("*.wav"))[0]
        completed = run_module("kws.infer", str(wav), root=root)
        self.assertEqual(completed.returncode, 1)
        self.assertIn("학습된 모델이 없습니다", completed.stderr)


if __name__ == "__main__":
    unittest.main()
