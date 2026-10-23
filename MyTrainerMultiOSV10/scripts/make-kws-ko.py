"""Korean keyword-spotting data made with Supertonic TTS (Supertone, on-device ONNX TTS).

    npm run data:kws      (= node scripts/venv-tts.mjs --run scripts/make-kws-ko.py)

runs it with .venv-tts, the tools' Python environment, which is made on that first run when it is missing
(a Python 3.10-3.13 of this computer, or a downloaded portable one, plus supertonic and numpy).

Many different speakers say the keywords 출근 / 퇴근 / 경비 / 해제, each in many ways:
  voices    the ten built-in voices (M1–M5, F1–F5), blends of two of them (their style vectors mixed
            at a random ratio) and mixes of three nudged a little off the built-in ones: 80 voices that
            sound like different people (a model that heard only the ten mistakes new voices for each other)
  manner    plain, as a statement (.), as a command (!), as a question (?) — the intonation changes
  speed     0.7 … 1.5 (slow and careful to quick)
  quality   4 … 12 synthesis steps; the flow-matching noise is random, so no two clips are alike
"unknown" is many other words — ones that sound like the keywords (출발, 퇴장, 경보, 해지 …) and everyday
words — so the model learns to reject them. Further acoustic variety (microphone, room, background) is
added when the app builds the data set (fromSounds in src/domain/datasets-media.js).
Writes
  data/audio/kws-ko/<label>/<voice>_<n>.wav   the built-in voices' clips, 8 kHz 16-bit mono, 1 s, speech centred
  data/predict/kws-ko/*.wav                   a few clips to try "Run on files" with
  public/datasets/kws-ko.bin                  every clip, for the built-in sample
The .bin is: 4-byte little-endian length, a UTF-8 JSON index {rate, seconds, labels, clips: [[label, voice]]},
then every clip as rate·seconds bytes of 8-bit µ-law.
"""
import json
import shutil
import struct
import sys
from pathlib import Path

import numpy as np
from supertonic import TTS
from supertonic.core import Style

ROOT = Path(__file__).resolve().parent.parent
RATE = 8000
SECONDS = 1.0
SEED = 2026
KEYWORDS = ['출근', '퇴근', '경비', '해제']
# Other words: first ones that sound like a keyword (same first syllable, similar vowels), then everyday
# words and short phrases. None of them contains a keyword.
UNKNOWN = [
    '출발', '출구', '출장', '출석', '출입', '출력', '출판', '출산', '춘천', '축구', '추궁', '수근', '군인',
    '근무', '근처', '근육', '퇴장', '퇴원', '퇴사', '퇴직', '퇴비', '투표', '튀김', '대근', '되돌려', '토끼',
    '경기', '경찰', '경보', '경계', '경로', '경리', '경치', '경주', '경력', '결재', '계피', '경품', '공기', '갱신',
    '해변', '해외', '해지', '해결', '해체', '해적', '해녀', '해저', '해석', '회계', '해조', '혜택', '개체', '애정',
    '안녕하세요', '감사합니다', '학교', '사랑', '네', '아니요', '시작', '정지', '열어', '닫아', '불 켜', '불 꺼',
    '음악', '날씨', '시간', '오늘', '내일', '점심', '회의', '전화', '문자', '엄마', '아빠', '친구', '컴퓨터',
    '사무실', '회사', '커피', '확인', '취소', '다음', '이전', '왼쪽', '오른쪽', '하나', '둘', '셋', '넷', '다섯',
    '잠깐', '도와줘', '괜찮아', '좋아요', '비밀번호', '보안', '경고', '알람', '잠금', '문 열어', '주차', '엘리베이터',
    '배고파', '고마워', '미안해', '어디야', '뭐 해', '잘 자', '어서 와', '수고했어', '점검', '청소', '조명', '온도',
]
MANNERS = ['{}', '{}.', '{}!', '{}?']
SPEEDS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5]
STEPS = [4, 6, 8, 12]
BLENDS = 30          # extra voices made by mixing two built-in voices
MIXES = 40           # extra voices made by mixing three and nudging the result
NUDGE = 0.25         # how far a mix is nudged, in standard deviations of the built-in voices' style values
PER_KEYWORD = 6      # clips of each keyword per voice
PER_UNKNOWN = 12     # unknown-word clips per voice
BATCH = 32


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


def make_voices(tts, rng):
    """name → Style: the built-in voices, then blends 'A+B' of two of them at a random ratio."""
    voices = {name: tts.get_voice_style(voice_name=name) for name in tts.voice_style_names}
    names = list(voices)
    pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
    for k in rng.permutation(len(pairs))[:BLENDS]:
        a, b = pairs[k]
        w = rng.uniform(0.25, 0.75)
        sa, sb = voices[a], voices[b]
        voices[f'{a}+{b}'] = Style((sa.ttl * w + sb.ttl * (1 - w)).astype(sa.ttl.dtype), (sa.dp * w + sb.dp * (1 - w)).astype(sa.dp.dtype))
    ttl = np.stack([voices[n].ttl for n in names])
    dp = np.stack([voices[n].dp for n in names])
    ttl_sd, dp_sd = ttl.std(0), dp.std(0)
    for k in range(MIXES):
        w = np.zeros(len(names))
        w[rng.choice(len(names), 3, replace=False)] = rng.dirichlet([1, 1, 1])
        mixed_ttl = np.tensordot(w, ttl, 1) + rng.normal(0, NUDGE, ttl_sd.shape) * ttl_sd
        mixed_dp = np.tensordot(w, dp, 1) + rng.normal(0, NUDGE, dp_sd.shape) * dp_sd
        voices[f'mix{k + 1:02d}'] = Style(mixed_ttl.astype(ttl.dtype), mixed_dp.astype(dp.dtype))
    return voices


def synthesize(tts, voices, jobs):
    """jobs [(label, text, voice, speed, steps)] → the same order of 1 s clips. Jobs with the same speed and
    steps go through the model together (a batch is several times faster than one clip at a time)."""
    out = [None] * len(jobs)
    groups = {}
    for i, (_, _, _, speed, steps) in enumerate(jobs):
        groups.setdefault((speed, steps), []).append(i)
    done = 0
    for (speed, steps), members in sorted(groups.items()):
        for at in range(0, len(members), BATCH):
            chunk = members[at:at + BATCH]
            styles = [voices[jobs[i][2]] for i in chunk]
            style = Style(np.concatenate([s.ttl for s in styles]), np.concatenate([s.dp for s in styles]))
            waves, durations = tts.model([jobs[i][1] for i in chunk], style, total_step=steps, speed=speed, lang='ko')
            for row, i in enumerate(chunk):
                wave = np.asarray(waves[row, :int(durations[row] * tts.sample_rate)], np.float64)
                out[i] = centre(resample(wave, tts.sample_rate, RATE))
            done += len(chunk)
            print(f'{done}/{len(jobs)}', flush=True)
    return out


def main():
    rng = np.random.default_rng(SEED)
    np.random.seed(SEED)  # Supertonic draws its starting noise from np.random
    tts = TTS()
    voices = make_voices(tts, rng)
    builtin = set(tts.voice_style_names)
    jobs = []
    for voice in voices:
        for word in KEYWORDS:
            for k in range(PER_KEYWORD):
                jobs.append((word, MANNERS[k % len(MANNERS)].format(word), voice, float(rng.choice(SPEEDS)), int(rng.choice(STEPS))))
        for word in rng.choice(UNKNOWN, PER_UNKNOWN, replace=False):
            jobs.append(('unknown', MANNERS[int(rng.integers(len(MANNERS)))].format(word), voice, float(rng.choice(SPEEDS)), int(rng.choice(STEPS))))
    # A few clips for "Run on files": every keyword and some other words, by voices picked at random.
    names = list(voices)
    trials = [(word, f'{word}', names[int(rng.integers(len(names)))], 1.05, 8) for word in KEYWORDS for _ in range(3)]
    trials += [('unknown', word, names[int(rng.integers(len(names)))], 1.05, 8) for word in ('출발', '경찰', '해변', '안녕하세요')]
    clips = synthesize(tts, voices, jobs + trials)

    out_dir = ROOT / 'data' / 'audio' / 'kws-ko'
    predict_dir = ROOT / 'data' / 'predict' / 'kws-ko'
    for folder in (out_dir, predict_dir):
        shutil.rmtree(folder, ignore_errors=True)
    index_clips = []
    data = bytearray()
    counts = {}
    for (label, text, voice, speed, steps), clip in zip(jobs, clips):
        index_clips.append([label, voice])
        data += mulaw(clip).tobytes()
        if voice in builtin:  # the folder keeps the built-in voices' clips only (the .bin has them all)
            n = counts[(label, voice)] = counts.get((label, voice), 0) + 1
            write_wav(out_dir / label / f'{voice}_{n:02d}.wav', clip)
    for (label, text, voice, _, _), clip in zip(trials, clips[len(jobs):]):
        write_wav(predict_dir / f'{text}_{voice}.wav', clip)
    index = json.dumps({'rate': RATE, 'seconds': SECONDS, 'labels': KEYWORDS + ['unknown'], 'voices': names, 'source': 'Supertonic 3 (Supertone)', 'clips': index_clips}, ensure_ascii=False).encode('utf-8')
    bundle = ROOT / 'public' / 'datasets' / 'kws-ko.bin'
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_bytes(struct.pack('<I', len(index)) + index + bytes(data))
    print(f'{len(index_clips)} clips, {len(voices)} voices -> {bundle.relative_to(ROOT)} ({bundle.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    sys.exit(main())
