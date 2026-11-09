"""Korean keyword-spotting data made with Supertonic TTS (Supertone, on-device ONNX TTS).

    npm run data:kws         (= node scripts/venv-tts.mjs --run scripts/make-kws-ko.py)
    npm run data:kws-attend  (… make-kws-ko.py --set kws-ko-attend: 출근 / 퇴근 / 외출 / 복귀, see SETS)

runs it with .venv-tts, the tools' Python environment, which is made on that first run when it is missing
(a Python 3.10-3.13 of this computer, or a downloaded portable one, plus supertonic and numpy).

Many different speakers say the keywords 출근 / 퇴근 / 경비 / 해제, each in many ways:
  voices    two separate families (see TRAIN_BASE): 100 training voices from eight built-in ones (themselves,
            blends of two at a random ratio, mixes of three nudged a little off) and 20 test-only voices
            from M5 and F5 (themselves and nudged blends of the two): voices that sound like 120 different
            people, and the test ones share no built-in voice with the training ones
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
# Attendance (kws-ko-attend): the words that come closest to a keyword, each voice says ATTEND_HARD of them
# besides its everyday words. A model hears a keyword in whatever shares its outline, so these are
#   minimal pairs   one sound changed (결근 외근 측근 · 복근 복고 · 외줄 외주 · 퇴고 퇴로 …)
#   the outline     two syllables with a stop closing the first (먹기 듣기 속기 혹시 쪽지 …): 복귀 is
#                   two bursts with a gap in nearly every clip, few unknown words were
#   halves          one syllable of a keyword alone (출 · 근 · 퇴 · 외 · 복 · 귀): a half word is no keyword
#   work words      what else is said at a time clock (야근 조퇴 지각 연차 …)
# Words of the Windows Heami check set (an outside test, see the KWS notes) are left out on purpose, so
# that check still measures look-alikes the model never heard.
ATTEND_HARD = [
    '결근', '외근', '측근', '철근', '출국', '충전', '출동', '출세', '출처', '춘곤', '추근', '충고', '축하',
    '퇴고', '퇴로', '퇴치', '퇴임', '퇴화', '퇴출', '회군', '튀긴', '두근', '뒤끝', '대금', '토큰',
    '외줄', '외주', '외길', '외상', '외래', '외치', '예술', '회춘', '위층', '위치', '의술', '와 줘', '왜 줘',
    '복근', '복고', '복리', '복수', '복합', '복용', '복원', '북어', '백기', '방귀', '바퀴', '당귀', '사귀어',
    '먹기', '듣기', '걷기', '읽기', '속기', '혹시', '쪽지', '녹지', '독자', '목재', '박수', '약국', '숙제',
    '출', '근', '퇴', '외', '복', '귀',
    '야근', '조퇴', '지각', '연차', '반차', '휴무', '당직', '특근', '철야', '결재 완료',
]
# Everyday words and phrases added for kws-ko-attend: polite set phrases (they end in a long falling tail
# like a spoken command), short fillers and words with a stop in the middle.
ATTEND_EVERYDAY = [
    '고생하셨습니다', '안녕히 가세요', '수고하세요', '잘 다녀와', '다녀올게', '들어왔어', '갔다 올게', '반갑습니다',
    '알겠습니다', '맞아요', '잠시만요', '여보세요', '그럼요', '어서 오세요', '고맙습니다', '실례합니다', '죄송합니다',
    '아', '에', '흠', '오', '우와', '네네', '글쎄', '국가', '책상', '직원', '작업', '식사', '학생', '낙엽', '목요일',
]
# Word sets (--set <bank>): the keywords, the unknown words, the few other words of "Run on files" and,
# optionally, (hard words, hard clips per voice, everyday clips per voice): the unknown words are then
# dealt out evenly (every word about as often, never twice to one voice) instead of drawn at random.
# Both sets use separate voice families (see TRAIN_BASE): test speakers share no built-in voice with the others.
SETS = {
    'kws-ko': (KEYWORDS, UNKNOWN, ('출발', '경찰', '해변', '안녕하세요'), 'families'),
    # Attendance: 출근 / 퇴근 / 외출 (going out) / 복귀 (coming back). 경비 and 해제 are other words here,
    # and look-alikes of 외출 and 복귀 join the unknown words.
    'kws-ko-attend': (['출근', '퇴근', '외출', '복귀'], UNKNOWN + [
        '경비', '해제', '외식', '외부', '외국', '외투', '외침', '외곽', '외모', '외삼촌', '왜', '웨딩', '회식', '우체국',
        '출금', '추출', '복구', '복권', '복지', '복도', '복사', '복습', '복잡', '복숭아', '보기', '목걸이', '귀가', '귀국',
        '보고', '복구해', '북쪽', '독서', '귀신', '국수'] + ATTEND_EVERYDAY, ('출발', '외식', '복근', '결근', '안녕하세요'),
        (ATTEND_HARD, 10, 12), 'families'),
}
MANNERS = ['{}', '{}.', '{}!', '{}?']
SPEEDS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5]
STEPS = [4, 6, 8, 12]
BLENDS = 30          # extra voices made by mixing two built-in voices
MIXES = 80           # extra voices made by mixing three and nudging the result
NUDGE = 0.25         # how far a mix is nudged, in standard deviations of the built-in voices' style values
PER_KEYWORD = 8      # clips of each keyword per voice
PER_UNKNOWN = 14     # unknown-word clips per voice
# Separate voice families (kws-ko-attend): the test speakers come only from TEST_BASE and every other voice
# only from TRAIN_BASE, so no test voice shares a built-in voice with a training voice (a blend of F4 with
# F2 is half F4: with F4 as a test speaker it would leak F4 into training). The bank's index lists them as
# testVoices; the app's split then tests on exactly those speakers (splitIndices, groupRoles).
TRAIN_BASE = ['M1', 'M2', 'M3', 'M4', 'F1', 'F2', 'F3', 'F4']
TEST_BASE = ['M5', 'F5']
FAMILY_BLENDS = 28   # training: every pair of the 8 training voices once
FAMILY_MIXES = 64    # training: mixes of three training voices, nudged
TEST_EXTRA = 18      # test: blends of M5 and F5 at random ratios, nudged (with M5 and F5: 20 test speakers)
BATCH = 32
MIN_KEYWORD, MAX_KEYWORD = 0.2, 0.82   # seconds of speech a keyword clip must have (see problem())
MIN_UNKNOWN = 0.1
RETRIES = 4


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


def unmulaw(data):
    y = data.astype(np.float64) / 127.5 - 1
    return (np.sign(y) * (256.0 ** np.abs(y) - 1) / 255).astype(np.float32)


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


def make_family_voices(tts, rng):
    """name → Style, name → its built-in parents, and the test speakers: training voices made only from
    TRAIN_BASE, test voices only from TEST_BASE (see TRAIN_BASE)."""
    builtin = {name: tts.get_voice_style(voice_name=name) for name in tts.voice_style_names}
    if set(TRAIN_BASE + TEST_BASE) != set(builtin) or set(TRAIN_BASE) & set(TEST_BASE):
        raise SystemExit(f'TRAIN_BASE and TEST_BASE must split the built-in voices {sorted(builtin)}')
    voices, parents = {}, {}

    def mixed(base, weights, nudge):
        ttl = np.stack([builtin[n].ttl for n in base]); dp = np.stack([builtin[n].dp for n in base])
        mixed_ttl = np.tensordot(weights, ttl, 1) + (rng.normal(0, nudge, ttl_sd.shape) * ttl_sd if nudge else 0)
        mixed_dp = np.tensordot(weights, dp, 1) + (rng.normal(0, nudge, dp_sd.shape) * dp_sd if nudge else 0)
        return Style(mixed_ttl.astype(ttl.dtype), mixed_dp.astype(dp.dtype))
    # the spread of the style values, from the training voices only
    ttl_sd = np.stack([builtin[n].ttl for n in TRAIN_BASE]).std(0)
    dp_sd = np.stack([builtin[n].dp for n in TRAIN_BASE]).std(0)
    for name in TRAIN_BASE:
        voices[name], parents[name] = builtin[name], [name]
    pairs = [(a, b) for i, a in enumerate(TRAIN_BASE) for b in TRAIN_BASE[i + 1:]]
    for k in rng.permutation(len(pairs))[:FAMILY_BLENDS]:
        a, b = pairs[k]
        w = rng.uniform(0.25, 0.75)
        voices[f'{a}+{b}'], parents[f'{a}+{b}'] = mixed([a, b], np.array([w, 1 - w]), 0), [a, b]
    for k in range(FAMILY_MIXES):
        three = [TRAIN_BASE[i] for i in sorted(rng.choice(len(TRAIN_BASE), 3, replace=False))]
        voices[f'mix{k + 1:02d}'], parents[f'mix{k + 1:02d}'] = mixed(three, rng.dirichlet([1, 1, 1]), NUDGE), three
    tests = []
    for name in TEST_BASE:
        voices[name], parents[name] = builtin[name], [name]
        tests.append(name)
    for k in range(TEST_EXTRA):
        w = rng.uniform(0.15, 0.85)
        name = f'test{k + 1:02d}'
        voices[name], parents[name] = mixed(TEST_BASE, np.array([w, 1 - w]), NUDGE), list(TEST_BASE)
        tests.append(name)
    return voices, parents, tests


def speech_span(clip):
    """Seconds of a centred clip within 25 dB of its loudest 25 ms."""
    db = 10 * np.log10(np.convolve(clip.astype(np.float64) ** 2, np.ones(200) / 200, mode='valid')[::100] + 1e-10)
    return (db > db.max() - 25).sum() * 100 / RATE, db.max() - np.percentile(db, 10)


def problem(label, clip, raw=None):
    """Why a clip holds no proper word, or None. At the fast speeds Supertonic now and then says nothing
    (centre() would blow the silence up into a steady hiss) or only a fragment of a keyword; a keyword
    (two syllables) lasts 0.25 … 0.75 s at the speeds used, a few unknown words are one short syllable (네)."""
    if raw is not None and np.abs(raw).max() < 1e-3:
        return 'silence'
    span, contrast = speech_span(clip)
    # Blown-up silence is a steady hiss (a few dB from loudest to quietest); a long phrase that fills the
    # whole second still rises and falls by well over 10 dB.
    if raw is None and contrast < 10:
        return 'no rise above the noise'
    if label != 'unknown' and not MIN_KEYWORD <= span <= MAX_KEYWORD:
        return f'{span:.2f} s of speech'
    if label == 'unknown' and span < MIN_UNKNOWN:
        return f'{span:.2f} s of speech'
    return None


def synthesize(tts, voices, jobs):
    """jobs [(label, text, voice, speed, steps)] → the same order of 1 s clips. Jobs with the same speed and
    steps go through the model together (a batch is several times faster than one clip at a time). A clip
    with no proper word is made again, a little slower each time (so every voice keeps its share)."""
    out = [None] * len(jobs)
    todo = list(range(len(jobs)))
    for attempt in range(RETRIES + 1):
        groups = {}
        for i in todo:
            _, _, _, speed, steps = jobs[i]
            groups.setdefault((max(1.0, speed - 0.15 * attempt) if speed > 1 else speed, steps), []).append(i)
        failed = []
        done = 0
        for (speed, steps), members in sorted(groups.items()):
            for at in range(0, len(members), BATCH):
                chunk = members[at:at + BATCH]
                styles = [voices[jobs[i][2]] for i in chunk]
                style = Style(np.concatenate([s.ttl for s in styles]), np.concatenate([s.dp for s in styles]))
                waves, durations = tts.model([jobs[i][1] for i in chunk], style, total_step=steps, speed=speed, lang='ko')
                for row, i in enumerate(chunk):
                    raw = resample(np.asarray(waves[row, :int(durations[row] * tts.sample_rate)], np.float64), tts.sample_rate, RATE)
                    out[i] = centre(raw)
                    if problem(jobs[i][0], out[i], raw):
                        failed.append(i)
                done += len(chunk)
                print(f'{done}/{len(todo)}', flush=True)
        if not failed:
            return out
        print(f'{len(failed)} clips without a proper word (silence or a fragment): made again, a little slower', flush=True)
        todo = failed
    raise RuntimeError(f'{len(todo)} clips still have no proper word after {RETRIES} retries: {[jobs[i][:3] for i in todo[:10]]}')


def main():
    bank = sys.argv[sys.argv.index('--set') + 1] if '--set' in sys.argv else 'kws-ko'
    if bank not in SETS:
        raise SystemExit(f'unknown --set {bank} (one of {", ".join(SETS)})')
    keywords, unknown, others, *rest = SETS[bank]
    dealt = [r for r in rest if isinstance(r, tuple)]
    families = 'families' in rest
    hard, per_hard, per_everyday = dealt[0] if dealt else ([], 0, PER_UNKNOWN)
    clash = [word for word in unknown + hard if any(keyword in word for keyword in keywords)]
    if clash:
        raise SystemExit(f'unknown words that contain a keyword: {clash}')
    twice = sorted({word for word in unknown + hard if (unknown + hard).count(word) > 1})
    if twice:
        raise SystemExit(f'unknown words listed twice: {twice}')
    rng = np.random.default_rng(SEED)
    np.random.seed(SEED)  # Supertonic draws its starting noise from np.random
    tts = TTS()
    if families:
        voices, parents, test_voices = make_family_voices(tts, rng)
    else:
        voices, parents, test_voices = make_voices(tts, rng), None, None
    builtin = set(tts.voice_style_names)

    def dealer(words):
        """k words for the next voice: the list shuffled again whenever it runs out, no word twice per voice."""
        pile = []

        def deal(k):
            picks = []
            while len(picks) < k:
                if not pile:
                    pile.extend(rng.permutation(words).tolist())
                word = pile.pop()
                if word in picks:  # the list was just shuffled again: this voice already has it
                    pile.insert(0, word)
                else:
                    picks.append(word)
            return picks
        return deal

    deal_hard, deal_everyday = dealer(hard), dealer(unknown)
    jobs = []
    for voice in voices:
        for word in keywords:
            for k in range(PER_KEYWORD):
                jobs.append((word, MANNERS[k % len(MANNERS)].format(word), voice, float(rng.choice(SPEEDS)), int(rng.choice(STEPS))))
        words = rng.choice(unknown, PER_UNKNOWN, replace=False) if not dealt else deal_hard(per_hard) + deal_everyday(per_everyday)
        for word in words:
            jobs.append(('unknown', MANNERS[int(rng.integers(len(MANNERS)))].format(word), voice, float(rng.choice(SPEEDS)), int(rng.choice(STEPS))))
    # A few clips for "Run on files": every keyword and some other words, by voices picked at random.
    # (with separate families only test speakers say them: "Run on files" is new data too)
    names = list(voices)
    pick = test_voices or names
    trials = [(word, f'{word}', pick[int(rng.integers(len(pick)))], 1.05, 8) for word in keywords for _ in range(3)]
    trials += [('unknown', word, pick[int(rng.integers(len(pick)))], 1.05, 8) for word in others]
    out_dir = ROOT / 'data' / 'audio' / bank
    predict_dir = ROOT / 'data' / 'predict' / bank
    bundle = ROOT / 'public' / 'datasets' / f'{bank}.bin'

    if '--repair' in sys.argv:
        # Keep the bundle, make again only its clips without a proper word (the same jobs: same voices,
        # the same number of clips per keyword and voice).
        blob = bundle.read_bytes()
        length = struct.unpack('<I', blob[:4])[0]
        old = json.loads(blob[4:4 + length].decode('utf-8'))
        if [tuple(c[:2]) for c in old['clips']] != [(label, voice) for label, _, voice, _, _ in jobs]:
            raise SystemExit('the bundle was made with other settings: run without --repair')
        size = int(RATE * SECONDS)
        clips = [unmulaw(np.frombuffer(blob, np.uint8, size, 4 + length + i * size)) for i in range(len(jobs))]
        bad = [i for i, clip in enumerate(clips) if problem(jobs[i][0], clip)]
        print(f'{len(bad)} of {len(clips)} clips have no proper word: making them again', flush=True)
        for i, clip in zip(bad, synthesize(tts, voices, [jobs[i] for i in bad])):
            clips[i] = clip
        shutil.rmtree(out_dir, ignore_errors=True)
    else:
        clips = synthesize(tts, voices, jobs + trials)
        for folder in (out_dir, predict_dir):
            shutil.rmtree(folder, ignore_errors=True)
        for (label, text, voice, _, _), clip in zip(trials, clips[len(jobs):]):
            write_wav(predict_dir / f'{text}_{voice}.wav', clip)
    index_clips = []
    data = bytearray()
    counts = {}
    for (label, text, voice, speed, steps), clip in zip(jobs, clips):
        index_clips.append([label, voice, text.rstrip('.!?')])  # the word too: errors can be told per word
        data += mulaw(clip).tobytes()
        if voice in builtin:  # the folder keeps the built-in voices' clips only (the .bin has them all)
            n = counts[(label, voice)] = counts.get((label, voice), 0) + 1
            write_wav(out_dir / label / f'{voice}_{n:02d}.wav', clip)
    left = [i for i in range(len(jobs)) if problem(jobs[i][0], unmulaw(mulaw(clips[i])))]
    print(f'check: {len(left)} clips without a proper word', flush=True)
    said = {}
    for label, text, *_ in jobs:
        if label == 'unknown':
            said[text.rstrip('.!?')] = said.get(text.rstrip('.!?'), 0) + 1
    print(f'unknown: {len(said)} words, {min(said.values())} … {max(said.values())} clips each', flush=True)
    index = json.dumps({'rate': RATE, 'seconds': SECONDS, 'labels': keywords + ['unknown'], 'voices': names, 'source': 'Supertonic 3 (Supertone)', **({'testVoices': test_voices, 'parents': parents} if families else {}), 'clips': index_clips}, ensure_ascii=False).encode('utf-8')
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_bytes(struct.pack('<I', len(index)) + index + bytes(data))
    print(f'{len(index_clips)} clips, {len(voices)} voices -> {bundle.relative_to(ROOT)} ({bundle.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    sys.exit(main())
