"""녹음 폴더로 명령어 모델을 학습하고 ONNX까지 저장한다.

여러 출처(합성 음, 내 녹음)를 섞을 수 있고, 이미 학습한 결과에서 이어서 학습(추가 학습)할 수 있다.
"""

from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

from kws import paths
from kws.audio import load_model_wav
from kws.features import FEATURE_VERSION, FeatureExtractor
from kws.model import ARCH_NAME, build_model, parameter_count
from kws.project import FINETUNE_EPOCHS, FINETUNE_LR, MIN_CLIPS, RECORDING_REPEAT, SILENCE_LABEL

@dataclass
class TrainOptions:
    epochs: int = 40
    batch_size: int = 16
    learning_rate: float = 2e-3
    weight_decay: float = 1e-4
    seed: int = 42
    patience: int = 15
    val_ratio: float = 0.2
    min_clips: int = MIN_CLIPS
    label_smoothing: float = 0.0
    make_int8: bool = True
    init_from: Path | None = None


@dataclass
class DataSource:
    """클래스 이름 폴더가 들어 있는 학습 음원 폴더. repeat만큼 한 에폭에 여러 번 쓴다."""

    root: Path
    name: str = "녹음"
    repeat: int = 1


@dataclass
class TrainResult:
    model_dir: Path
    val_accuracy: float
    val_loss: float
    best_epoch: int
    parameter_count: int
    history: list[dict] = field(default_factory=list)
    report: str = ""
    export_log: str = ""
    export_ok: bool = False
    stopped: bool = False
    source_accuracy: dict[str, float] = field(default_factory=dict)
    base_accuracy: dict[str, float] | None = None


