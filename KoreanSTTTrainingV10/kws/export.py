"""학습된 모델을 ONNX로 저장하고 PyTorch 출력과 비교한다."""

from __future__ import annotations

import gc
from pathlib import Path

import numpy as np

from kws import paths
from kws.features import INPUT_NAME, OUTPUT_NAME, FeatureExtractor
from kws.model import ARCHS, arch_title, build_model


def export_onnx(model_dir: Path, audio_root: Path | None = None, make_int8: bool = True) -> str:
    import torch

    model_dir = Path(model_dir)
    meta_path = model_dir / paths.META_FILENAME
    if not meta_path.exists():
        raise FileNotFoundError("모델 정보가 없습니다. 먼저 학습하세요.")
    import json

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    arch = meta.get("arch")
    if arch not in ARCHS:
        raise ValueError("이 프로그램이 만든 모델이 아닙니다.")
    labels = list(meta["labels"])
    extractor = FeatureExtractor.load(model_dir / paths.FRONTEND_NPZ)
    model = build_model(len(labels), arch)
    try:
        state = torch.load(model_dir / paths.CHECKPOINT_FILENAME, map_location="cpu", weights_only=True)
    except TypeError:
        state = torch.load(model_dir / paths.CHECKPOINT_FILENAME, map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    dummy = torch.zeros(1, 1, extractor.cfg.n_mels, extractor.cfg.n_frames, dtype=torch.float32)
    onnx_path = model_dir / paths.ONNX_FILENAME
    with torch.no_grad():
        _export_graph(model, dummy, onnx_path)

    import onnx
    import onnxruntime as ort

    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    if input_name != INPUT_NAME or output_name != OUTPUT_NAME:
        raise RuntimeError("ONNX 입출력 이름이 예상과 다릅니다.")
    shape = list(session.get_inputs()[0].shape)
    expected = [1, 1, extractor.cfg.n_mels, extractor.cfg.n_frames]
    if [int(item) for item in shape] != expected:
        raise RuntimeError(f"ONNX 입력 크기가 {expected}가 아닙니다: {shape}")

    samples = [dummy.numpy(), np.random.default_rng(0).normal(size=dummy.shape).astype(np.float32)]
    wav_paths = _sample_wavs(audio_root, labels) if audio_root is not None else []
    for wav_path in wav_paths[:4]:
        from kws.audio import load_model_wav

        feature = extractor.transform(load_model_wav(wav_path))[None, ...]
        samples.append(np.ascontiguousarray(feature, dtype=np.float32))

    max_diff = 0.0
    with torch.no_grad():
        for sample in samples:
            torch_out = model(torch.from_numpy(sample)).numpy()
            onnx_out = session.run(None, {input_name: sample})[0]
            max_diff = max(max_diff, float(np.max(np.abs(torch_out - onnx_out))))
    del session
    gc.collect()
    if max_diff > 1e-3:
        raise RuntimeError(f"ONNX 출력이 PyTorch와 다릅니다. 최대 차이 {max_diff:.5f}")

    lines = [
        f"ONNX 저장: {onnx_path}",
        f"모델 구조: {arch_title(arch)}",
        f"크기: {onnx_path.stat().st_size / 1024:.1f} KB",
        f"PyTorch와 최대 로짓 차이: {max_diff:.6f}",
        f"입력: {INPUT_NAME} {expected}",
        f"출력: {OUTPUT_NAME} 로짓",
    ]
    if make_int8:
        lines.extend(_export_int8(onnx_path, model_dir, extractor, wav_paths))
    return "\n".join(lines)


def _export_graph(model, dummy, path: Path) -> None:
    import torch

    kwargs = dict(
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=[INPUT_NAME],
        output_names=[OUTPUT_NAME],
    )
    try:
        torch.onnx.export(model, dummy, str(path), dynamo=False, **kwargs)
    except TypeError:
        torch.onnx.export(model, dummy, str(path), **kwargs)


def _sample_wavs(audio_root: Path | None, labels: list[str]) -> list[Path]:
    if audio_root is None:
        return []
    found: list[Path] = []
    for label in labels:
        folder = audio_root / label
        if not folder.is_dir():
            continue
        found.extend(sorted(path for path in folder.glob("*.wav") if path.is_file())[:4])
    return found


def _export_int8(onnx_path: Path, model_dir: Path, extractor: FeatureExtractor, wav_paths: list[Path]) -> list[str]:
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except Exception as exc:
        return [f"INT8 저장은 건너뛰었습니다. {exc}"]
    int8_path = model_dir / paths.ONNX_INT8_FILENAME
    try:
        quantize_dynamic(str(onnx_path), str(int8_path), weight_type=QuantType.QInt8)
    except Exception as exc:
        return [f"INT8 저장에 실패했습니다. 실수형 ONNX는 사용할 수 있습니다. {exc}"]
    float_size = onnx_path.stat().st_size
    int8_size = int8_path.stat().st_size
    if int8_size >= float_size:
        # 깊이별 합성곱이 많은 작은 모델은 양자화 노드가 가중치 절약보다 커질 수 있다.
        int8_path.unlink(missing_ok=True)
        return [
            f"INT8은 {int8_size / 1024:.1f} KB로 실수형({float_size / 1024:.1f} KB)보다 커서 저장하지 않았습니다. 실수형 ONNX를 쓰세요."
        ]
    lines = [f"INT8 저장: {int8_path}", f"INT8 크기: {int8_size / 1024:.1f} KB"]
    if not wav_paths:
        return lines
    try:
        import onnxruntime as ort

        from kws.audio import load_model_wav

        float_session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        int8_session = ort.InferenceSession(str(int8_path), providers=["CPUExecutionProvider"])
        same = 0
        total = 0
        for wav_path in wav_paths[:40]:
            feature = extractor.transform(load_model_wav(wav_path))[None, ...]
            feeds = {INPUT_NAME: np.ascontiguousarray(feature, dtype=np.float32)}
            float_top = int(np.argmax(float_session.run(None, feeds)[0]))
            int8_top = int(np.argmax(int8_session.run(None, feeds)[0]))
            same += int(float_top == int8_top)
            total += 1
        if total:
            rate = same / total
            lines.append(f"INT8 상위 클래스 일치: {same}/{total} ({rate * 100:.1f}%)")
            if rate < 0.95:
                lines.append("INT8 판정이 실수형과 꽤 다릅니다. 배포 전에는 실수형 ONNX를 쓰세요.")
    except Exception as exc:
        lines.append(f"INT8 비교는 건너뛰었습니다. {exc}")
    return lines


def main() -> int:
    import argparse
    import sys

    from kws.project import Project

    parser = argparse.ArgumentParser(description="학습된 가중치를 ONNX로 다시 저장합니다.")
    parser.add_argument("--no-int8", action="store_true", help="INT8 ONNX는 만들지 않습니다.")
    args = parser.parse_args()
    project = Project()
    try:
        print(export_onnx(project.model_dir, project.audio, make_int8=not args.no_int8))
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
