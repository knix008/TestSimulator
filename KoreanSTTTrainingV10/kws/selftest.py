"""특징, 학습, ONNX, C++ 로그멜이 같은지 확인한다."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from kws.features import FrontendConfig, FeatureExtractor, prepare_waveform
from kws.infer import decide
from kws.paths import SOURCE_ROOT
from kws.project import SILENCE_LABEL, Project, validate_command


def test_contracts() -> None:
    cfg = FrontendConfig()
    assert cfg.n_samples == 16000
    assert cfg.n_frames == 98
    assert cfg.n_freqs == 257
    extractor = FeatureExtractor(cfg)
    assert extractor.mel.shape == (40, 257)
    assert np.all(extractor.mel >= 0)
    assert np.all(extractor.mel.sum(axis=1) > 0)

    time_axis = np.arange(16000, dtype=np.float32) / 16000.0
    tone = (0.2 * np.sin(2 * np.pi * 440 * time_axis)).astype(np.float32)
    prepared = prepare_waveform(tone, cfg, augment=False)
    assert prepared.shape == (16000,)
    assert abs(float(np.max(np.abs(prepared))) - 0.9) < 1e-3
    quiet = (0.001 * np.sin(2 * np.pi * 200 * time_axis)).astype(np.float32)
    quiet_out = prepare_waveform(quiet, cfg, augment=False)
    assert float(np.max(np.abs(quiet_out))) < cfg.peak_min
    long_wav = np.random.default_rng(1).normal(0, 0.1, 32000).astype(np.float32)
    fitted = prepare_waveform(long_wav, cfg, augment=False)
    assert fitted.shape == (16000,)
    assert np.array_equal(fitted, prepare_waveform(long_wav, cfg, augment=False))

    extractor.fit([tone, quiet, long_wav])
    feature = extractor.transform(tone, augment=False)
    assert feature.shape == (1, 40, 98)
    assert np.all(np.isfinite(feature))

    labels = ["가", "나", "무음"]
    silence = decide(np.array([0.1, 0.1, 0.8], dtype=np.float32), labels, "무음", 0.7)
    assert not silence.accepted and silence.label == "대기"
    accepted = decide(np.array([0.9, 0.05, 0.05], dtype=np.float32), labels, "무음", 0.7)
    assert accepted.accepted and accepted.top_label == "가"
    unsure = decide(np.array([0.5, 0.3, 0.2], dtype=np.float32), labels, "무음", 0.7)
    assert not unsure.accepted and unsure.near_label == "가"

    try:
        validate_command("무음", [])
        raise AssertionError("무음 명령은 거부되어야 합니다.")
    except ValueError:
        pass
    with tempfile.TemporaryDirectory() as temp_dir:
        project = Project(Path(temp_dir))
        assert project.commands == ["출근", "퇴근", "경비", "해제"]
        assert project.labels()[-1] == SILENCE_LABEL
        while len(project.commands) < 10:
            project.add_command(f"추가{len(project.commands)}")
        try:
            project.add_command("메뉴")
            raise AssertionError("11번째 명령은 거부되어야 합니다.")
        except ValueError:
            pass
        project.remove_command("해제")
        assert project.add_command("메뉴") == "메뉴"
    print("contracts ok")


def test_cpp(exe: Path, extractor: FeatureExtractor, wav: np.ndarray, label: str) -> None:
    from kws.audio import save_wav

    with tempfile.TemporaryDirectory() as temp_dir:
        model_dir = Path(temp_dir)
        extractor.write_runtime_files(model_dir, ["가", "무음"], "무음")
        wav_path = model_dir / "sample.wav"
        save_wav(wav_path, wav, extractor.cfg.sample_rate)
        from kws.audio import load_model_wav

        reference = extractor.transform(load_model_wav(wav_path), augment=False).reshape(-1)
        out_path = model_dir / "cpp.bin"
        env = os.environ.copy()
        env["PATH"] = str(Path(exe).resolve().parent) + os.pathsep + env.get("PATH", "")
        gpp_dir = Path(shutil.which("g++") or r"C:\Msys64\ucrt64\bin\g++.exe").parent
        env["PATH"] = str(gpp_dir) + os.pathsep + env["PATH"]
        completed = subprocess.run(
            [str(exe), str(model_dir), str(wav_path), str(out_path)],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        if completed.returncode != 0:
            raise AssertionError(completed.stderr or completed.stdout)
        got = np.fromfile(out_path, dtype=np.float32)
        diff = float(np.max(np.abs(got - reference))) if got.size else float("inf")
        print(f"cpp {label} max abs diff {diff:.6f}")
        if got.shape != reference.shape or diff > 2e-3:
            print("python", reference[:8])
            print("cpp   ", got[:8])
            raise AssertionError(f"C++ 특징이 Python과 다릅니다 ({label}): {diff}")


def build_test_logmel() -> Path:
    gpp = shutil.which("g++") or r"C:\Msys64\ucrt64\bin\g++.exe"
    if not Path(gpp).exists():
        raise FileNotFoundError("g++를 찾을 수 없습니다.")
    out_dir = SOURCE_ROOT / "cpp" / "build"
    out_dir.mkdir(parents=True, exist_ok=True)
    exe = out_dir / "test_logmel.exe"
    source = SOURCE_ROOT / "cpp" / "test_logmel.cpp"
    base = [gpp, "-std=c++17", "-O2", "-I", str(SOURCE_ROOT / "cpp"), "-o", str(exe), str(source)]
    static_cmd = [*base[:3], "-static", *base[3:]]
    try:
        subprocess.run(static_cmd, check=True)
    except subprocess.CalledProcessError:
        subprocess.run(base, check=True)
    return exe


def test_train() -> None:
    from kws.audio import save_wav
    from kws.infer import ModelBundle
    from kws.train import TrainOptions, train_project

    labels = ["가", "나", "다", "라", SILENCE_LABEL]
    frequencies = {"가": 400, "나": 800, "다": 1400, "라": 2200}
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        audio = root / "audio"
        rng = np.random.default_rng(7)
        for label in labels:
            folder = audio / label
            folder.mkdir(parents=True)
            for index in range(12):
                wav = synthesize(label, frequencies.get(label), rng)
                save_wav(folder / f"{index:04d}.wav", wav, 16000)
        result = train_project(
            audio,
            labels,
            root / "model",
            TrainOptions(epochs=12, patience=6, batch_size=8, make_int8=True, seed=3),
        )
        print(f"val accuracy {result.val_accuracy:.3f} params {result.parameter_count}")
        print(result.export_log)
        if result.val_accuracy < 0.9 or not result.export_ok:
            raise AssertionError("합성음 학습 또는 ONNX 내보내기에 실패했습니다.")
        bundle = ModelBundle(root / "model")
        classifier = bundle.classifier("onnx")
        torch_classifier = bundle.classifier("pytorch")
        correct = 0
        total = 0
        for index, label in enumerate(labels):
            for path in sorted((audio / label).glob("*.wav")):
                from kws.audio import load_model_wav

                wav = load_model_wav(path)
                probs = classifier.predict_proba(wav)
                total += 1
                correct += int(int(np.argmax(probs)) == index)
                if total == 1:
                    other = torch_classifier.predict_proba(wav)
                    if int(np.argmax(other)) != int(np.argmax(probs)):
                        raise AssertionError("PyTorch와 ONNX 판정이 다릅니다.")
        accuracy = correct / total
        print(f"file accuracy {accuracy:.3f}")
        if accuracy < 0.9:
            raise AssertionError("저장한 파일을 다시 인식하지 못했습니다.")
    print("train ok")


def synthesize(label: str, frequency: int | None, rng: np.random.Generator) -> np.ndarray:
    wav = np.zeros(16000, dtype=np.float32)
    if frequency is None or label == SILENCE_LABEL:
        return rng.normal(0.0, 0.002, 16000).astype(np.float32)
    start = int(rng.integers(1500, 4500))
    duration = int(rng.integers(4500, 8000))
    time_axis = np.arange(duration, dtype=np.float32) / 16000.0
    f0 = frequency + float(rng.uniform(-25, 25))
    envelope = np.hanning(duration).astype(np.float32)
    tone = envelope * np.sin(2 * np.pi * f0 * time_axis)
    tone += 0.25 * envelope * np.sin(2 * np.pi * f0 * 2 * time_axis)
    wav[start : start + duration] = (0.35 * tone).astype(np.float32)
    wav += rng.normal(0.0, 0.004, 16000).astype(np.float32)
    return wav


def test_gui() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        os.environ["KWS_ROOT"] = temp_dir
        try:
            from gui.app import run

            run(start_loop=False)
        finally:
            os.environ.pop("KWS_ROOT", None)
    print("gui ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--skip-gui", action="store_true")
    parser.add_argument("--skip-cpp", action="store_true")
    args = parser.parse_args()
    test_contracts()
    if not args.skip_cpp:
        cfg = FrontendConfig()
        extractor = FeatureExtractor(cfg)
        time_axis = np.arange(16000, dtype=np.float32) / 16000.0
        tone = (0.25 * np.sin(2 * np.pi * 523 * time_axis)).astype(np.float32)
        long_tone = np.concatenate([np.zeros(2000, dtype=np.float32), tone, np.zeros(4000, dtype=np.float32)])
        quiet = (0.001 * np.sin(2 * np.pi * 180 * time_axis)).astype(np.float32)
        noise = np.random.default_rng(0).normal(0, 0.15, size=(4, 16000)).astype(np.float32)
        extractor.fit([tone, long_tone, quiet, *noise])
        exe = build_test_logmel()
        test_cpp(exe, extractor, tone, "exact")
        test_cpp(exe, extractor, long_tone, "long")
        test_cpp(exe, extractor, quiet, "quiet")
        test_cpp(exe, extractor, tone[:8000], "short")
    if not args.skip_train:
        test_train()
    if not args.skip_gui:
        test_gui()
    print("SELFTEST OK")


if __name__ == "__main__":
    main()
