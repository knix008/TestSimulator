"""Supertonic 2로 남녀 목소리를 같은 수만큼 만들어 학습과 별도 음원으로 평가한다."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable

import numpy as np

from kws import paths
from kws.audio import TARGET_SAMPLE_RATE, load_model_wav, resample, save_wav
from kws.infer import ModelBundle, command_probs, decide
from kws.project import SILENCE_LABEL
from kws.train import TrainOptions, train_project

COMMANDS = ["출근", "퇴근", "경비", "해제"]
TTS_MODEL = "supertonic-2"
MALE_VOICES = ["M1", "M2", "M3", "M4", "M5"]
FEMALE_VOICES = ["F1", "F2", "F3", "F4", "F5"]
VOICES = [*MALE_VOICES, *FEMALE_VOICES]
TRAIN_SPEEDS = [0.85, 0.95, 1.05, 1.20, 1.35]
TEST_SPEEDS = [0.75, 1.50]
TRAIN_PITCH = [0.90, 0.95, 1.0, 1.05, 1.10]
TEST_PITCH = [0.93, 1.0, 1.07]
NOISY_TRAIN_PITCH = [0.95, 1.05]
TRAIN_OTHER = ["안녕하세요", "감사합니다", "날씨", "네", "아니요", "여보세요"]
TRAIN_OTHER_PITCH = [0.96, 1.0, 1.04]
TEST_OTHER = ["음악", "출입문", "비밀번호", "오늘"]
SYNTH_STEPS = 5
THRESHOLD = 0.70
# 예전 Windows 음성의 말하기 속도 이름. 테스트가 학습·평가 속도가 겹치지 않는지만 본다.
TRAIN_RATES = TRAIN_SPEEDS
TEST_RATES = TEST_SPEEDS


def synth_root() -> Path:
    return paths.root() / "data" / "synth"


def generate_dataset(
    commands: list[str],
    root: Path | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, int]:
    """명령마다 학습용과 평가용 합성 음을 만들고, 학습용 클래스별 개수를 돌려준다."""
    commands = [str(command).strip() for command in commands if str(command).strip()]
    if not commands:
        raise ValueError("음을 만들 명령이 없습니다.")
    root = Path(root) if root is not None else synth_root()
    if root.exists():
        shutil.rmtree(root)
    base_dir = root / "base"
    train_dir = root / "train"
    test_dir = root / "test"
    base_dir.mkdir(parents=True)
    jobs = _speech_jobs(base_dir, commands)
    if on_progress is not None:
        on_progress(f"Supertonic 2로 남녀 음성 {len(jobs)}개를 합성하는 중입니다.")
    _synthesize_all(jobs, on_progress)
    if on_progress is not None:
        on_progress("높이, 속도, 소음을 바꾼 학습 음을 만드는 중입니다.")
    _build_splits(base_dir, train_dir, test_dir, commands)
    labels = [*commands, SILENCE_LABEL]
    return {label: len(list((train_dir / label).glob("*.wav"))) for label in labels}


def main() -> int:
    root = synth_root()
    train_dir = root / "train"
    test_dir = root / "test"
    model_dir = paths.root() / "models" / "synth_eval"
    if model_dir.exists():
        shutil.rmtree(model_dir)

    counts = generate_dataset(COMMANDS, root, on_progress=lambda text: print(text, flush=True))
    print("학습 음: " + ", ".join(f"{label} {count}개" for label, count in counts.items()), flush=True)
    labels = [*COMMANDS, SILENCE_LABEL]
    print("학습 시작", flush=True)
    result = train_project(
        train_dir,
        labels,
        model_dir,
        TrainOptions(
            epochs=50,
            patience=20,
            batch_size=16,
            learning_rate=2e-3,
            make_int8=False,
            seed=7,
        ),
        on_event=_print_event,
    )
    print(result.report)
    print(result.export_log)
    if not result.export_ok:
        return 1
    report = _evaluate(model_dir, test_dir)
    print(report)
    print(f"학습 음원: {train_dir}")
    print(f"평가 음원: {test_dir}")
    print(f"모델: {model_dir}")
    return 0


def _other_words(words: list[str], commands: list[str]) -> list[str]:
    return [word for word in words if not any(command in word or word in command for command in commands)]


def command_train_clips() -> int:
    """명령 하나당 학습 파일 수. 남녀 목소리 수, 속도, 높이, 소음 변형을 곱한 값이다."""
    return len(VOICES) * len(TRAIN_SPEEDS) * (len(TRAIN_PITCH) + len(NOISY_TRAIN_PITCH))


def _speech_jobs(base_dir: Path, commands: list[str]) -> list[tuple[str, str, float, Path]]:
    jobs: list[tuple[str, str, float, Path]] = []
    train_other = _other_words(TRAIN_OTHER, commands)
    test_other = _other_words(TEST_OTHER, commands)
    for word in [*commands, *train_other, *test_other]:
        speeds: set[float] = set()
        if word in commands or word in train_other:
            speeds.update(TRAIN_SPEEDS)
        if word in commands or word in test_other:
            speeds.update(TEST_SPEEDS)
        for voice in VOICES:
            for speed in sorted(speeds):
                name = f"{_safe_name(word)}_{voice}_s{speed:.2f}.wav"
                jobs.append((word, voice, speed, base_dir / name))
    return jobs


def _safe_name(word: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in word)


def _synthesize_all(
    jobs: list[tuple[str, str, float, Path]],
    on_progress: Callable[[str], None] | None = None,
) -> None:
    try:
        from supertonic import TTS
    except ImportError as exc:
        raise RuntimeError("supertonic 패키지가 없습니다. pip install supertonic 으로 설치하세요.") from exc
    engine = TTS(model=TTS_MODEL, auto_download=True)
    available = set(engine.voice_style_names)
    missing_voices = [voice for voice in VOICES if voice not in available]
    if missing_voices:
        raise RuntimeError(f"{TTS_MODEL}에 없는 목소리입니다: {', '.join(missing_voices)}")
    styles = {voice: engine.get_voice_style(voice) for voice in VOICES}
    for index, (text, voice, speed, path) in enumerate(jobs, start=1):
        wav, _ = engine.synthesize(
            text,
            voice_style=styles[voice],
            lang="ko",
            speed=float(speed),
            total_steps=SYNTH_STEPS,
        )
        audio = np.asarray(wav, dtype=np.float32).reshape(-1)
        if int(engine.sample_rate) != TARGET_SAMPLE_RATE:
            audio = resample(audio, int(engine.sample_rate), TARGET_SAMPLE_RATE)
        save_wav(path, audio, TARGET_SAMPLE_RATE)
        if on_progress is not None and (index == 1 or index % 20 == 0 or index == len(jobs)):
            on_progress(f"Supertonic 2 합성 {index}/{len(jobs)} ({voice})")
    missing = [str(path.name) for _, _, _, path in jobs if not path.exists() or path.stat().st_size < 44]
    if missing:
        raise RuntimeError("합성되지 않은 파일이 있습니다: " + ", ".join(missing[:5]))


def _build_splits(base_dir: Path, train_dir: Path, test_dir: Path, commands: list[str]) -> None:
    rng = np.random.default_rng(11)
    for word in commands:
        for voice in VOICES:
            for speed in TRAIN_SPEEDS:
                source = _load_base(base_dir, word, voice, speed)
                for pitch in TRAIN_PITCH:
                    _write_variant(train_dir / word, source, voice, pitch, None, rng)
                    if pitch in NOISY_TRAIN_PITCH:
                        _write_variant(train_dir / word, source, voice, pitch, 18.0, rng)
            for speed in TEST_SPEEDS:
                source = _load_base(base_dir, word, voice, speed)
                for pitch in TEST_PITCH:
                    _write_variant(test_dir / "깨끗" / word, source, voice, pitch, None, rng)
                    _write_variant(test_dir / "소음섞인" / word, source, voice, pitch, 20.0, rng)
    for word in _other_words(TRAIN_OTHER, commands):
        for voice in VOICES:
            for speed in TRAIN_SPEEDS:
                source = _load_base(base_dir, word, voice, speed)
                for pitch in TRAIN_OTHER_PITCH:
                    _write_variant(train_dir / SILENCE_LABEL, source, voice, pitch, None, rng)
    for word in _other_words(TEST_OTHER, commands):
        for voice in VOICES:
            for speed in TEST_SPEEDS:
                source = _load_base(base_dir, word, voice, speed)
                _write_variant(test_dir / "다른말", source, voice, 1.0, None, rng)
    for kind, level in (("zero", 0.01), ("white", 0.02), ("hum60", 0.02), ("hum120", 0.02), ("muffled", 0.02), ("fan", 0.02)):
        _write_array(train_dir / SILENCE_LABEL / f"noise_{kind}.wav", _noise(kind, rng, level))
    for kind in ("white", "hum60", "fan", "muffled"):
        _write_array(test_dir / "소음" / f"{kind}.wav", _noise(kind, rng, 0.02))


def _load_base(base_dir: Path, word: str, voice: str, speed: float) -> np.ndarray:
    return load_model_wav(base_dir / f"{_safe_name(word)}_{voice}_s{speed:.2f}.wav")


def _write_variant(
    folder: Path,
    wav: np.ndarray,
    voice: str,
    pitch: float,
    snr_db: float | None,
    rng: np.random.Generator,
) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    changed = _pitch_shift(wav, pitch)
    if snr_db is not None:
        changed = _mix_noise(changed, snr_db, rng)
    name = f"{len(list(folder.glob('*.wav'))):04d}_{voice}_p{pitch:.2f}.wav"
    save_wav(folder / name, changed, TARGET_SAMPLE_RATE)


def _write_array(path: Path, wav: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    save_wav(path, wav, TARGET_SAMPLE_RATE)


def _pitch_shift(wav: np.ndarray, factor: float) -> np.ndarray:
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    if abs(factor - 1.0) < 1e-3 or wav.size < 2:
        return wav
    new_length = max(2, int(round(wav.size / factor)))
    old_time = np.linspace(0.0, 1.0, num=wav.size, endpoint=False)
    new_time = np.linspace(0.0, 1.0, num=new_length, endpoint=False)
    return np.interp(new_time, old_time, wav).astype(np.float32)


def _mix_noise(wav: np.ndarray, snr_db: float, rng: np.random.Generator) -> np.ndarray:
    power = float(np.mean(np.square(wav.astype(np.float64)))) + 1e-8
    noise_power = power / (10.0 ** (snr_db / 10.0))
    noise = rng.normal(0.0, np.sqrt(noise_power), size=wav.shape).astype(np.float32)
    return np.clip(wav + noise, -1.0, 1.0).astype(np.float32)


def _noise(kind: str, rng: np.random.Generator, level: float) -> np.ndarray:
    count = TARGET_SAMPLE_RATE
    time_axis = np.arange(count, dtype=np.float32) / TARGET_SAMPLE_RATE
    if kind == "zero":
        return np.zeros(count, dtype=np.float32)
    if kind == "white":
        return rng.normal(0.0, level, count).astype(np.float32)
    if kind == "hum60":
        return (level * np.sin(2 * np.pi * 60 * time_axis)).astype(np.float32)
    if kind == "hum120":
        tone = np.sin(2 * np.pi * 120 * time_axis) + 0.4 * np.sin(2 * np.pi * 240 * time_axis)
        return (level * tone).astype(np.float32)
    if kind == "muffled":
        white = rng.normal(0.0, 1.0, count).astype(np.float32)
        kernel = np.ones(40, dtype=np.float32) / 40.0
        return (level * 4 * np.convolve(white, kernel, mode="same")).astype(np.float32)
    if kind == "fan":
        white = rng.normal(0.0, 1.0, count).astype(np.float32)
        kernel = np.ones(12, dtype=np.float32) / 12.0
        hum = 0.3 * np.sin(2 * np.pi * 100 * time_axis)
        return (level * (np.convolve(white, kernel, mode="same") + hum)).astype(np.float32)
    raise ValueError(kind)


def _print_event(event: dict) -> None:
    text = event.get("text")
    if text:
        print(text, flush=True)


def _evaluate(model_dir: Path, test_dir: Path) -> str:
    bundle = ModelBundle(model_dir)
    classifier = bundle.classifier("onnx")
    rows = [
        "별도 음원 평가 (학습에 쓰지 않은 말하기 속도)",
        "기준: 무음이 아니고 확신 70% 이상일 때만 명령으로 인정",
    ]
    for group in ("깨끗", "소음섞인"):
        hits = 0
        total = 0
        rows.append(group)
        for command in COMMANDS:
            files = sorted((test_dir / group / command).glob("*.wav"))
            accepted = 0
            top1 = 0
            for path in files:
                decision = _predict(classifier, bundle, path)
                accepted += int(decision.accepted and decision.label == command)
                top1 += int(decision.top_label == command)
                if not (decision.accepted and decision.label == command):
                    shown = decision.label if decision.accepted else f"대기/{decision.top_label}"
                    rows.append(
                        f"  {command} {path.name}: {shown} ({decision.top_confidence:.0%})"
                    )
            hits += accepted
            total += len(files)
            rows.append(f"  {command}: 인정 {accepted}/{len(files)}, 1순위 {top1}/{len(files)}")
        rows.append(f"  합계: 인정 {hits}/{total}")
    for group in ("다른말", "소음"):
        files = sorted((test_dir / group).glob("*.wav"))
        rejected = 0
        for path in files:
            decision = _predict(classifier, bundle, path)
            rejected += int(not decision.accepted)
            if decision.accepted:
                rows.append(f"  오인식 {group}/{path.name}: {decision.label} ({decision.top_confidence:.0%})")
        rows.append(f"{group} 거절: {rejected}/{len(files)}")
    rows.append("이 음원은 Supertonic 2의 남녀 목소리와 높이·속도 변형입니다. 실제 마이크 정확도와는 다릅니다.")
    return "\n".join(rows)


def _predict(classifier, bundle: ModelBundle, path: Path):
    probs = command_probs(classifier, load_model_wav(path))
    return decide(probs, bundle.labels, bundle.silence_label, THRESHOLD)


if __name__ == "__main__":
    raise SystemExit(main())
