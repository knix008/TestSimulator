"""Korean keyword-spotting data made with Supertonic TTS (Supertone, on-device ONNX TTS).

    py -3.12 -m venv .venv-tts
    .venv-tts/Scripts/python -m pip install supertonic        (macOS/Linux: .venv-tts/bin/python)
    .venv-tts/Scripts/python scripts/make-kws-ko.py           (npm run data:kws)

Every built-in voice (M1–M5, F1–F5) says the keywords 출근 / 퇴근 / 경비 / 해제 at several speeds and
synthesis quality steps, and similar-sounding other words that make the "unknown" class.
Writes
  data/audio/kws-ko/<label>/<voice>_<speed>_<steps>.wav   8 kHz 16-bit mono, 1 s, speech centred
  data/predict/kws-ko/*.wav                                a few clips to try "Run on files" with
  public/datasets/kws-ko.bin                               the same clips for the built-in sample
The .bin is: 4-byte little-endian length, a UTF-8 JSON index {rate, seconds, labels, clips: [[label, voice]]},
then every clip as rate·seconds bytes of 8-bit µ-law.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from supertonic import TTS

ROOT = Path(__file__).resolve().parent.parent
RATE = 8000
SECONDS = 1.0
KEYWORDS = ['출근', '퇴근', '경비', '해제']
# Words that sound a little like the keywords (and some that do not): the model must learn to reject them.
UNKNOWN = ['출발', '출구', '퇴원', '경기', '경찰', '해변', '해외', '안녕하세요', '학교', '사랑']
SPEEDS = [0.8, 0.95, 1.1, 1.25]
STEPS = [5, 10]


def resample(wave, rate_in, rate_out):
    """Band-limited resampling by FFT (no SciPy needed)."""
    n_out = int(round(len(wave) * rate_out / rate_in))
    spectrum = np.fft.rfft(wave)
    keep = n_out // 2 + 1
    return np.fft.irfft(spectrum[:keep], n_out) * (n_out / len(wave))


def centre(wave):
    """The 1 s around the speech: the loudest part is centred, quiet edges padded with zeros."""
    n = int(RATE * SECONDS)
    energy = np.convolve(wave ** 2, np.ones(400) / 400, mode='same')
    loud = np.nonzero(energy > energy.max() * 0.02)[0]
    start, end = (loud[0], loud[-1]) if len(loud) else (0, len(wave))
    speech = wave[start:end + 1]
    if len(speech) > n:  # too long: keep the middle
        cut = (len(speech) - n) // 2
        speech = speech[cut:cut + n]
    out = np.zeros(n, np.float32)
    at = (n - len(speech)) // 2
    out[at:at + len(speech)] = speech
    peak = np.abs(out).max()
    return out / peak * 0.9 if peak > 0 else out


def mulaw(wave):
    x = np.clip(wave, -1, 1)
    y = np.sign(x) * np.log1p(255 * np.abs(x)) / np.log1p(255)
    return np.round((y + 1) * 127.5).astype(np.uint8)


def write_wav(path, wave):
    pcm = (np.clip(wave, -1, 1) * 32767).astype('<i2').tobytes()
    header = b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, RATE, RATE * 2, 2, 16) + b'data' + struct.pack('<I', len(pcm))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + pcm)


def main():
    tts = TTS()
    voices = list(tts.voice_style_names)
    out_dir = ROOT / 'data' / 'audio' / 'kws-ko'
    predict_dir = ROOT / 'data' / 'predict' / 'kws-ko'
    clips = []
    data = bytearray()
    jobs = [(word, word, speed, steps) for word in KEYWORDS for speed in SPEEDS for steps in STEPS]
    jobs += [('unknown', word, speed, 8) for i, word in enumerate(UNKNOWN) for speed in (SPEEDS[i % 4], SPEEDS[(i + 2) % 4])]
    total = len(voices) * len(jobs)
    done = 0
    for voice in voices:
        style = tts.get_voice_style(voice_name=voice)
        for label, text, speed, steps in jobs:
            wave, _ = tts.synthesize(text, voice_style=style, total_steps=steps, speed=speed, lang='ko', silence_duration=0.1)
            clip = centre(resample(np.asarray(wave, np.float64).reshape(-1), tts.sample_rate, RATE))
            name = f'{voice}_{speed:.2f}_{steps}' if label != 'unknown' else f'{voice}_{text}_{speed:.2f}'
            write_wav(out_dir / label / f'{name}.wav', clip)
            clips.append([label, voice])
            data += mulaw(clip).tobytes()
            done += 1
            if done % 40 == 0:
                print(f'{done}/{total}', flush=True)
    # A few clips for "Run on files", one keyword per voice.
    for i, voice in enumerate(voices):
        word = KEYWORDS[i % len(KEYWORDS)]
        style = tts.get_voice_style(voice_name=voice)
        wave, _ = tts.synthesize(word, voice_style=style, total_steps=8, speed=1.0, lang='ko', silence_duration=0.3)
        write_wav(predict_dir / f'{word}_{voice}.wav', centre(resample(np.asarray(wave, np.float64).reshape(-1), tts.sample_rate, RATE)))
    index = json.dumps({'rate': RATE, 'seconds': SECONDS, 'labels': KEYWORDS + ['unknown'], 'voices': voices, 'source': 'Supertonic 3 (Supertone)', 'clips': clips}, ensure_ascii=False).encode('utf-8')
    bundle = ROOT / 'public' / 'datasets' / 'kws-ko.bin'
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_bytes(struct.pack('<I', len(index)) + index + bytes(data))
    print(f'{len(clips)} clips, {len(voices)} voices -> {bundle.relative_to(ROOT)} ({bundle.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    sys.exit(main())
