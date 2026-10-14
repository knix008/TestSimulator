import json
import shutil
import unittest

import numpy as np
import onnx
import onnxruntime as ort
import torch

from kws import paths
from kws.export import export_onnx
from kws.features import FeatureExtractor
from kws.model import build_model
from kws.train import TrainOptions, train_project
from test.helpers import LABELS, run_module, temp_dir, train_result, trained_model, write_tone_dataset


class TrainTest(unittest.TestCase):
    def test_learns_distinct_tones(self):
        result = train_result()
        self.assertTrue(result.export_ok, result.export_log)
        self.assertGreaterEqual(result.val_accuracy, 0.9, result.report)
        self.assertEqual(result.parameter_count, 17381)
        self.assertGreater(len(result.history), 0)
        self.assertIn("클래스별 검증 결과", result.report)

    def test_default_options_give_confident_predictions(self):
        from kws.audio import load_model_wav
        from kws.infer import ModelBundle

        audio, model = trained_model()
        classifier = ModelBundle(model).classifier("onnx")
        confidences = [
            float(classifier.predict_proba(load_model_wav(path))[index])
            for index, label in enumerate(LABELS)
            for path in sorted((audio / label).glob("*.wav"))[:4]
        ]
        self.assertGreaterEqual(float(np.mean(confidences)), 0.7)

    def test_writes_all_model_files(self):
        _, model = trained_model()
        for name in (
            paths.ONNX_FILENAME,
            paths.ONNX_INT8_FILENAME,
            paths.CHECKPOINT_FILENAME,
            paths.FRONTEND_NPZ,
            paths.META_FILENAME,
            "labels.txt",
            "frontend.txt",
            "mel_filters.bin",
            "window.bin",
            "norm.bin",
        ):
            with self.subTest(name=name):
                self.assertTrue((model / name).is_file())
        meta = json.loads((model / paths.META_FILENAME).read_text(encoding="utf-8"))
        self.assertEqual(meta["labels"], LABELS)
        self.assertEqual(meta["input_shape"], [1, 1, 40, 98])
        self.assertEqual(meta["arch"], "dscnn_v2")

    def test_too_few_clips_is_reported(self):
        audio = temp_dir() / "audio"
        write_tone_dataset(audio, count=3)
        with self.assertRaisesRegex(ValueError, "최소 4개"):
            train_project(audio, LABELS, temp_dir() / "model", TrainOptions(epochs=1))

    def test_needs_silence_label(self):
        with self.assertRaises(ValueError):
            train_project(temp_dir(), ["출근", "퇴근"], temp_dir(), TrainOptions(epochs=1))

    def test_stop_request_before_first_epoch(self):
        audio = temp_dir() / "audio"
        write_tone_dataset(audio, count=4)
        with self.assertRaises(RuntimeError):
            train_project(audio, LABELS, temp_dir() / "model", TrainOptions(epochs=3), should_stop=lambda: True)

    def test_events_reach_callback(self):
        audio = temp_dir() / "audio"
        write_tone_dataset(audio, count=4)
        events = []
        result = train_project(
            audio, LABELS, temp_dir() / "model", TrainOptions(epochs=2, make_int8=False), on_event=events.append
        )
        self.assertEqual([event["epoch"] for event in events if event["type"] == "epoch"], [1, 2])
        self.assertTrue(result.export_ok)


