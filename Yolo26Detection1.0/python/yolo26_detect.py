"""
YOLO26 이미지/동영상 검출. weights는 로컬 models/ 폴더에 없으면 Ultralytics 릴리스에서 다운로드합니다.
"""
from __future__ import annotations

import argparse
from pathlib import Path

# Ultralytics 공개 자산 (Detect 계열)
_ASSET_BASE = "https://github.com/ultralytics/assets/releases/download/v8.4.0"
_DETECT_WEIGHTS = {
    "yolo26n.pt",
    "yolo26s.pt",
    "yolo26m.pt",
    "yolo26l.pt",
    "yolo26x.pt",
}

_VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".wmv", ".flv"}


def _normalize_model_name(name: str) -> str:
    n = name.strip()
    if not n.endswith(".pt"):
        n = f"{n}.pt"
    return n


def resolve_weights_path(model_name: str, models_dir: Path) -> Path:
    """models_dir 아래에 .pt 파일 경로를 반환합니다 (다운로드는 별도)."""
    name = _normalize_model_name(model_name)
    if name not in _DETECT_WEIGHTS:
        known = ", ".join(sorted(_DETECT_WEIGHTS))
        raise SystemExit(f"지원하지 않는 모델입니다: {name}\n사용 가능: {known}")
    return models_dir / name


def download_weights(model_name: str, models_dir: Path, *, quiet: bool = False) -> Path:
    """로컬에 없으면 GitHub에서 weights를 받아 models_dir에 저장합니다."""
    import urllib.request

    path = resolve_weights_path(model_name, models_dir)
    if path.exists():
        if not quiet:
            print(f"이미 존재: {path.resolve()}")
        return path

    models_dir.mkdir(parents=True, exist_ok=True)
    filename = path.name
    url = f"{_ASSET_BASE}/{filename}"
    if not quiet:
        print(f"다운로드 중: {url}")
        print(f"저장 위치: {path.resolve()}")
        print("(용량이 크면 시간이 걸릴 수 있습니다.)")

    urllib.request.urlretrieve(url, path)
    if not quiet:
        print(f"완료: {path.resolve()}")
    return path


def _is_video_source(source: Path) -> bool:
    return source.suffix.lower() in _VIDEO_EXT


def run_predict(
    weights: Path,
    source: Path,
    *,
    conf: float,
    project: Path,
    name: str,
    end2end: bool,
) -> Path:
    from ultralytics import YOLO

    if not source.exists():
        raise SystemExit(f"소스를 찾을 수 없습니다: {source}")

    model = YOLO(str(weights))
    stream = _is_video_source(source)
    kwargs = dict(
        source=str(source),
        conf=conf,
        save=True,
        project=str(project),
        name=name,
        exist_ok=True,
        end2end=end2end,
    )
    if stream:
        kwargs["stream"] = True

    results = model.predict(**kwargs)
    if stream:
        for _ in results:
            pass
    else:
        _ = results

    save_dir = project / name
    print(f"결과 저장: {save_dir.resolve()}")
    return save_dir


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    default_models = root / "models"

    p = argparse.ArgumentParser(description="YOLO26 검출 (weights 로컬 다운로드 후 사용)")
    p.add_argument(
        "--models-dir",
        type=Path,
        default=default_models,
        help="weights 저장 디렉터리 (기본: 프로젝트/models)",
    )
    p.add_argument(
        "--model",
        default="yolo26n.pt",
        help="모델 파일명 또는 베이스명 (예: yolo26n, yolo26n.pt)",
    )
    p.add_argument(
        "--download-only",
        action="store_true",
        help="weights만 받고 종료",
    )
    p.add_argument(
        "--source",
        type=Path,
        help="이미지 또는 동영상 경로",
    )
    p.add_argument(
        "--mode",
        choices=("auto", "image", "video"),
        default="auto",
        help="auto: 확장자로 판별",
    )
    p.add_argument("--conf", type=float, default=0.25, help="신뢰도 임계값")
    p.add_argument(
        "--project",
        type=Path,
        default=root / "runs" / "detect",
        help="실행 결과 상위 폴더",
    )
    p.add_argument("--name", default="predict", help="실행 하위 폴더 이름")
    p.add_argument(
        "--no-end2end",
        action="store_true",
        help="one-to-many 헤드 사용 (NMS 후처리 필요, 정확도 약간 유리할 수 있음)",
    )

    args = p.parse_args()
    models_dir = args.models_dir.resolve()
    weights = download_weights(args.model, models_dir)

    if args.download_only:
        return

    if not args.source:
        p.error("검출하려면 --source 경로가 필요합니다 (--download-only 가 아닐 때)")

    source = args.source.resolve()
    if args.mode == "image" and _is_video_source(source):
        raise SystemExit("--mode image 인데 동영상 확장자입니다.")
    if args.mode == "video" and not _is_video_source(source):
        raise SystemExit("--mode video 인데 동영상 확장자가 아닙니다.")

    args.project.mkdir(parents=True, exist_ok=True)
    run_predict(
        weights,
        source,
        conf=args.conf,
        project=args.project,
        name=args.name,
        end2end=not args.no_end2end,
    )


if __name__ == "__main__":
    main()
