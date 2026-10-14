"""로그멜 특징. C++ `cpp/logmel.hpp`와 같은 순서를 사용한다.

추론 순서:
1. 1초보다 길면 에너지가 가장 큰 1초, 짧으면 가운데 0 패딩
2. DC 제거
3. pre-emphasis
4. 피크가 peak_min 이상이면 peak_target으로 맞춤
5. [-1, 1]로 자름
6. 해닝 창, hop, zero-pad FFT의 파워 스펙트럼
7. 저장된 멜 필터를 곱하고 자연로그
8. 학습 집합의 멜 빈 평균/표준편차로 정규화

시간 이동, 소음, SpecAugment는 학습 중에만 적용한다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

FEATURE_VERSION = 1
INPUT_NAME = "logmel"
OUTPUT_NAME = "logits"


@dataclass(frozen=True)
class FrontendConfig:
    sample_rate: int = 16000
    duration_sec: float = 1.0
    n_fft: int = 512
    win_length: int = 400
    hop_length: int = 160
    n_mels: int = 40
    fmin: float = 80.0
    fmax: float = 7600.0
    log_eps: float = 1e-6
    preemphasis: float = 0.97
    peak_target: float = 0.9
    peak_min: float = 0.01

    def __post_init__(self) -> None:
        if self.n_frames <= 0:
            raise ValueError("오디오 길이에 비해 분석 창이 너무 깁니다.")
        need = (self.n_frames - 1) * self.hop_length + self.win_length
        if need > self.n_samples:
            raise ValueError("프레임 범위가 파형 길이를 넘습니다.")
        if self.fmax >= self.sample_rate / 2:
            raise ValueError("최대 주파수는 나이퀴스트 주파수보다 낮아야 합니다.")

    @property
    def n_samples(self) -> int:
        return int(round(self.sample_rate * self.duration_sec))

    @property
    def n_freqs(self) -> int:
        return self.n_fft // 2 + 1

    @property
    def n_frames(self) -> int:
        return (self.n_samples - self.win_length) // self.hop_length + 1


def hz_to_mel(hz: np.ndarray | float) -> np.ndarray | float:
    return 2595.0 * np.log10(1.0 + np.asarray(hz, dtype=np.float64) / 700.0)


def mel_to_hz(mel: np.ndarray) -> np.ndarray:
    return 700.0 * (np.power(10.0, np.asarray(mel, dtype=np.float64) / 2595.0) - 1.0)


def mel_filterbank(sample_rate: int, n_fft: int, n_mels: int, fmin: float, fmax: float) -> np.ndarray:
    n_freqs = n_fft // 2 + 1
    mels = np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), n_mels + 2, dtype=np.float64)
    hz = mel_to_hz(mels)
    bins = np.floor((n_fft + 1) * hz / sample_rate).astype(np.int32)
    bins = np.clip(bins, 0, n_freqs - 1)
    for index in range(1, bins.size):
        if bins[index] <= bins[index - 1]:
            bins[index] = bins[index - 1] + 1
    if int(bins[-1]) > n_freqs - 1:
        raise ValueError("멜 필터를 만들 주파수 빈이 부족합니다.")
    weights = np.zeros((n_mels, n_freqs), dtype=np.float32)
    for index in range(n_mels):
        left = int(bins[index])
        center = int(bins[index + 1])
        right = int(bins[index + 2])
        if center <= left or right <= center:
            raise ValueError("멜 필터 구간이 올바르지 않습니다.")
        for bin_index in range(left, center):
            weights[index, bin_index] = (bin_index - left) / (center - left)
        for bin_index in range(center, right):
            weights[index, bin_index] = (right - bin_index) / (right - center)
    if np.any(weights.sum(axis=1) <= 0):
        raise ValueError("비어 있는 멜 필터가 있습니다.")
    return np.ascontiguousarray(weights, dtype=np.float32)


def hann_window(length: int) -> np.ndarray:
    if length <= 1:
        return np.ones(length, dtype=np.float32)
    positions = np.arange(length, dtype=np.float32)
    return np.ascontiguousarray(0.5 - 0.5 * np.cos(2.0 * np.pi * positions / np.float32(length - 1)), dtype=np.float32)


def fit_length(wav: np.ndarray, n_samples: int, step: int) -> np.ndarray:
    wav = np.ascontiguousarray(np.asarray(wav, dtype=np.float32).reshape(-1))
    if wav.size == 0:
        return np.zeros(n_samples, dtype=np.float32)
    if wav.size < n_samples:
        out = np.zeros(n_samples, dtype=np.float32)
        start = (n_samples - wav.size) // 2
        out[start : start + wav.size] = wav
        return out
    if wav.size == n_samples:
        return wav.copy()
    limit = wav.size - n_samples
    starts = list(range(0, limit + 1, step))
    if starts[-1] != limit:
        starts.append(limit)
    best_start = 0
    best_energy = -1.0
    for start in starts:
        segment = wav[start : start + n_samples]
        energy = float(np.sum(segment.astype(np.float64) ** 2))
        if energy > best_energy:
            best_energy = energy
            best_start = start
    return wav[best_start : best_start + n_samples].copy()


def remove_dc(wav: np.ndarray) -> np.ndarray:
    if wav.size == 0:
        return wav
    mean = np.float32(float(np.sum(wav, dtype=np.float64)) / float(wav.size))
    return np.ascontiguousarray(wav - mean, dtype=np.float32)


def preemphasis(wav: np.ndarray, coefficient: float) -> np.ndarray:
    if wav.size == 0 or coefficient == 0.0:
        return np.ascontiguousarray(wav, dtype=np.float32)
    out = np.empty_like(wav, dtype=np.float32)
    coef = np.float32(coefficient)
    out[0] = wav[0]
    out[1:] = wav[1:] - coef * wav[:-1]
    return out


def peak_normalize(wav: np.ndarray, target: float, minimum: float) -> np.ndarray:
    if wav.size == 0:
        return np.ascontiguousarray(wav, dtype=np.float32)
    peak = float(np.max(np.abs(wav)))
    if peak >= minimum and peak > 0.0:
        wav = wav * np.float32(float(target) / peak)
    return np.ascontiguousarray(np.clip(wav, np.float32(-1.0), np.float32(1.0)), dtype=np.float32)


def time_shift(wav: np.ndarray, max_shift: int, rng: np.random.Generator) -> np.ndarray:
    if max_shift <= 0:
        return wav
    shift = int(rng.integers(-max_shift, max_shift + 1))
    if shift == 0:
        return wav
    out = np.zeros_like(wav)
    if shift > 0:
        out[shift:] = wav[:-shift]
    else:
        out[:shift] = wav[-shift:]
    return out


def add_noise(wav: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    power = float(np.mean(wav.astype(np.float64) ** 2))
    if power < 1e-6:
        level = float(rng.uniform(0.0, 0.003))
        return wav + rng.normal(0.0, level, size=wav.shape).astype(np.float32)
    snr_db = float(rng.uniform(6.0, 24.0))
    noise_power = power / (10.0 ** (snr_db / 10.0))
    noise = rng.normal(0.0, math.sqrt(noise_power), size=wav.shape).astype(np.float32)
    # 웹캠 마이크의 웅웅거리는 소음에 가깝게 저역을 남긴다.
    kernel = np.ones(8, dtype=np.float32) / np.float32(8.0)
    colored = np.convolve(noise, kernel, mode="same").astype(np.float32)
    return wav + colored


def microphone_color(wav: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """깨끗한 합성음에 마이크의 저역 감쇠와 짧은 울림을 섞는다. 학습 중에만 쓴다."""
    wav = preemphasis(wav, float(rng.uniform(0.3, 0.8)))
    out = np.array(wav, dtype=np.float32, copy=True)
    for _ in range(int(rng.integers(1, 3))):
        delay = int(rng.integers(160, 880))
        if delay >= out.size:
            continue
        gain = np.float32(rng.uniform(0.12, 0.4))
        echo = np.zeros_like(out)
        echo[delay:] = out[:-delay] * gain
        out = out + echo
    return np.ascontiguousarray(out, dtype=np.float32)


def prepare_waveform(
    wav: np.ndarray,
    cfg: FrontendConfig,
    augment: bool = False,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    wav = fit_length(wav, cfg.n_samples, cfg.hop_length)
    wav = remove_dc(wav)
    wav = preemphasis(wav, cfg.preemphasis)
    wav = peak_normalize(wav, cfg.peak_target, cfg.peak_min)
    if augment and rng is not None:
        wav = time_shift(wav, max(1, cfg.sample_rate // 5), rng)
        peak = float(np.max(np.abs(wav))) if wav.size else 0.0
        if peak >= cfg.peak_min:
            wav = wav * np.float32(float(rng.uniform(0.45, 1.05)))
        if float(rng.random()) < 0.85:
            wav = microphone_color(wav, rng)
        wav = add_noise(wav, rng)
        wav = np.ascontiguousarray(np.clip(wav, np.float32(-1.0), np.float32(1.0)), dtype=np.float32)
    return wav


def spec_augment(feat: np.ndarray, rng: np.random.Generator) -> None:
    n_mels, n_frames = feat.shape
    freq_width = int(rng.integers(0, 5))
    if 0 < freq_width < n_mels:
        start = int(rng.integers(0, n_mels - freq_width + 1))
        feat[start : start + freq_width, :] = 0.0
    time_width = int(rng.integers(0, 9))
    if 0 < time_width < n_frames:
        start = int(rng.integers(0, n_frames - time_width + 1))
        feat[:, start : start + time_width] = 0.0


class FeatureExtractor:
    def __init__(self, cfg: FrontendConfig | None = None) -> None:
        self.cfg = cfg or FrontendConfig()
        self.window = hann_window(self.cfg.win_length)
        self.mel = mel_filterbank(self.cfg.sample_rate, self.cfg.n_fft, self.cfg.n_mels, self.cfg.fmin, self.cfg.fmax)
        self.mean: np.ndarray | None = None
        self.std: np.ndarray | None = None

    def fit(self, waveforms: list[np.ndarray]) -> None:
        if not waveforms:
            raise ValueError("정규화에 쓸 오디오가 없습니다.")
        feats = [self.log_mel(prepare_waveform(wav, self.cfg, augment=False)) for wav in waveforms]
        stacked = np.stack(feats, axis=0)
        self.mean = np.mean(stacked, axis=(0, 2), dtype=np.float64).astype(np.float32)
        deviation = np.std(stacked, axis=(0, 2), dtype=np.float64)
        self.std = np.maximum(deviation, 1e-3).astype(np.float32)

    def transform(
        self,
        wav: np.ndarray,
        augment: bool = False,
        rng: np.random.Generator | None = None,
    ) -> np.ndarray:
        prepared = prepare_waveform(wav, self.cfg, augment=augment, rng=rng)
        feat = self.log_mel(prepared)
        feat = self.normalize(feat)
        if augment and rng is not None:
            spec_augment(feat, rng)
        if feat.shape != (self.cfg.n_mels, self.cfg.n_frames):
            raise RuntimeError("로그멜 크기가 예상과 다릅니다.")
        return np.ascontiguousarray(feat[None, :, :], dtype=np.float32)

    def log_mel(self, wav: np.ndarray) -> np.ndarray:
        cfg = self.cfg
        if wav.shape[0] != cfg.n_samples:
            raise RuntimeError("특징 추출 앞의 파형 길이가 1초가 아닙니다.")
        starts = np.arange(cfg.n_frames, dtype=np.int32) * cfg.hop_length
        index = starts[:, None] + np.arange(cfg.win_length, dtype=np.int32)[None, :]
        framed = wav[index] * self.window[None, :]
        padded = np.zeros((cfg.n_frames, cfg.n_fft), dtype=np.float32)
        padded[:, : cfg.win_length] = framed
        spectrum = np.fft.rfft(padded, axis=1)
        power = (spectrum.real.astype(np.float64) ** 2 + spectrum.imag.astype(np.float64) ** 2).astype(np.float32)
        mel_energy = power.astype(np.float64) @ self.mel.astype(np.float64).T
        return np.ascontiguousarray(np.log(mel_energy + float(cfg.log_eps)).T, dtype=np.float32)

    def normalize(self, feat: np.ndarray) -> np.ndarray:
        if self.mean is None or self.std is None:
            raise RuntimeError("특징 정규화가 준비되지 않았습니다.")
        mean = self.mean.astype(np.float32)[:, None]
        std = self.std.astype(np.float32)[:, None]
        return np.ascontiguousarray((feat - mean) / std, dtype=np.float32)

    def save(self, path: Path) -> None:
        if self.mean is None or self.std is None:
            raise RuntimeError("저장 전에 정규화를 계산해야 합니다.")
        path.parent.mkdir(parents=True, exist_ok=True)
        cfg = self.cfg
        np.savez(
            path,
            mel=np.ascontiguousarray(self.mel, dtype=np.float32),
            window=np.ascontiguousarray(self.window, dtype=np.float32),
            mean=np.ascontiguousarray(self.mean, dtype=np.float32),
            std=np.ascontiguousarray(self.std, dtype=np.float32),
            sample_rate=np.int32(cfg.sample_rate),
            n_fft=np.int32(cfg.n_fft),
            win_length=np.int32(cfg.win_length),
            hop_length=np.int32(cfg.hop_length),
            n_mels=np.int32(cfg.n_mels),
            fmin=np.float32(cfg.fmin),
            fmax=np.float32(cfg.fmax),
            log_eps=np.float32(cfg.log_eps),
            preemphasis=np.float32(cfg.preemphasis),
            peak_target=np.float32(cfg.peak_target),
            peak_min=np.float32(cfg.peak_min),
            duration_sec=np.float32(cfg.duration_sec),
        )

    @classmethod
    def load(cls, path: Path) -> "FeatureExtractor":
        data = np.load(path)
        cfg = FrontendConfig(
            sample_rate=int(data["sample_rate"]),
            duration_sec=float(data["duration_sec"]),
            n_fft=int(data["n_fft"]),
            win_length=int(data["win_length"]),
            hop_length=int(data["hop_length"]),
            n_mels=int(data["n_mels"]),
            fmin=float(data["fmin"]),
            fmax=float(data["fmax"]),
            log_eps=float(data["log_eps"]),
            preemphasis=float(data["preemphasis"]),
            peak_target=float(data["peak_target"]),
            peak_min=float(data["peak_min"]),
        )
        extractor = cls(cfg)
        extractor.mel = np.ascontiguousarray(data["mel"], dtype=np.float32)
        extractor.window = np.ascontiguousarray(data["window"], dtype=np.float32)
        extractor.mean = np.ascontiguousarray(data["mean"], dtype=np.float32)
        extractor.std = np.ascontiguousarray(data["std"], dtype=np.float32)
        if extractor.mel.shape != (cfg.n_mels, cfg.n_freqs):
            raise ValueError("멜 필터 크기가 설정과 맞지 않습니다.")
        if extractor.window.shape != (cfg.win_length,):
            raise ValueError("윈도우 크기가 설정과 맞지 않습니다.")
        if extractor.mean.shape != (cfg.n_mels,) or extractor.std.shape != (cfg.n_mels,):
            raise ValueError("정규화 값 크기가 설정과 맞지 않습니다.")
        return extractor

    def write_runtime_files(self, out_dir: Path, labels: list[str], silence_label: str) -> None:
        if self.mean is None or self.std is None:
            raise RuntimeError("런타임 파일을 쓰려면 정규화 값이 필요합니다.")
        if silence_label not in labels:
            raise ValueError("무음 클래스가 레이블에 없습니다.")
        out_dir.mkdir(parents=True, exist_ok=True)
        cfg = self.cfg
        np.ascontiguousarray(self.mel, dtype=np.float32).tofile(out_dir / "mel_filters.bin")
        np.ascontiguousarray(self.window, dtype=np.float32).tofile(out_dir / "window.bin")
        norm = np.concatenate([self.mean, self.std]).astype(np.float32)
        np.ascontiguousarray(norm).tofile(out_dir / "norm.bin")
        frontend = "\n".join(
            [
                f"version={FEATURE_VERSION}",
                f"sample_rate={cfg.sample_rate}",
                f"n_samples={cfg.n_samples}",
                f"n_fft={cfg.n_fft}",
                f"win_length={cfg.win_length}",
                f"hop_length={cfg.hop_length}",
                f"n_mels={cfg.n_mels}",
                f"n_frames={cfg.n_frames}",
                f"n_freqs={cfg.n_freqs}",
                f"log_eps={cfg.log_eps:.8g}",
                f"preemphasis={cfg.preemphasis:.8g}",
                f"peak_target={cfg.peak_target:.8g}",
                f"peak_min={cfg.peak_min:.8g}",
                f"silence_index={labels.index(silence_label)}",
                f"input_name={INPUT_NAME}",
                f"output_name={OUTPUT_NAME}",
                "",
            ]
        )
        (out_dir / "frontend.txt").write_text(frontend, encoding="utf-8", newline="\n")
        (out_dir / "labels.txt").write_text("\n".join(labels) + "\n", encoding="utf-8", newline="\n")
