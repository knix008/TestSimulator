import unittest

import numpy as np

from kws import practice, synth_eval
from kws.audio import save_wav
from kws.project import SILENCE_LABEL
from test.helpers import LABELS, korean_voice_available, kws_root, temp_dir, tone, trained_model

COMMANDS = LABELS[:-1]


def write_heldout(root):
    rng = np.random.default_rng(21)
    for group in ("깨끗", "소음섞인"):
        for label in COMMANDS:
            for index in range(3):
                save_wav(root / group / label / f"{index:04d}.wav", tone(label, rng))
    for index in range(3):
        save_wav(root / "다른말" / f"{index:04d}.wav", tone(SILENCE_LABEL, rng))
        save_wav(root / "소음" / f"{index:04d}.wav", tone(SILENCE_LABEL, rng))
    return root


class SignalTest(unittest.TestCase):
    def test_pitch_shift_changes_length(self):
        wav = np.ones(16000, dtype=np.float32)
        self.assertEqual(synth_eval._pitch_shift(wav, 1.0).size, 16000)
        self.assertEqual(synth_eval._pitch_shift(wav, 1.1).size, round(16000 / 1.1))
        self.assertEqual(synth_eval._pitch_shift(wav, 0.9).size, round(16000 / 0.9))

    def test_mix_noise_hits_requested_snr(self):
        rng = np.random.default_rng(0)
        time_axis = np.arange(160000) / 16000.0
        clean = (0.3 * np.sin(2 * np.pi * 440 * time_axis)).astype(np.float32)
        noisy = synth_eval._mix_noise(clean, 20.0, rng)
        noise = noisy - clean
        snr = 10 * np.log10(np.mean(clean.astype(np.float64) ** 2) / np.mean(noise.astype(np.float64) ** 2))
        self.assertAlmostEqual(float(snr), 20.0, delta=0.3)

    def test_noise_kinds(self):
        rng = np.random.default_rng(0)
        for kind in ("zero", "white", "hum60", "hum120", "muffled", "fan"):
            with self.subTest(kind=kind):
                wav = synth_eval._noise(kind, rng, 0.02)
                self.assertEqual(wav.shape, (16000,))
                self.assertTrue(np.all(np.isfinite(wav)))
        with self.assertRaises(ValueError):
            synth_eval._noise("rain", rng, 0.02)


class JobPlanTest(unittest.TestCase):
    def test_other_words_never_overlap_commands(self):
        self.assertEqual(synth_eval._other_words(["날씨", "경비실", "비"], ["경비"]), ["날씨"])

    def test_safe_file_names(self):
        self.assertEqual(synth_eval._safe_name("문 열어?"), "문_열어_")

    def test_heldout_rates_not_in_training(self):
        self.assertFalse(set(synth_eval.TRAIN_RATES) & set(synth_eval.TEST_RATES))

    def test_jobs_cover_commands_and_negatives(self):
        jobs = synth_eval._speech_jobs(temp_dir(), ["출근"])
        rates = sorted(rate for word, rate, _ in jobs if word == "출근")
        self.assertEqual(rates, sorted(synth_eval.TRAIN_RATES + synth_eval.TEST_RATES))
        words = {word for word, _, _ in jobs}
        self.assertTrue(set(synth_eval.TRAIN_OTHER) <= words)
        self.assertTrue(set(synth_eval.TEST_OTHER) <= words)

    def test_empty_command_list(self):
        with self.assertRaises(ValueError):
            synth_eval.generate_dataset([], temp_dir())


@unittest.skipUnless(korean_voice_available(), "Windows 한국어 음성이 없습니다")
class GenerateDatasetTest(unittest.TestCase):
    def test_generates_train_and_heldout_audio(self):
        root = temp_dir() / "synth"
        progress = []
        counts = synth_eval.generate_dataset(["출근", "문열어"], root, on_progress=progress.append)
        self.assertEqual(counts, {"출근": 35, "문열어": 35, SILENCE_LABEL: 51})
        self.assertEqual(len(list((root / "test" / "깨끗" / "문열어").glob("*.wav"))), 12)
        self.assertEqual(len(list((root / "test" / "소음섞인" / "출근").glob("*.wav"))), 12)
        self.assertEqual(len(list((root / "test" / "다른말").glob("*.wav"))), 16)
        self.assertEqual(len(list((root / "test" / "소음").glob("*.wav"))), 4)
        self.assertEqual(len(progress), 2)
        from kws.audio import load_model_wav

        clip = load_model_wav(sorted((root / "train" / "출근").glob("*.wav"))[0])
        self.assertGreater(float(np.max(np.abs(clip))), 0.05)


class PracticeTest(unittest.TestCase):
    def test_synth_folders_follow_project_root(self):
        root = temp_dir()
        with kws_root(root):
            self.assertEqual(practice.train_dir(), root / "data" / "synth" / "train")
            self.assertEqual(practice.test_dir(), root / "data" / "synth" / "test")
            self.assertEqual(synth_eval.synth_root(), root / "data" / "synth")
            self.assertFalse(practice.available())
            self.assertEqual(practice.missing_synth(["출근", SILENCE_LABEL]), ["출근", SILENCE_LABEL])
            for index in range(3):
                save_wav(practice.train_dir() / "출근" / f"{index:04d}.wav", np.zeros(1600, dtype=np.float32))
            self.assertTrue(practice.available())
            self.assertEqual(practice.synth_count("출근"), 3)
            self.assertEqual(practice.missing_synth(["출근", SILENCE_LABEL]), [SILENCE_LABEL])

    def test_training_sources(self):
        root = temp_dir()
        with kws_root(root):
            both = practice.training_sources(root / "data" / "audio", True, True, 3)
            self.assertEqual([(s.name, s.repeat) for s in both], [("합성", 1), ("내 녹음", 3)])
            self.assertEqual(both[0].root, practice.train_dir())
            self.assertEqual([s.name for s in practice.training_sources(root, False, True, 0)], ["내 녹음"])
            self.assertEqual(practice.training_sources(root, False, True, 0)[0].repeat, 1)
            with self.assertRaises(ValueError):
                practice.training_sources(root, False, False)

    def test_synth_eval_report(self):
        _, model = trained_model()
        report = synth_eval._evaluate(model, write_heldout(temp_dir()))
        self.assertIn("출근: 인정", report)
        self.assertIn("1순위 3/3", report)
        self.assertIn("소음 거절", report)


if __name__ == "__main__":
    unittest.main()
