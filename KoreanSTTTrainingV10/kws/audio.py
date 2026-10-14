"""녹음, WAV 입출력, 리샘플."""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np

TARGET_SAMPLE_RATE = 16000
COMMAND_SECONDS = 1.2


def load_audio(path: Path) -> tuple[np.ndarray, int]:
    import soundfile as sf

    wav, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    wav = np.mean(wav, axis=1, dtype=np.float32)
    return np.ascontiguousarray(wav, dtype=np.float32), int(sample_rate)


def save_wav(path: Path, wav: np.ndarray, sample_rate: int = TARGET_SAMPLE_RATE) -> None:
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.ascontiguousarray(np.asarray(wav, dtype=np.float32).reshape(-1))
    sf.write(str(path), data, sample_rate, subtype="PCM_16")


def load_model_wav(path: Path, target_sr: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    wav, sample_rate = load_audio(path)
    if wav.size == 0:
        raise RuntimeError(f"비어 있는 오디오입니다: {path}")
    if sample_rate != target_sr:
        wav = resample(wav, sample_rate, target_sr)
    return wav


def resample(wav: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    if src_sr == dst_sr or wav.size == 0:
        return np.ascontiguousarray(wav, dtype=np.float32)
    if src_sr <= 0 or dst_sr <= 0:
        raise ValueError("샘플 레이트가 올바르지 않습니다.")
    if dst_sr < src_sr:
        kernel_size = max(1, int(round(src_sr / dst_sr)))
        if kernel_size > 1:
            kernel = np.ones(kernel_size, dtype=np.float32) / np.float32(kernel_size)
            wav = np.convolve(wav, kernel, mode="same").astype(np.float32)
    n_dst = max(1, int(round(wav.size * float(dst_sr) / float(src_sr))))
    old_t = np.linspace(0.0, 1.0, num=wav.size, endpoint=False)
    new_t = np.linspace(0.0, 1.0, num=n_dst, endpoint=False)
    return np.interp(new_t, old_t, wav).astype(np.float32)


def peak_level(wav: np.ndarray) -> float:
    if wav.size == 0:
        return 0.0
    return float(np.max(np.abs(wav)))


def level_message(peak: float) -> str:
    if peak < 0.02:
        return "소리가 너무 작습니다. 마이크를 더 가까이 하세요."
    if peak > 0.98:
        return "소리가 너무 커서 잘렸습니다. 조금 떨어져서 말하세요."
    return f"소리 크기 {int(round(peak * 100))}%."


def list_input_devices() -> list[tuple[int, str]]:
    try:
        import sounddevice as sd
    except Exception:
        return []
    try:
        queried = sd.query_devices()
    except Exception:
        return []
    devices: list[tuple[int, str]] = []
    seen: set[str] = set()
    for index, item in enumerate(queried):
        if int(item["max_input_channels"]) <= 0:
            continue
        name = str(item["name"])
        if name in seen:
            name = f"{name} ({index})"
        seen.add(name)
        devices.append((index, name))
    return devices


def record_block(seconds: float, device: int | None, sample_rate: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    import sounddevice as sd

    frames = max(1, int(round(seconds * sample_rate)))
    try:
        audio = sd.rec(frames, samplerate=sample_rate, channels=1, dtype="float32", device=device)
        sd.wait()
        return np.array(audio, dtype=np.float32, copy=True).reshape(-1)
    except Exception as first_error:
        sd.stop()
        info_device = device if device is not None else sd.default.device[0]
        try:
            info = sd.query_devices(info_device, "input")
            device_sr = int(round(float(info["default_samplerate"])))
            device_frames = max(1, int(round(seconds * device_sr)))
            audio = sd.rec(device_frames, samplerate=device_sr, channels=1, dtype="float32", device=device)
            sd.wait()
        except Exception as exc:
            raise RuntimeError(f"마이크를 열 수 없습니다. {exc}") from first_error
        wav = np.array(audio, dtype=np.float32, copy=True).reshape(-1)
        return resample(wav, device_sr, sample_rate)


class MicrophoneStream:
    """최근 1.5초를 유지하는 입력 스트림."""

    def __init__(self, device: int | None = None, target_sr: int = TARGET_SAMPLE_RATE, window_sec: float = 1.5) -> None:
        self.device = device
        self.target_sr = target_sr
        self.window_sec = window_sec
        self.stream_sr = target_sr
        self._chunks: list[np.ndarray] = []
        self._buffer = np.zeros(0, dtype=np.float32)
        self._capacity = int(window_sec * target_sr)
        self._lock = threading.Lock()
        self._stream = None

    def start(self) -> None:
        import sounddevice as sd

        def callback(indata, frames, time_info, status) -> None:  # noqa: ARG001
            chunk = np.array(indata[:, 0], dtype=np.float32, copy=True)
            with self._lock:
                self._chunks.append(chunk)

        try:
            stream = sd.InputStream(
                samplerate=self.target_sr,
                channels=1,
                dtype="float32",
                device=self.device,
                callback=callback,
            )
            self.stream_sr = self.target_sr
        except Exception:
            info_device = self.device if self.device is not None else sd.default.device[0]
            try:
                info = sd.query_devices(info_device, "input")
            except Exception as exc:
                raise RuntimeError(f"마이크를 열 수 없습니다. {exc}") from exc
            self.stream_sr = int(round(float(info["default_samplerate"])))
            stream = sd.InputStream(
                samplerate=self.stream_sr,
                channels=1,
                dtype="float32",
                device=self.device,
                callback=callback,
            )
        self._capacity = max(1, int(self.window_sec * self.stream_sr))
        with self._lock:
            self._chunks.clear()
            self._buffer = np.zeros(0, dtype=np.float32)
        stream.start()
        self._stream = stream

    def read(self) -> np.ndarray:
        with self._lock:
            if self._chunks:
                self._buffer = np.concatenate([self._buffer, *self._chunks])[-self._capacity :]
                self._chunks.clear()
            data = self._buffer.copy()
        if data.size == 0:
            return data
        if self.stream_sr != self.target_sr:
            data = resample(data, self.stream_sr, self.target_sr)
        return np.ascontiguousarray(data, dtype=np.float32)

    def close(self) -> None:
        stream = self._stream
        self._stream = None
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass
