"""학습된 모델로 1초 음성을 판정한다. 거절 규칙은 C++ 예제와 같다."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from kws import paths
from kws.features import FeatureExtractor
from kws.project import SILENCE_LABEL

REJECT_LABEL = "대기"


@dataclass
class Decision:
    accepted: bool
    label: str
    top_label: str
    top_confidence: float
    near_label: str
    near_confidence: float


def softmax(logits: np.ndarray) -> np.ndarray:
    scores = np.asarray(logits, dtype=np.float64).reshape(-1)
    scores = scores - np.max(scores)
    exp_scores = np.exp(scores)
    return (exp_scores / np.sum(exp_scores)).astype(np.float32)


def decide(probs: np.ndarray, labels: list[str], silence_label: str, threshold: float) -> Decision:
    values = np.asarray(probs, dtype=np.float32).reshape(-1)
    if values.size != len(labels):
        raise ValueError("확률 개수와 클래스 개수가 다릅니다.")
    top_index = int(np.argmax(values))
    silence_index = labels.index(silence_label)
    near_scores = values.copy()
    near_scores[silence_index] = -1.0
    near_index = int(np.argmax(near_scores))
    # C++ 예제와 같이 float32로 비교해야 임계값과 같은 확률의 판정이 일치한다.
    accepted = labels[top_index] != silence_label and values[top_index] >= np.float32(threshold)
    return Decision(
        accepted=accepted,
        label=labels[top_index] if accepted else REJECT_LABEL,
        top_label=labels[top_index],
        top_confidence=float(values[top_index]),
        near_label=labels[near_index],
        near_confidence=float(values[near_index]),
    )


class ModelBundle:
    def __init__(self, model_dir: Path) -> None:
        self.model_dir = Path(model_dir)
        meta_path = self.model_dir / paths.META_FILENAME
        if not meta_path.exists():
            raise FileNotFoundError("학습된 모델이 없습니다. 먼저 학습하세요.")
        self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.labels = [str(label) for label in self.meta["labels"]]
        self.silence_label = str(self.meta.get("silence_label", SILENCE_LABEL))
        self.extractor = FeatureExtractor.load(self.model_dir / paths.FRONTEND_NPZ)

    def engines(self) -> list[str]:
        found: list[str] = []
        if (self.model_dir / paths.ONNX_FILENAME).exists():
            found.append("onnx")
        if (self.model_dir / paths.CHECKPOINT_FILENAME).exists():
            found.append("pytorch")
        return found

    def classifier(self, engine: str) -> "Classifier":
        if engine == "onnx":
            return OnnxClassifier(self)
        if engine == "pytorch":
            return TorchClassifier(self)
        raise ValueError("지원하지 않는 추론 엔진입니다.")


class Classifier:
    def predict_proba(self, wav: np.ndarray) -> np.ndarray:
        raise NotImplementedError


class OnnxClassifier(Classifier):
    def __init__(self, bundle: ModelBundle) -> None:
        import onnxruntime as ort

        path = bundle.model_dir / paths.ONNX_FILENAME
        if not path.exists():
            raise FileNotFoundError("ONNX 파일이 없습니다.")
        self.bundle = bundle
        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

    def predict_proba(self, wav: np.ndarray) -> np.ndarray:
        feature = self.bundle.extractor.transform(wav)[None, ...]
        logits = self.session.run(None, {self.input_name: np.ascontiguousarray(feature, dtype=np.float32)})[0][0]
        return softmax(logits)


class TorchClassifier(Classifier):
    def __init__(self, bundle: ModelBundle) -> None:
        import torch

        from kws.model import build_model

        self.bundle = bundle
        self.torch = torch
        self.model = build_model(len(bundle.labels))
        checkpoint = bundle.model_dir / paths.CHECKPOINT_FILENAME
        try:
            state = torch.load(checkpoint, map_location="cpu", weights_only=True)
        except TypeError:
            state = torch.load(checkpoint, map_location="cpu")
        self.model.load_state_dict(state)
        self.model.eval()

    def predict_proba(self, wav: np.ndarray) -> np.ndarray:
        feature = self.bundle.extractor.transform(wav)[None, ...]
        tensor = self.torch.from_numpy(np.ascontiguousarray(feature, dtype=np.float32))
        with self.torch.no_grad():
            logits = self.model(tensor).numpy()[0]
        return softmax(logits)


def main() -> int:
    import argparse
    import sys

    from kws.audio import load_model_wav
    from kws.project import Project

    parser = argparse.ArgumentParser(description="WAV 파일 하나를 학습된 모델로 판정합니다.")
    parser.add_argument("wav", type=Path, help="16 kHz로 변환해 판정할 WAV")
    parser.add_argument("threshold", nargs="?", type=float, help="명령으로 받아들일 최소 확률. 생략하면 저장된 값.")
    parser.add_argument("--engine", choices=("onnx", "pytorch"), default="onnx")
    args = parser.parse_args()
    project = Project()
    threshold = project.threshold if args.threshold is None else args.threshold
    try:
        bundle = ModelBundle(project.model_dir)
        engine = args.engine if args.engine in bundle.engines() else bundle.engines()[0]
        probs = bundle.classifier(engine).predict_proba(load_model_wav(args.wav))
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 1
    decision = decide(probs, bundle.labels, bundle.silence_label, threshold)
    if decision.accepted:
        print(f"결과: {decision.label}")
        print(f"신뢰도: {decision.top_confidence:.3f}")
    else:
        print("결과: 대기")
        print(f"가장 가까운 명령: {decision.near_label}  {decision.near_confidence:.3f}")
    for label, prob in zip(bundle.labels, probs):
        print(f"{label}\t{float(prob):.3f}")
    print(f"ACCEPTED={1 if decision.accepted else 0}")
    print(f"LABEL={decision.label}")
    print(f"TOP_LABEL={decision.top_label}")
    print(f"TOP_CONFIDENCE={decision.top_confidence:.3f}")
    print(f"ENGINE={engine}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