class ExportTest(unittest.TestCase):
    def test_onnx_contract(self):
        _, model = trained_model()
        loaded = onnx.load(str(model / paths.ONNX_FILENAME))
        onnx.checker.check_model(loaded)
        session = ort.InferenceSession(str(model / paths.ONNX_FILENAME), providers=["CPUExecutionProvider"])
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        self.assertEqual(inputs[0].name, "logmel")
        self.assertEqual(list(inputs[0].shape), [1, 1, 40, 98])
        self.assertEqual(outputs[0].name, "logits")
        self.assertEqual(list(outputs[0].shape), [1, 5])

    def test_onnx_matches_pytorch(self):
        audio, model = trained_model()
        extractor = FeatureExtractor.load(model / paths.FRONTEND_NPZ)
        net = build_model(len(LABELS))
        net.load_state_dict(torch.load(model / paths.CHECKPOINT_FILENAME, map_location="cpu", weights_only=True))
        net.eval()
        session = ort.InferenceSession(str(model / paths.ONNX_FILENAME), providers=["CPUExecutionProvider"])
        from kws.audio import load_model_wav

        for label in LABELS:
            wav = load_model_wav(sorted((audio / label).glob("*.wav"))[0])
            feature = extractor.transform(wav)[None, ...]
            with torch.no_grad():
                expected = net(torch.from_numpy(feature)).numpy()
            got = session.run(None, {"logmel": feature})[0]
            np.testing.assert_allclose(got, expected, atol=1e-3)

    def test_int8_is_smaller(self):
        _, model = trained_model()
        float_size = (model / paths.ONNX_FILENAME).stat().st_size
        int8_size = (model / paths.ONNX_INT8_FILENAME).stat().st_size
        self.assertLess(int8_size, float_size)

    def test_reexport_from_checkpoint(self):
        audio, model = trained_model()
        copy = temp_dir() / "model"
        shutil.copytree(model, copy)
        (copy / paths.ONNX_FILENAME).unlink()
        (copy / paths.ONNX_INT8_FILENAME).unlink()
        log = export_onnx(copy, audio, make_int8=True)
        self.assertIn("PyTorch와 최대 로짓 차이", log)
        self.assertIn("INT8 상위 클래스 일치", log)
        self.assertTrue((copy / paths.ONNX_FILENAME).is_file())

    def test_export_without_model_fails(self):
        with self.assertRaises(FileNotFoundError):
            export_onnx(temp_dir())

    def test_export_rejects_foreign_model(self):
        _, model = trained_model()
        copy = temp_dir() / "model"
        shutil.copytree(model, copy)
        meta = json.loads((copy / paths.META_FILENAME).read_text(encoding="utf-8"))
        meta["arch"] = "other"
        (copy / paths.META_FILENAME).write_text(json.dumps(meta), encoding="utf-8")
        with self.assertRaises(ValueError):
            export_onnx(copy)


class TrainExportCliTest(unittest.TestCase):
    def test_train_and_export_commands(self):
        audio, _ = trained_model()
        root = temp_dir()
        shutil.copytree(audio, root / "data" / "audio")
        trained = run_module("kws.train", "--epochs", "3", "--no-int8", root=root)
        self.assertEqual(trained.returncode, 0, trained.stderr + trained.stdout)
        self.assertIn("저장 위치", trained.stdout)
        self.assertTrue((root / "models" / "latest" / paths.ONNX_FILENAME).is_file())
        exported = run_module("kws.export", "--no-int8", root=root)
        self.assertEqual(exported.returncode, 0, exported.stderr + exported.stdout)
        self.assertIn("ONNX 저장", exported.stdout)

    def test_train_command_without_recordings_fails(self):
        completed = run_module("kws.train", "--epochs", "1", root=temp_dir())
        self.assertEqual(completed.returncode, 1)
        self.assertIn("최소 4개", completed.stderr)

    def test_synth_data_is_used_by_default(self):
        root = temp_dir()
        write_tone_dataset(root / "data" / "synth" / "train", count=8)
        completed = run_module("kws.train", "--epochs", "2", "--no-int8", root=root)
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        self.assertIn("학습 데이터: 합성, 내 녹음", completed.stdout)
        meta = json.loads((root / "models" / "latest" / paths.META_FILENAME).read_text(encoding="utf-8"))
        self.assertEqual([source["clips"] for source in meta["sources"]], [40, 0])
        skipped = run_module("kws.train", "--epochs", "1", "--no-synth", root=root)
        self.assertEqual(skipped.returncode, 1)

    def test_finetune_command(self):
        audio, model = trained_model()
        root = temp_dir()
        write_tone_dataset(root / "data" / "audio", count=4, seed=31)
        completed = run_module("kws.train", "--finetune", str(model), "--epochs", "2", "--no-int8", root=root)
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        self.assertIn("추가 학습 전 검증 정확도", completed.stdout)
        meta = json.loads((root / "models" / "speaker" / paths.META_FILENAME).read_text(encoding="utf-8"))
        self.assertEqual(meta["init_from"], str(model))
        self.assertEqual(meta["learning_rate"], 5e-4)
        bad = run_module("kws.train", "--out", "a/b", root=root)
        self.assertEqual(bad.returncode, 1)


