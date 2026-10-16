"""폴더의 WAV를 한꺼번에 판정해 명령별 인식률, 놓침, 오인식, 오수락을 정리한다.

정답은 파일이 들어 있는 폴더 이름으로 정한다. 명령 이름 폴더는 그 명령,
무음·다른말·소음 폴더는 거절해야 하는 소리다. 합성 기본 음원처럼 폴더가 없으면
"출근_r+4.wav"처럼 파일 이름 앞부분을 본다.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from kws.infer import REJECT_LABEL, Decision, command_probs, decide

REJECT_FOLDERS = ("다른말", "소음")
OUTCOMES = ("정답", "놓침", "오인식", "오수락")
SWEEP = tuple(round(0.40 + 0.05 * step, 2) for step in range(12))


@dataclass
class EvalItem:
    path: Path
    expected: str
    probs: np.ndarray


@dataclass
class Judged:
    item: EvalItem
    decision: Decision
    outcome: str


@dataclass
class Summary:
    threshold: float
    commands: list[str]
    silence_label: str
    total: int = 0
    correct: int = 0
    command_total: int = 0
    command_hits: int = 0
    missed: int = 0
    confused: int = 0
    reject_total: int = 0
    false_accepts: int = 0
    per_command: dict[str, list[int]] = field(default_factory=dict)
    confusion: dict[tuple[str, str], int] = field(default_factory=dict)

    @property
    def hit_rate(self) -> float:
        return self.command_hits / self.command_total if self.command_total else 0.0

    @property
    def false_accept_rate(self) -> float:
        return self.false_accepts / self.reject_total if self.reject_total else 0.0


def expected_label(path: Path, root: Path, labels: list[str], silence_label: str) -> str | None:
    try:
        folders = [root.name, *path.relative_to(root).parts[:-1]]
    except ValueError:
        folders = [path.parent.name]
    for folder in reversed(folders):
        if folder in labels:
            return folder
        if folder in REJECT_FOLDERS:
            return silence_label
    prefix = path.stem.split("_")[0]
    if prefix in labels:
        return prefix
    return None


def collect(root: Path, labels: list[str], silence_label: str) -> tuple[list[tuple[Path, str]], int]:
    root = Path(root)
    if not root.is_dir():
        raise FileNotFoundError(f"평가 폴더가 없습니다: {root}")
    found: list[tuple[Path, str]] = []
    skipped = 0
    for path in sorted(root.rglob("*.wav")):
        expected = expected_label(path, root, labels, silence_label)
        if expected is None:
            skipped += 1
        else:
            found.append((path, expected))
    return found, skipped


def evaluate_folder(
    classifier,
    root: Path,
    labels: list[str],
    silence_label: str,
    on_item: Callable[[EvalItem], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> tuple[list[EvalItem], int]:
    from kws.audio import load_model_wav

    found, skipped = collect(root, labels, silence_label)
    if not found:
        raise FileNotFoundError(
            f"{root} 아래에서 정답을 알 수 있는 WAV가 없습니다. "
            f"명령 이름({', '.join(labels)}) 또는 다른말·소음 폴더에 넣으세요."
        )
    items: list[EvalItem] = []
    for path, expected in found:
        if should_stop is not None and should_stop():
            break
        item = EvalItem(path, expected, command_probs(classifier, load_model_wav(path)))
        items.append(item)
        if on_item is not None:
            on_item(item)
    return items, skipped


def outcome(expected: str, decision: Decision, silence_label: str) -> str:
    if expected == silence_label:
        return "오수락" if decision.accepted else "정답"
    if not decision.accepted:
        return "놓침"
    return "정답" if decision.label == expected else "오인식"


def judge(item: EvalItem, labels: list[str], silence_label: str, threshold: float) -> Judged:
    decision = decide(item.probs, labels, silence_label, threshold)
    return Judged(item, decision, outcome(item.expected, decision, silence_label))


def summarize(items: list[EvalItem], labels: list[str], silence_label: str, threshold: float) -> Summary:
    commands = [label for label in labels if label != silence_label]
    summary = Summary(threshold, commands, silence_label)
    summary.per_command = {command: [0, 0] for command in commands}
    for item in items:
        judged = judge(item, labels, silence_label, threshold)
        summary.total += 1
        summary.correct += int(judged.outcome == "정답")
        key = (item.expected, judged.decision.label)
        summary.confusion[key] = summary.confusion.get(key, 0) + 1
        if item.expected == silence_label:
            summary.reject_total += 1
            summary.false_accepts += int(judged.outcome == "오수락")
            continue
        summary.command_total += 1
        counts = summary.per_command.setdefault(item.expected, [0, 0])
        counts[1] += 1
        if judged.outcome == "정답":
            summary.command_hits += 1
            counts[0] += 1
        elif judged.outcome == "놓침":
            summary.missed += 1
        else:
            summary.confused += 1
    return summary


def threshold_sweep(
    items: list[EvalItem], labels: list[str], silence_label: str, thresholds: tuple[float, ...] = SWEEP
) -> list[tuple[float, float, float]]:
    rows = []
    for threshold in thresholds:
        summary = summarize(items, labels, silence_label, threshold)
        rows.append((threshold, summary.hit_rate, summary.false_accept_rate))
    return rows


def recommend_threshold(sweep: list[tuple[float, float, float]]) -> float | None:
    """오수락이 가장 적은 임계값들 가운데 명령 인식률이 가장 높은 값."""
    if not sweep:
        return None
    lowest = min(row[2] for row in sweep)
    candidates = [row for row in sweep if row[2] == lowest]
    return max(candidates, key=lambda row: (row[1], -row[0]))[0]


def _percent(part: int, whole: int) -> str:
    return f"{100.0 * part / whole:.0f}% ({part}/{whole})" if whole else "-"


def report(items: list[EvalItem], labels: list[str], silence_label: str, threshold: float, skipped: int = 0) -> str:
    summary = summarize(items, labels, silence_label, threshold)
    lines = [f"임계값 {threshold:.2f} · 파일 {summary.total}개" + (f" · 정답 폴더를 몰라 건너뜀 {skipped}개" if skipped else "")]
    lines.append(f"전체 정답률 {_percent(summary.correct, summary.total)}")
    lines.append(
        f"명령 인식률 {_percent(summary.command_hits, summary.command_total)}"
        f" · 놓침 {summary.missed} · 오인식 {summary.confused}"
    )
    lines.append(
        f"거절 대상(무음·다른말·소음) {summary.reject_total}개 중 오수락 {summary.false_accepts}"
        if summary.reject_total
        else "거절 대상(무음·다른말·소음) 음원이 없어 오수락은 확인하지 못했습니다."
    )
    lines.append("")
    lines.append("명령별 인식률")
    for command in summary.commands:
        hits, total = summary.per_command.get(command, [0, 0])
        lines.append(f"  {command}  {_percent(hits, total)}")

    columns = [*summary.commands, REJECT_LABEL]
    rows = [label for label in [*summary.commands, silence_label] if any(summary.confusion.get((label, c), 0) for c in columns)]
    if rows:
        width = max(4, *(len(name) * 2 for name in [*columns, *rows]))
        lines.append("")
        lines.append("혼동표 (행: 정답, 열: 인식 결과)")
        lines.append(" " * width + "".join(name.rjust(width) for name in columns))
        for label in rows:
            cells = "".join(str(summary.confusion.get((label, c), 0)).rjust(width) for c in columns)
            lines.append(label.ljust(width - len(label)) + cells)

    sweep = threshold_sweep(items, labels, silence_label)
    if summary.command_total:
        lines.append("")
        lines.append("임계값별  명령 인식률 / 오수락률")
        for value, hit_rate, fa_rate in sweep:
            mark = "  ← 현재" if abs(value - threshold) < 0.026 else ""
            fa_text = f"{fa_rate * 100:.0f}%" if summary.reject_total else "-"
            lines.append(f"  {value:.2f}    {hit_rate * 100:.0f}% / {fa_text}{mark}")
        if summary.reject_total:
            best = recommend_threshold(sweep)
            lines.append(f"추천 임계값 {best:.2f} (오수락이 가장 적은 값 중 인식률이 가장 높음)")
    return "\n".join(lines)


def write_csv(path: Path, items: list[EvalItem], labels: list[str], silence_label: str, threshold: float) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["파일", "정답", "인식", "결과", "최대 확률", *labels])
        for item in items:
            judged = judge(item, labels, silence_label, threshold)
            writer.writerow(
                [
                    str(item.path),
                    item.expected,
                    judged.decision.label,
                    judged.outcome,
                    f"{judged.decision.top_confidence:.3f}",
                    *(f"{float(value):.3f}" for value in item.probs),
                ]
            )


def after_training_check(model_dir: Path, project_root: Path, threshold: float) -> str:
    """학습에 넣지 않은 합성 평가 음원과 마이크 시험 음성으로 바로 점수를 낸다."""
    from kws import practice
    from kws.infer import ModelBundle

    bundle = ModelBundle(model_dir)
    engines = bundle.engines()
    if not engines:
        return "ONNX나 model.pt가 없어 학습 후 확인을 건너뜁니다."
    classifier = bundle.classifier(engines[0])
    lines = [f"학습에 쓰지 않은 음성으로 확인 (임계값 {threshold:.2f})"]
    checks = (
        ("합성 평가 음원", practice.test_dir()),
        ("마이크 시험 음성 data/eval", Path(project_root) / "data" / "eval"),
    )
    for title, folder in checks:
        if not folder.is_dir() or not any(folder.rglob("*.wav")):
            continue
        try:
            items, _ = evaluate_folder(classifier, folder, bundle.labels, bundle.silence_label)
        except FileNotFoundError:
            continue
        summary = summarize(items, bundle.labels, bundle.silence_label, threshold)
        reject = f" · 오수락 {summary.false_accepts}/{summary.reject_total}" if summary.reject_total else ""
        lines.append(
            f"  {title} {summary.total}개: 명령 인식률 {_percent(summary.command_hits, summary.command_total)}"
            f" · 놓침 {summary.missed} · 오인식 {summary.confused}{reject}"
        )
    if not any(line.startswith("  마이크") for line in lines):
        lines.append("  내 목소리 점수는 평가 탭의 마이크 시험으로 확인하세요. 시험 음성은 다음 학습 뒤에도 자동으로 다시 채점합니다.")
    return "\n".join(lines)


def main() -> int:
    import argparse
    import sys

    from kws import practice
    from kws.infer import ModelBundle
    from kws.project import Project

    parser = argparse.ArgumentParser(description="폴더의 WAV를 한꺼번에 판정해 인식률을 정리합니다.")
    parser.add_argument("folder", nargs="?", type=Path, help="명령 이름 폴더가 들어 있는 평가 폴더. 생략하면 합성 평가 음원.")
    parser.add_argument("--model", type=Path, help="학습 결과 폴더. 생략하면 models/latest.")
    parser.add_argument("--threshold", type=float, help="생략하면 저장된 임계값")
    parser.add_argument("--engine", choices=("onnx", "pytorch"), default="onnx")
    parser.add_argument("--csv", type=Path, help="파일별 결과를 저장할 CSV")
    args = parser.parse_args()
    project = Project()
    folder = args.folder or practice.test_dir()
    model_dir = args.model or project.model_dir
    threshold = project.threshold if args.threshold is None else args.threshold
    try:
        bundle = ModelBundle(model_dir)
        engines = bundle.engines()
        if not engines:
            raise FileNotFoundError("ONNX나 model.pt가 없습니다.")
        engine = args.engine if args.engine in engines else engines[0]
        items, skipped = evaluate_folder(bundle.classifier(engine), folder, bundle.labels, bundle.silence_label)
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 1
    from kws.model import arch_title

    print(f"모델: {model_dir} ({arch_title(bundle.arch)}, {engine})")
    print(f"평가 폴더: {folder}")
    print(report(items, bundle.labels, bundle.silence_label, threshold, skipped))
    wrong = [judge(item, bundle.labels, bundle.silence_label, threshold) for item in items]
    wrong = [entry for entry in wrong if entry.outcome != "정답"]
    if wrong:
        print("\n틀린 파일")
        for entry in wrong:
            print(f"  {entry.outcome}  {entry.item.path}  정답 {entry.item.expected} → {entry.decision.label} ({entry.decision.top_confidence:.0%})")
    if args.csv:
        write_csv(args.csv, items, bundle.labels, bundle.silence_label, threshold)
        print(f"\nCSV: {args.csv}")
    summary = summarize(items, bundle.labels, bundle.silence_label, threshold)
    print(f"TOTAL={summary.total}")
    print(f"CORRECT={summary.correct}")
    print(f"COMMAND_HIT_RATE={summary.hit_rate:.3f}")
    print(f"FALSE_ACCEPTS={summary.false_accepts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
