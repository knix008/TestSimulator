import unittest

import numpy as np

from kws.features import (
    FEATURE_VERSION,
    FeatureExtractor,
    FrontendConfig,
    fit_length,
    hann_window,
    mel_filterbank,
    prepare_waveform,
)
from test.helpers import temp_dir


def sine(freq: float, amplitude: float = 0.2, samples: int = 16000) -> np.ndarray:
    time_axis = np.arange(samples, dtype=np.float32) / 16000.0
    return (amplitude * np.sin(2 * np.pi * freq * time_axis)).astype(np.float32)


def fitted_extractor() -> FeatureExtractor:
    extractor = FeatureExtractor()
    noise = np.random.default_rng(0).normal(0, 0.1, size=(3, 16000)).astype(np.float32)
    extractor.fit([sine(440), sine(1200), *noise])
    return extractor


class FrontendConfigTest(unittest.TestCase):
    def test_default_contract(self):
        cfg = FrontendConfig()
        self.assertEqual(cfg.n_samples, 16000)
        self.assertEqual(cfg.n_frames, 98)
        self.assertEqual(cfg.n_freqs, 257)
        self.assertEqual(FEATURE_VERSION, 1)

    def test_rejects_fmax_above_nyquist(self):
        with self.assertRaises(ValueError):
            FrontendConfig(fmax=8000.0)


class FilterTest(unittest.TestCase):
    def test_mel_filterbank_shape_and_coverage(self):
        mel = mel_filterbank(16000, 512, 40, 80.0, 7600.0)
        self.assertEqual(mel.shape, (40, 257))
        self.assertTrue(np.all(mel >= 0))
        self.assertTrue(np.all(mel.sum(axis=1) > 0))

    def test_hann_window_is_symmetric(self):
        window = hann_window(400)
        self.assertEqual(window.shape, (400,))
        self.assertAlmostEqual(float(window[0]), 0.0, places=6)
        np.testing.assert_allclose(window, window[::-1], atol=1e-6)


class WaveformTest(unittest.TestCase):
    def test_short_audio_is_centered(self):
        out = fit_length(np.ones(8000, dtype=np.float32), 16000, 160)
        self.assertEqual(out.shape, (16000,))
        self.assertEqual(float(out[:4000].sum()), 0.0)
        self.assertEqual(float(out[4000:12000].sum()), 8000.0)

    def test_long_audio_keeps_loudest_second(self):
        wav = np.zeros(32000, dtype=np.float32)
        wav[20000:24000] = 0.5
        out = fit_length(wav, 16000, 160)
        self.assertEqual(out.shape, (16000,))
        self.assertAlmostEqual(float(np.abs(out).sum()), 2000.0, places=3)

    def test_empty_audio_becomes_silence(self):
        out = fit_length(np.zeros(0, dtype=np.float32), 16000, 160)
        self.assertEqual(out.shape, (16000,))

    def test_peak_normalized_to_target(self):
        out = prepare_waveform(sine(440), FrontendConfig())
        self.assertAlmostEqual(float(np.max(np.abs(out))), 0.9, places=3)

    def test_quiet_audio_not_amplified(self):
        cfg = FrontendConfig()
        out = prepare_waveform(sine(200, amplitude=0.001), cfg)
        self.assertLess(float(np.max(np.abs(out))), cfg.peak_min)

    def test_inference_path_is_deterministic(self):
        wav = np.random.default_rng(1).normal(0, 0.1, 32000).astype(np.float32)
        cfg = FrontendConfig()
        np.testing.assert_array_equal(prepare_waveform(wav, cfg), prepare_waveform(wav, cfg))

    def test_augmentation_changes_training_input(self):
        wav = sine(440)
        cfg = FrontendConfig()
        rng = np.random.default_rng(5)
        augmented = prepare_waveform(wav, cfg, augment=True, rng=rng)
        self.assertEqual(augmented.shape, (16000,))
        self.assertFalse(np.array_equal(augmented, prepare_waveform(wav, cfg)))


class ExtractorTest(unittest.TestCase):
    def test_transform_shape_and_finite(self):
        feature = fitted_extractor().transform(sine(440))
        self.assertEqual(feature.shape, (1, 40, 98))
        self.assertEqual(feature.dtype, np.float32)
        self.assertTrue(np.all(np.isfinite(feature)))

    def test_transform_requires_fit(self):
        with self.assertRaises(RuntimeError):
            FeatureExtractor().transform(sine(440))

    def test_tone_energy_lands_in_matching_mel_band(self):
        extractor = FeatureExtractor()
        low = extractor.log_mel(prepare_waveform(sine(300), extractor.cfg))
        high = extractor.log_mel(prepare_waveform(sine(3000), extractor.cfg))
        self.assertLess(int(np.argmax(low.mean(axis=1))), int(np.argmax(high.mean(axis=1))))

    def test_save_and_load_round_trip(self):
        extractor = fitted_extractor()
        path = temp_dir() / "frontend.npz"
        extractor.save(path)
        loaded = FeatureExtractor.load(path)
        np.testing.assert_array_equal(loaded.mean, extractor.mean)
        np.testing.assert_array_equal(loaded.std, extractor.std)
        np.testing.assert_array_equal(loaded.transform(sine(440)), extractor.transform(sine(440)))

    def test_runtime_files_for_cpp(self):
        extractor = fitted_extractor()
        out = temp_dir()
        extractor.write_runtime_files(out, ["출근", "무음"], "무음")
        mel = np.fromfile(out / "mel_filters.bin", dtype=np.float32)
        self.assertEqual(mel.size, 40 * 257)
        self.assertEqual(np.fromfile(out / "window.bin", dtype=np.float32).size, 400)
        norm = np.fromfile(out / "norm.bin", dtype=np.float32)
        np.testing.assert_array_equal(norm[:40], extractor.mean)
        np.testing.assert_array_equal(norm[40:], extractor.std)
        frontend = (out / "frontend.txt").read_text(encoding="utf-8")
        self.assertIn("silence_index=1", frontend)
        self.assertIn("n_frames=98", frontend)
        self.assertEqual((out / "labels.txt").read_text(encoding="utf-8").split(), ["출근", "무음"])

    def test_runtime_files_require_silence_label(self):
        with self.assertRaises(ValueError):
            fitted_extractor().write_runtime_files(temp_dir(), ["출근"], "무음")


if __name__ == "__main__":
    unittest.main()