class SourcesAndFinetuneTest(unittest.TestCase):
    def test_multiple_sources_with_repeat(self):
        from kws.train import DataSource

        synth = temp_dir()
        mine = temp_dir()
        write_tone_dataset(synth, count=10, seed=1)
        write_tone_dataset(mine, count=5, seed=2)
        events = []
        result = train_project(
            [DataSource(synth, "합성"), DataSource(mine, "내 녹음", 3)],
            LABELS,
            temp_dir() / "model",
            TrainOptions(epochs=3, make_int8=False),
            on_event=events.append,
        )
        self.assertEqual(set(result.source_accuracy), {"합성", "내 녹음"})
        logs = [event["text"] for event in events if event["type"] == "log"]
        self.assertTrue(any(text.startswith("합성: 학습 40개, 검증 10개") for text in logs), logs)
        self.assertTrue(any(text.startswith("내 녹음: 학습 20개, 검증 5개, 에폭마다 3번 사용") for text in logs), logs)
        meta = json.loads((result.model_dir / paths.META_FILENAME).read_text(encoding="utf-8"))
        self.assertEqual([(s["name"], s["clips"], s["repeat"]) for s in meta["sources"]], [("합성", 50, 1), ("내 녹음", 25, 3)])
        self.assertIn("내 녹음", result.report)

    def test_small_source_goes_to_training_only(self):
        from kws.train import _split_items

        files = {"출근": [(temp_dir() / f"{i}.wav", 0) for i in range(5)] + [(temp_dir() / "m.wav", 1)]}
        train, val = _split_items(files, ["출근"], 0.2, 1, 4)
        self.assertTrue(all(source == 0 for _, _, source in val))
        self.assertIn(1, [source for _, _, source in train])

    def test_finetune_starts_from_base_and_reports_before(self):
        audio, model = trained_model()
        mine = temp_dir()
        write_tone_dataset(mine, count=4, seed=17)
        out = temp_dir() / "speaker"
        result = train_project(
            mine, LABELS, out, TrainOptions(epochs=2, learning_rate=5e-4, make_int8=False, init_from=model)
        )
        self.assertIsNotNone(result.base_accuracy)
        self.assertGreaterEqual(result.base_accuracy["녹음"], 0.8)
        self.assertIn("추가 학습 전", result.report)
        base_norm = np.load(model / paths.FRONTEND_NPZ)
        new_norm = np.load(out / paths.FRONTEND_NPZ)
        for key in base_norm.files:
            np.testing.assert_array_equal(base_norm[key], new_norm[key])

    def test_finetune_rejects_different_commands(self):
        _, model = trained_model()
        mine = temp_dir()
        labels = ["출근", "퇴근", "무음"]
        write_tone_dataset(mine, count=4)
        with self.assertRaisesRegex(ValueError, "명령 구성이 달라"):
            train_project(mine, labels, temp_dir() / "x", TrainOptions(epochs=1, init_from=model))

    def test_finetune_needs_checkpoint(self):
        _, model = trained_model()
        copy = temp_dir() / "onnx_only"
        shutil.copytree(model, copy)
        (copy / paths.CHECKPOINT_FILENAME).unlink()
        with self.assertRaises(FileNotFoundError):
            train_project(model.parent / "audio", LABELS, temp_dir() / "x", TrainOptions(epochs=1, init_from=copy))


if __name__ == "__main__":
    unittest.main()
