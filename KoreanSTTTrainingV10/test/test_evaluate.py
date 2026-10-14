import csv
import unittest
from pathlib import Path

import numpy as np

from kws import evaluate
from kws.evaluate import EvalItem
from kws.infer import ModelBundle, decide
from kws.project import SILENCE_LABEL
from test.helpers import LABELS, parse_keys, run_module, temp_dir, trained_model
from test.test_synth_practice import write_heldout


def probs_for(label, confidence):
    values = np.full(len(LABELS), (1.0 - confidence) / (len(LABELS) - 1), dtype=np.float32)
    values[LABELS.index(label)] = confidence
    return values


def item(expected, recognized, confidence, name="x.wav"):
    return EvalItem(Path(name), expected, probs_for(recognized, confidence))


class ExpectedLabelTest(unittest.TestCase):
    def check(self, relative, expected, root=Path("C:/eval")):
        self.assertEqual(evaluate.expected_label(root / relative, root, LABELS, SILENCE_LABEL), expected)

    def test_folder_names(self):
        self.check("출근/0001.wav", "출근")
        self.check("깨끗/퇴근/0001.wav", "퇴근")
        self.check("무음/0001.wav", SILENCE_LABEL)
        self.check("다른말/0001.wav", SILENCE_LABEL)
        self.check("소음/0001.wav", SILENCE_LABEL)

    def test_root_itself_is_a_label_folder(self):
        self.check("0001.wav", "경비", root=Path("C:/eval/경비"))

    def test_file_name_prefix(self):
        self.check("base/해제_r+4.wav", "해제")

    def test_unknown_is_skipped(self):
        self.check("기타/0001.wav", None)

    def test_collect_counts_skipped(self):
        root = temp_dir()
        for relative in ("출근/a.wav", "다른말/b.wav", "모름/c.wav"):
            (root / relative).parent.mkdir(parents=True, exist_ok=True)
            (root / relative).write_bytes(b"")
        found, skipped = evaluate.collect(root, LABELS, SILENCE_LABEL)
        self.assertEqual(sorted(label for _, label in found), sorted(["출근", SILENCE_LABEL]))
        self.assertEqual(skipped, 1)

    def test_missing_folder(self):
        with self.assertRaises(FileNotFoundError):
            evaluate.collect(temp_dir() / "없음", LABELS, SILENCE_LABEL)


class ScoringTest(unittest.TestCase):
    def outcome(self, expected, recognized, confidence, threshold=0.7):
        decision = decide(probs_for(recognized, confidence), LABELS, SILENCE_LABEL, threshold)
        return evaluate.outcome(expected, decision, SILENCE_LABEL)

    def test_outcomes(self):
        self.assertEqual(self.outcome("출근", "출근", 0.9), "정답")
        self.assertEqual(self.outcome("출근", "출근", 0.6), "놓침")
        self.assertEqual(self.outcome("출근", SILENCE_LABEL, 0.9), "놓침")
        self.assertEqual(self.outcome("출근", "퇴근", 0.9), "오인식")
        self.assertEqual(self.outcome(SILENCE_LABEL, SILENCE_LABEL, 0.9), "정답")
        self.assertEqual(self.outcome(SILENCE_LABEL, "해제", 0.6), "정답")
        self.assertEqual(self.outcome(SILENCE_LABEL, "해제", 0.9), "오수락")

    def sample(self):
        return [
            item("출근", "출근", 0.95),
            item("출근", "출근", 0.65),
            item("퇴근", "경비", 0.80),
            item("경비", "경비", 0.90),
            item(SILENCE_LABEL, SILENCE_LABEL, 0.90),
            item(SILENCE_LABEL, "해제", 0.75),
        ]

    def test_summary_counts(self):
        summary = evaluate.summarize(self.sample(), LABELS, SILENCE_LABEL, 0.70)
        self.assertEqual((summary.total, summary.correct), (6, 3))
        self.assertEqual((summary.command_total, summary.command_hits), (4, 2))
        self.assertEqual((summary.missed, summary.confused), (1, 1))
        self.assertEqual((summary.reject_total, summary.false_accepts), (2, 1))
        self.assertEqual(summary.per_command["출근"], [1, 2])
        self.assertEqual(summary.per_command["해제"], [0, 0])
        self.assertEqual(summary.confusion[("출근", "대기")], 1)
        self.assertEqual(summary.confusion[("퇴근", "경비")], 1)
        self.assertAlmostEqual(summary.hit_rate, 0.5)
        self.assertAlmostEqual(summary.false_accept_rate, 0.5)

    def test_threshold_sweep_and_recommendation(self):
        sweep = evaluate.threshold_sweep(self.sample(), LABELS, SILENCE_LABEL)
        self.assertEqual(sweep[0][0], 0.40)
        self.assertEqual(sweep[-1][0], 0.95)
        hit_rates = [row[1] for row in sweep]
        self.assertEqual(hit_rates, sorted(hit_rates, reverse=True))
        best = evaluate.recommend_threshold(sweep)
        self.assertEqual(best, 0.80)
        self.assertIsNone(evaluate.recommend_threshold([]))

    def test_report_text(self):
        text = evaluate.report(self.sample(), LABELS, SILENCE_LABEL, 0.70, skipped=2)
        self.assertIn("건너뜀 2개", text)
        self.assertIn("전체 정답률 50% (3/6)", text)
        self.assertIn("놓침 1 · 오인식 1", text)
        self.assertIn("오수락 1", text)
        self.assertIn("혼동표", text)
        self.assertIn("← 현재", text)
        self.assertIn("추천 임계값 0.80", text)

    def test_report_without_reject_samples(self):
        text = evaluate.report([item("출근", "출근", 0.9)], LABELS, SILENCE_LABEL, 0.70)
        self.assertIn("오수락은 확인하지 못했습니다", text)
        self.assertNotIn("추천 임계값", text)

    def test_csv(self):
        path = temp_dir() / "out" / "eval.csv"
        evaluate.write_csv(path, self.sample(), LABELS, SILENCE_LABEL, 0.70)
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.reader(handle))
        self.assertEqual(rows[0][:5], ["파일", "정답", "인식", "결과", "최대 확률"])
        self.assertEqual(rows[0][5:], LABELS)
        self.assertEqual(len(rows), 7)
        self.assertEqual(rows[3][1:4], ["퇴근", "경비", "오인식"])


