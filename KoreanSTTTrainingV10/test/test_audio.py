import unittest

import numpy as np
import soundfile as sf

from kws.audio import (
    MicrophoneStream,
    apply_gain,
    clamp_gain,
    level_message,
    list_input_devices,
    load_audio,
    load_model_wav,
    peak_level,
    resample,
    save_wav,
)
from test.helpers import temp_dir


class WavIoTest(unittest.TestCase):
    def test_save_writes_16bit_pcm_and_reads_back(self):
        path = temp_dir() / "nested" / "clip.wav"
        wav = np.linspace(-0.5, 0.5, 16000, dtype=np.float32)
        save_wav(path, wav)
        info = sf.info(str(path))
        self.assertEqual(info.samplerate, 16000)
        self.assertEqual(info.subtype, "PCM_16")
        loaded, rate = load_audio(path)
        self.assertEqual(rate, 16000)
        np.testing.assert_allclose(loaded, wav, atol=1 / 32768 + 1e-6)

    def test_stereo_is_mixed_to_mono(self):
        path = temp_dir() / "stereo.wav"
        stereo = np.stack([np.full(100, 0.2), np.full(100, 0.4)], axis=1).astype(np.float32)
        sf.write(str(path), stereo, 16000)
        loaded, _ = load_audio(path)
        self.assertEqual(loaded.ndim, 1)
        self.assertAlmostEqual(float(loaded.mean()), 0.3, places=3)

    def test_model_wav_resamples_to_16k(self):
        path = temp_dir() / "22k.wav"
        save_wav(path, np.zeros(22050, dtype=np.float32), 22050)
        self.assertEqual(load_model_wav(path).size, 16000)

    def test_empty_wav_is_rejected(self):
        path = temp_dir() / "empty.wav"
        sf.write(str(path), np.zeros(0, dtype=np.float32), 16000)
        with self.assertRaises(RuntimeError):
            load_model_wav(path)


class ResampleTest(unittest.TestCase):
    def test_length_follows_rate(self):
        self.assertEqual(resample(np.zeros(48000, dtype=np.float32), 48000, 16000).size, 16000)
        self.assertEqual(resample(np.zeros(8000, dtype=np.float32), 8000, 16000).size, 16000)

    def test_same_rate_is_unchanged(self):
        wav = np.arange(10, dtype=np.float32)
        np.testing.assert_array_equal(resample(wav, 16000, 16000), wav)

    def test_tone_frequency_preserved(self):
        time_axis = np.arange(48000) / 48000.0
        wav = np.sin(2 * np.pi * 1000 * time_axis).astype(np.float32)
        out = resample(wav, 48000, 16000)
        spectrum = np.abs(np.fft.rfft(out))
        self.assertAlmostEqual(float(np.argmax(spectrum)) * 16000 / out.size, 1000.0, delta=5.0)

    def test_invalid_rate(self):
        with self.assertRaises(ValueError):
            resample(np.ones(10, dtype=np.float32), 0, 16000)


class LevelTest(unittest.TestCase):
    def test_peak_level(self):
        self.assertEqual(peak_level(np.zeros(0, dtype=np.float32)), 0.0)
        self.assertAlmostEqual(peak_level(np.array([0.1, -0.6], dtype=np.float32)), 0.6, places=6)

    def test_level_messages(self):
        self.assertIn("작습니다", level_message(0.01))
        self.assertIn("잘렸습니다", level_message(0.99))
        self.assertEqual(level_message(0.5), "소리 크기 50%.")

    def test_gain_scales_and_clips(self):
        wav = np.array([0.2, -0.4], dtype=np.float32)
        np.testing.assert_allclose(apply_gain(wav, 1.0), wav)
        np.testing.assert_allclose(apply_gain(wav, 2.0), np.array([0.4, -0.8], dtype=np.float32))
        self.assertEqual(float(apply_gain(np.array([0.6], dtype=np.float32), 4.0)[0]), 1.0)
        self.assertEqual(apply_gain(np.zeros(0, dtype=np.float32), 2.0).size, 0)

    def test_gain_is_clamped(self):
        self.assertEqual(clamp_gain(None), 1.0)
        self.assertEqual(clamp_gain(float("nan")), 1.0)
        self.assertEqual(clamp_gain(0.01), 0.25)
        self.assertEqual(clamp_gain(9), 4.0)


class DeviceTest(unittest.TestCase):
    def test_device_list_never_raises(self):
        devices = list_input_devices()
        self.assertIsInstance(devices, list)
        for index, name in devices:
            self.assertIsInstance(index, int)
            self.assertTrue(name)

    def test_microphone_buffer_keeps_last_window(self):
        mic = MicrophoneStream(window_sec=1.0)
        mic._capacity = 16000
        mic._chunks = [np.ones(10000, dtype=np.float32), np.full(10000, 2.0, dtype=np.float32)]
        data = mic.read()
        self.assertEqual(data.size, 16000)
        self.assertEqual(float(data[-1]), 2.0)
        self.assertEqual(float(data[0]), 1.0)
        mic.close()

    def test_microphone_read_applies_gain(self):
        mic = MicrophoneStream(window_sec=1.0, gain=2.0)
        mic._capacity = 4
        mic.stream_sr = mic.target_sr
        mic._chunks = [np.full(4, 0.4, dtype=np.float32)]
        np.testing.assert_allclose(mic.read(), np.full(4, 0.8, dtype=np.float32))
        mic.gain = 4.0
        mic._chunks = [np.full(4, 0.5, dtype=np.float32)]
        np.testing.assert_allclose(mic.read(), np.ones(4, dtype=np.float32))
        mic.close()


if __name__ == "__main__":
    unittest.main()