def train_project(
    audio_root: Path | Sequence[DataSource],
    labels: list[str],
    out_dir: Path,
    options: TrainOptions | None = None,
    on_event: Callable[[dict], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
    silence_label: str = SILENCE_LABEL,
) -> TrainResult:
    import torch
    from torch import nn

    options = options or TrainOptions()
    if options.epochs < 1 or options.batch_size < 1:
        raise ValueError("에폭과 배치는 1 이상이어야 합니다.")
    if not 0 < options.learning_rate < 1:
        raise ValueError("학습률이 올바르지 않습니다.")
    if silence_label not in labels:
        raise ValueError("무음 클래스가 필요합니다.")
    if len(labels) < 2 or len(labels) > 11:
        raise ValueError("명령은 10개 이하이고 무음 클래스가 함께 있어야 합니다.")

    def emit(event: dict) -> None:
        if on_event is not None:
            on_event(event)

    def stopped() -> bool:
        return bool(should_stop and should_stop())

    sources = _as_sources(audio_root)
    source_names = [source.name for source in sources]
    files = _collect_sources(sources, labels)
    train_items, val_items = _split_items(files, labels, options.val_ratio, options.seed, options.min_clips)
    loaded = {item[0]: _load_item(item) for item in [*train_items, *val_items]}
    train_cache = [
        loaded[path] for path, _, source_index in train_items for _ in range(max(1, sources[source_index].repeat))
    ]
    val_cache = [loaded[path] for path, _, _ in val_items]
    val_sources = np.array([source_index for _, _, source_index in val_items], dtype=np.int64)

    base = _load_base(options.init_from, labels) if options.init_from is not None else None
    torch.manual_seed(options.seed)
    if base is not None:
        extractor = FeatureExtractor.load(Path(options.init_from) / paths.FRONTEND_NPZ)
    else:
        extractor = FeatureExtractor()
        extractor.fit([wav for wav, _ in train_cache])
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    extractor.save(out_dir / paths.FRONTEND_NPZ)
    extractor.write_runtime_files(out_dir, labels, silence_label)

    val_x = np.stack([extractor.transform(wav, augment=False) for wav, _ in val_cache], axis=0)
    val_y = np.array([index for _, index in val_cache], dtype=np.int64)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(len(labels))
    if base is not None:
        model.load_state_dict(base)
    model = model.to(device)
    count = parameter_count(model)
    emit({"type": "log", "text": f"장치: {device}"})
    emit({"type": "log", "text": f"파라미터: {count:,}"})
    for source_index, source in enumerate(sources):
        clips = sum(1 for _, _, index in train_items if index == source_index)
        held = int(np.sum(val_sources == source_index))
        repeat = f", 에폭마다 {source.repeat}번 사용" if source.repeat > 1 else ""
        emit({"type": "log", "text": f"{source.name}: 학습 {clips}개, 검증 {held}개{repeat}  ({source.root})"})
    emit({"type": "log", "text": "클래스: " + ", ".join(labels)})

    base_accuracy = None
    base_overall = 0.0
    if base is not None:
        _, base_overall, base_truth, base_pred = _evaluate(model, val_x, val_y, device)
        base_accuracy = _accuracy_by_source(base_truth, base_pred, val_sources, source_names)
        emit({"type": "log", "text": f"추가 학습 기반: {options.init_from}"})
        emit({"type": "log", "text": "추가 학습 전 검증 정확도 " + _format_accuracy(base_overall, base_accuracy)})

    class_counts = np.bincount([index for _, index in train_cache], minlength=len(labels)).astype(np.float64)
    weights = class_counts.sum() / np.maximum(class_counts, 1.0)
    weights = weights / weights.mean()
    criterion = nn.CrossEntropyLoss(
        weight=torch.tensor(weights, dtype=torch.float32, device=device),
        label_smoothing=options.label_smoothing,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=options.learning_rate, weight_decay=options.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, options.epochs))
    rng = np.random.default_rng(options.seed)

    best_state: dict | None = None
    best_acc = -1.0
    best_loss = float("inf")
    best_epoch = 0
    stale = 0
    history: list[dict] = []
    user_stopped = False

    for epoch in range(1, options.epochs + 1):
        if stopped():
            user_stopped = True
            emit({"type": "log", "text": "학습 중지를 요청했습니다."})
            break
        model.train()
        order = np.arange(len(train_cache))
        rng.shuffle(order)
        loss_sum = 0.0
        seen = 0
        for start in range(0, len(order), options.batch_size):
            if stopped():
                user_stopped = True
                break
            batch = [train_cache[int(index)] for index in order[start : start + options.batch_size]]
            features = np.stack([extractor.transform(wav, augment=True, rng=rng) for wav, _ in batch], axis=0)
            targets = np.array([index for _, index in batch], dtype=np.int64)
            feature_tensor = torch.from_numpy(np.ascontiguousarray(features)).to(device)
            target_tensor = torch.from_numpy(targets).to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(feature_tensor)
            loss = criterion(logits, target_tensor)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            loss_sum += float(loss.detach()) * len(batch)
            seen += len(batch)
        if user_stopped:
            emit({"type": "log", "text": "학습 중지를 요청했습니다."})
            break
        train_loss = loss_sum / max(1, seen)
        val_loss, val_acc, truth, predicted = _evaluate(model, val_x, val_y, device)
        scheduler.step()
        record = {
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "val_accuracy": val_acc,
        }
        history.append(record)
        line = (
            f"{epoch}/{options.epochs}  학습 손실 {train_loss:.3f}  "
            f"검증 손실 {val_loss:.3f}  검증 정확도 {val_acc * 100:.1f}%"
        )
        emit({"type": "epoch", **record, "epochs": options.epochs, "text": line})
        improved = val_acc > best_acc + 1e-4 or (abs(val_acc - best_acc) <= 1e-4 and val_loss < best_loss - 1e-5)
        if improved:
            best_acc = val_acc
            best_loss = val_loss
            best_epoch = epoch
            stale = 0
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            torch.save(best_state, out_dir / paths.CHECKPOINT_FILENAME)
        else:
            stale += 1
            if stale >= options.patience:
                emit({"type": "log", "text": "검증 정확도가 더 오르지 않아 학습을 마칩니다."})
                break

    if best_state is None or best_epoch == 0:
        raise RuntimeError("한 에폭이 끝나기 전에 중지되어 모델을 저장하지 못했습니다.")

    model.load_state_dict(best_state)
    _, final_acc, truth, predicted = _evaluate(model, val_x, val_y, device)
    source_accuracy = _accuracy_by_source(truth, predicted, val_sources, source_names)
    report = _classification_report(labels, truth, predicted)
    report += "\n검증 정확도 " + _format_accuracy(final_acc, source_accuracy)
    if base_accuracy is not None:
        report += "\n추가 학습 전 " + _format_accuracy(base_overall, base_accuracy)
    meta = {
        "arch": ARCH_NAME,
        "feature_version": FEATURE_VERSION,
        "labels": labels,
        "silence_label": silence_label,
        "sample_rate": extractor.cfg.sample_rate,
        "n_mels": extractor.cfg.n_mels,
        "n_frames": extractor.cfg.n_frames,
        "input_shape": [1, 1, extractor.cfg.n_mels, extractor.cfg.n_frames],
        "input_name": "logmel",
        "output_name": "logits",
        "parameter_count": count,
        "val_accuracy": final_acc,
        "val_loss": best_loss,
        "best_epoch": best_epoch,
        "epochs_requested": options.epochs,
        "batch_size": options.batch_size,
        "learning_rate": options.learning_rate,
        "seed": options.seed,
        "sources": [
            {
                "name": source.name,
                "root": str(source.root),
                "clips": sum(1 for _, _, index in [*train_items, *val_items] if index == source_index),
                "repeat": source.repeat,
            }
            for source_index, source in enumerate(sources)
        ],
        "source_accuracy": source_accuracy,
        "init_from": str(options.init_from) if options.init_from is not None else None,
        "base_accuracy": base_accuracy,
        "history": history,
        "created": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    (out_dir / paths.META_FILENAME).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    model.to("cpu")
    model.eval()
    export_ok = True
    try:
        from kws.export import export_onnx

        export_log = export_onnx(out_dir, audio_root=sources[0].root, make_int8=options.make_int8)
    except Exception as exc:
        export_ok = False
        export_log = f"ONNX 내보내기에 실패했습니다.\n{exc}"
    return TrainResult(
        model_dir=out_dir,
        val_accuracy=final_acc,
        val_loss=best_loss,
        best_epoch=best_epoch,
        parameter_count=count,
        history=history,
        report=report,
        export_log=export_log,
        export_ok=export_ok,
        stopped=user_stopped,
        source_accuracy=source_accuracy,
        base_accuracy=base_accuracy,
    )


def _as_sources(audio_root: Path | Sequence[DataSource]) -> list[DataSource]:
    if isinstance(audio_root, (str, Path)):
        return [DataSource(Path(audio_root))]
    sources = [DataSource(Path(source.root), source.name, source.repeat) for source in audio_root]
    if not sources:
        raise ValueError("학습 데이터를 하나 이상 고르세요.")
    return sources


def _collect_sources(sources: list[DataSource], labels: list[str]) -> dict[str, list[tuple[Path, int]]]:
    found: dict[str, list[tuple[Path, int]]] = {label: [] for label in labels}
    for source_index, source in enumerate(sources):
        for label in labels:
            folder = source.root / label
            if folder.is_dir():
                found[label].extend((path, source_index) for path in sorted(folder.glob("*.wav")) if path.is_file())
    return found


def _split_items(
    files: dict[str, list[tuple[Path, int]]],
    labels: list[str],
    val_ratio: float,
    seed: int,
    min_clips: int,
) -> tuple[list[tuple[Path, int, int]], list[tuple[Path, int, int]]]:
    """클래스와 출처마다 따로 나눠서, 출처별 검증 정확도를 볼 수 있게 한다."""
    rng = random.Random(seed)
    train: list[tuple[Path, int, int]] = []
    val: list[tuple[Path, int, int]] = []
    short: list[str] = []
    for index, label in enumerate(labels):
        entries = list(files.get(label, []))
        if len(entries) < min_clips:
            short.append(f"{label} {len(entries)}개")
            continue
        label_train: list[tuple[Path, int, int]] = []
        label_val: list[tuple[Path, int, int]] = []
        for source_index in sorted({source for _, source in entries}):
            paths = [path for path, source in entries if source == source_index]
            rng.shuffle(paths)
            n_val = 0
            if len(paths) >= 3:
                n_val = max(1, min(int(round(len(paths) * val_ratio)), len(paths) - 2))
            label_val.extend((path, index, source_index) for path in paths[:n_val])
            label_train.extend((path, index, source_index) for path in paths[n_val:])
        if not label_val:
            label_val.append(label_train.pop())
        train.extend(label_train)
        val.extend(label_val)
    if short:
        detail = ", ".join(short)
        raise ValueError(f"클래스마다 최소 {min_clips}개의 녹음이 필요합니다. 부족한 클래스: {detail}")
    return train, val


def _load_base(model_dir: Path, labels: list[str]) -> dict:
    import torch

    model_dir = Path(model_dir)
    meta_path = model_dir / paths.META_FILENAME
    checkpoint = model_dir / paths.CHECKPOINT_FILENAME
    if not meta_path.is_file() or not checkpoint.is_file():
        raise FileNotFoundError(f"추가 학습에는 meta.json과 model.pt가 필요합니다: {model_dir}")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if [str(label) for label in meta.get("labels", [])] != list(labels):
        raise ValueError(
            "기존 결과와 명령 구성이 달라 추가 학습할 수 없습니다. 처음부터 학습하세요.\n"
            f"기존: {', '.join(meta.get('labels', []))}\n지금: {', '.join(labels)}"
        )
    if meta.get("arch") != ARCH_NAME or meta.get("feature_version") != FEATURE_VERSION:
        raise ValueError("기존 결과의 모델 구조나 특징 버전이 달라 추가 학습할 수 없습니다.")
    try:
        return torch.load(checkpoint, map_location="cpu", weights_only=True)
    except TypeError:
        return torch.load(checkpoint, map_location="cpu")


def _accuracy_by_source(
    truth: np.ndarray, predicted: np.ndarray, sources: np.ndarray, names: list[str]
) -> dict[str, float]:
    found: dict[str, float] = {}
    for source_index, name in enumerate(names):
        mask = sources == source_index
        if mask.any():
            found[name] = float(np.mean(truth[mask] == predicted[mask]))
    return found


def _format_accuracy(overall: float, by_source: dict[str, float]) -> str:
    text = f"{overall * 100:.1f}%"
    if len(by_source) > 1 or (by_source and next(iter(by_source)) != "녹음"):
        text += " (" + ", ".join(f"{name} {value * 100:.1f}%" for name, value in by_source.items()) + ")"
    return text


def _load_item(item: tuple[Path, int, int]) -> tuple[np.ndarray, int]:
    path, index = item[0], item[1]
    try:
        wav = load_model_wav(path)
    except Exception as exc:
        raise RuntimeError(f"오디오를 읽지 못했습니다: {path}") from exc
    return wav, index


def _evaluate(model, features: np.ndarray, targets: np.ndarray, device):
    import torch
    from torch import nn

    model.eval()
    criterion = nn.CrossEntropyLoss()
    truths: list[np.ndarray] = []
    predictions: list[np.ndarray] = []
    loss_sum = 0.0
    with torch.no_grad():
        for start in range(0, len(features), 16):
            batch_x = torch.from_numpy(np.ascontiguousarray(features[start : start + 16])).to(device)
            batch_y = torch.from_numpy(targets[start : start + 16].astype(np.int64)).to(device)
            logits = model(batch_x)
            loss_sum += float(criterion(logits, batch_y)) * len(batch_y)
            predictions.append(logits.argmax(dim=1).cpu().numpy())
            truths.append(batch_y.cpu().numpy())
    truth = np.concatenate(truths) if truths else np.zeros(0, dtype=np.int64)
    predicted = np.concatenate(predictions) if predictions else np.zeros(0, dtype=np.int64)
    loss = loss_sum / max(1, len(truth))
    accuracy = float(np.mean(truth == predicted)) if len(truth) else 0.0
    return loss, accuracy, truth, predicted


def _classification_report(labels: list[str], truth: np.ndarray, predicted: np.ndarray) -> str:
    lines = ["클래스별 검증 결과"]
    for index, name in enumerate(labels):
        mask = truth == index
        total = int(mask.sum())
        correct = int(np.sum(predicted[mask] == index)) if total else 0
        lines.append(f"  {name}: {correct}/{total}")
    mistakes = Counter(
        (labels[int(actual)], labels[int(guess)])
        for actual, guess in zip(truth, predicted)
        if int(actual) != int(guess)
    )
    if not mistakes:
        lines.append("검증 샘플은 모두 맞았습니다.")
    else:
        lines.append("잘못 분류된 검증 샘플")
        for (actual, guess), count in mistakes.most_common():
            lines.append(f"  {actual} -> {guess}: {count}")
    return "\n".join(lines)


def main() -> int:
    import argparse
    import sys

    from kws import practice
    from kws.project import Project, validate_model_name

    parser = argparse.ArgumentParser(
        description="합성 음과 내 녹음으로 모델을 학습하고 ONNX로 저장합니다. 합성 음이 있으면 기본으로 함께 씁니다."
    )
    parser.add_argument("--epochs", type=int, help="학습 에폭. 생략하면 저장된 값(추가 학습은 15).")
    parser.add_argument("--batch", type=int, help="배치 크기. 생략하면 저장된 값을 씁니다.")
    parser.add_argument("--lr", type=float, help="학습률. 생략하면 저장된 값(추가 학습은 0.0005).")
    parser.add_argument("--no-int8", action="store_true", help="INT8 ONNX는 만들지 않습니다.")
    parser.add_argument("--no-synth", action="store_true", help="data/synth/train 합성 음을 쓰지 않습니다.")
    parser.add_argument("--no-recordings", action="store_true", help="data/audio 내 녹음을 쓰지 않습니다.")
    parser.add_argument("--repeat", type=int, default=RECORDING_REPEAT, help="내 녹음을 한 에폭에 몇 번 쓸지")
    parser.add_argument("--finetune", type=Path, help="이 학습 결과 폴더에서 이어서 학습합니다.")
    parser.add_argument("--out", help="저장할 models 아래 폴더 이름. 기본은 latest, 추가 학습은 speaker.")
    args = parser.parse_args()
    project = Project()
    finetune = args.finetune is not None
    default_epochs, default_lr = (FINETUNE_EPOCHS, FINETUNE_LR) if finetune else (project.epochs, project.learning_rate)
    options = TrainOptions(
        epochs=default_epochs if args.epochs is None else args.epochs,
        batch_size=project.batch_size if args.batch is None else args.batch,
        learning_rate=default_lr if args.lr is None else args.lr,
        patience=15,
        make_int8=not args.no_int8,
        init_from=args.finetune,
    )
    try:
        name = validate_model_name(args.out or ("speaker" if finetune else "latest"))
        use_synth = not args.no_synth and practice.available()
        sources = practice.training_sources(project.audio, use_synth, not args.no_recordings, args.repeat)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1

    def on_event(event: dict) -> None:
        text = event.get("text")
        if text:
            print(text, flush=True)

    print("학습 데이터: " + ", ".join(source.name for source in sources), flush=True)
    try:
        result = train_project(
            sources,
            project.labels(),
            project.root / "models" / name,
            options,
            on_event=on_event,
        )
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 1
    print(result.report)
    print(result.export_log)
    if result.export_ok:
        from kws.evaluate import after_training_check

        print(after_training_check(result.model_dir, project.root, project.threshold))
    print(f"저장 위치: {result.model_dir}")
    return 0 if result.export_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