class ModelEvaluationTest(unittest.TestCase):
    def test_folder_with_trained_model(self):
        _, model = trained_model()
        bundle = ModelBundle(model)
        folder = write_heldout(temp_dir())
        seen = []
        items, skipped = evaluate.evaluate_folder(
            bundle.classifier("onnx"), folder, bundle.labels, bundle.silence_label, on_item=seen.append
        )
        self.assertEqual((len(items), skipped, len(seen)), (30, 0, 30))
        summary = evaluate.summarize(items, bundle.labels, bundle.silence_label, 0.5)
        self.assertEqual(summary.correct, 30)

    def test_stop_request(self):
        _, model = trained_model()
        bundle = ModelBundle(model)
        seen = []
        items, _ = evaluate.evaluate_folder(
            bundle.classifier("onnx"),
            write_heldout(temp_dir()),
            bundle.labels,
            bundle.silence_label,
            on_item=seen.append,
            should_stop=lambda: len(seen) >= 4,
        )
        self.assertEqual(len(items), 4)

    def test_folder_without_known_labels(self):
        _, model = trained_model()
        bundle = ModelBundle(model)
        folder = temp_dir()
        (folder / "모름").mkdir()
        (folder / "모름" / "a.wav").write_bytes(b"")
        with self.assertRaises(FileNotFoundError):
            evaluate.evaluate_folder(bundle.classifier("onnx"), folder, bundle.labels, bundle.silence_label)


class EvaluateCliTest(unittest.TestCase):
    def test_reports_and_writes_csv(self):
        _, model = trained_model()
        folder = write_heldout(temp_dir())
        csv_path = temp_dir() / "eval.csv"
        completed = run_module(
            "kws.evaluate", str(folder), "--model", str(model), "--threshold", "0.5", "--csv", str(csv_path), root=temp_dir()
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        values = parse_keys(completed.stdout)
        self.assertEqual(values["TOTAL"], "30")
        self.assertEqual(values["CORRECT"], "30")
        self.assertEqual(values["FALSE_ACCEPTS"], "0")
        self.assertIn("명령별 인식률", completed.stdout)
        self.assertTrue(csv_path.is_file())

    def test_missing_model(self):
        completed = run_module("kws.evaluate", str(write_heldout(temp_dir())), root=temp_dir())
        self.assertEqual(completed.returncode, 1)
        self.assertIn("학습된 모델이 없습니다", completed.stderr)


if __name__ == "__main__":
    unittest.main()
