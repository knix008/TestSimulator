# -*- coding: utf-8 -*-
"""
뇌 CT(또는 MRI) YOLO 세그 학습 파이프라인: 디렉터리 준비 → 학습 → ONNX export → (선택) Python predict.

저장소 루트에 `YOLO11BrainV10.sln`이 있어야 합니다 (이 파일의 상위 디렉터리를 자동 탐색).

  pip install -r requirements-export.txt

  python brain_ct_pipeline.py init
  # data/brain_ct_seg/images/train 등에 이미지·세그 라벨 배치 후:
  python brain_ct_pipeline.py train
  python brain_ct_pipeline.py export
  python brain_ct_pipeline.py predict

한 번에:
  python brain_ct_pipeline.py all

Ultralytics 뇌 종양 공개 세트 받기(검출 박스 → 세그용 사각형 폴리곤 변환):

  python brain_ct_pipeline.py fetch

학습 폴더가 비어 있을 때(연습·스모크 테스트):
  python brain_ct_pipeline.py all --demo-data

학습 생략(이미 best.pt가 있을 때):
  python brain_ct_pipeline.py all --skip-train --weights runs/brain_ct_seg/train/weights/best.pt
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path


TRAIN_IMG_EXT = frozenset({".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"})
DEMO_IMAGE_URL = (
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg"
)
# Ultralytics cfg/datasets/brain-tumor.yaml — detect 라벨; 세그 학습 전 박스→폴리곤 변환
BRAIN_TUMOR_ZIP_URL = (
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor.zip"
)
DEFAULT_RETRIES = 3
PYTORCH_CUDA_INDEX_URL = "https://download.pytorch.org/whl/cu121"
YOLO11_SEG_MODEL_DEFAULT = "yolo11n-seg.pt"
YOLO11_SEG_ONNX_NAME = "brain_ct_yolo11n_seg.onnx"


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for p in [cur, *cur.parents]:
        if (p / "YOLO11BrainV10.sln").is_file():
            return p
    raise FileNotFoundError(
        f"YOLO11BrainV10.sln 을 찾지 못했습니다: {start} 의 상위 폴더를 확인하세요."
    )


def dataset_root(repo: Path) -> Path:
    return repo / "data" / "brain_ct_seg"


def dataset_yaml(repo: Path) -> Path:
    return dataset_root(repo) / "data.yaml"


def runs_train_dir(repo: Path) -> Path:
    return repo / "runs" / "brain_ct_seg" / "train"


def default_train_weights(repo: Path) -> Path:
    return runs_train_dir(repo) / "weights" / "best.pt"


def default_export_onnx(repo: Path) -> Path:
    return repo / "exports" / YOLO11_SEG_ONNX_NAME


def ensure_layout(repo: Path) -> None:
    ds = dataset_root(repo)
    for part in ("images/train", "images/val", "labels/train", "labels/val"):
        (ds / part).mkdir(parents=True, exist_ok=True)
    (repo / "exports").mkdir(parents=True, exist_ok=True)
    (repo / "runs" / "brain_ct_seg").mkdir(parents=True, exist_ok=True)


def write_data_yaml(repo: Path, *, force: bool) -> Path:
    ensure_layout(repo)
    yml = dataset_yaml(repo)
    if yml.is_file() and not force:
        return yml
    root = dataset_root(repo).resolve().as_posix()
    text = (
        "# YOLO segment — brain_ct_pipeline.py init 으로 생성됨. names 는 데이터에 맞게 수정하세요.\n"
        f"path: {root}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
        "  0: negative\n"
        "  1: positive\n"
    )
    yml.write_text(text, encoding="utf-8")
    return yml


def count_train_images(repo: Path) -> int:
    d = dataset_root(repo) / "images" / "train"
    if not d.is_dir():
        return 0
    return sum(1 for f in d.iterdir() if f.is_file() and f.suffix.lower() in TRAIN_IMG_EXT)


DEMO_STEM = "demo_pipeline_sample"


def ensure_demo_dataset(repo: Path) -> None:
    """images/train|val + labels/train|val 에 Ultralytics 뇌 샘플 1장과 더미 세그 폴리곤을 둡니다(스모크 테스트용)."""
    ensure_layout(repo)
    ds = dataset_root(repo)
    img_train = ds / "images" / "train" / f"{DEMO_STEM}.jpg"
    img_val = ds / "images" / "val" / f"{DEMO_STEM}.jpg"
    lbl_train = ds / "labels" / "train" / f"{DEMO_STEM}.txt"
    lbl_val = ds / "labels" / "val" / f"{DEMO_STEM}.txt"

    if not img_train.is_file():
        _download_url_to_file(DEMO_IMAGE_URL, img_train, timeout=120)
    shutil.copy2(img_train, img_val)

    # YOLO seg: class (normalized polygon). Class 1 = positive (demo only, not clinical).
    poly = "1 0.35 0.35 0.65 0.35 0.65 0.65 0.35 0.65\n"
    lbl_train.write_text(poly, encoding="utf-8")
    lbl_val.write_text(poly, encoding="utf-8")

    print(
        f"데모 학습 데이터를 채웠습니다(의미 있는 모델 아님): "
        f"{img_train.name} + 라벨. 본 데이터로 바꾸려면 해당 파일을 지우고 이미지·라벨을 넣으세요."
    )


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _download_url_to_file(url: str, dest: Path, *, timeout: int, retries: int = DEFAULT_RETRIES) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YOLO11BrainV10-brain_ct_pipeline/1.0"},
    )
    last_err: Exception | None = None
    for i in range(1, max(1, retries) + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.read())
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
            if i >= retries:
                break
            wait_s = min(2 ** i, 10)
            print(f"다운로드 재시도 {i}/{retries} 실패: {e} -> {wait_s}s 후 재시도")
            time.sleep(wait_s)
    raise RuntimeError(f"다운로드 실패: {url}") from last_err


def _ensure_ultralytics_installed(*, auto_install: bool) -> None:
    if importlib.util.find_spec("ultralytics") is not None:
        return
    if not auto_install:
        raise ModuleNotFoundError(
            "ultralytics 가 설치되지 않았습니다. "
            "pip install -r requirements-export.txt 또는 --auto-install 옵션을 사용하세요."
        )
    print("ultralytics 미설치 감지 -> 자동 설치를 시도합니다.")
    env = os.environ.copy()
    base_pip = [sys.executable, "-m", "pip", "install"]

    # 1) GPU PyTorch 우선 설치 (실패 시 CPU 폴백)
    try:
        print("PyTorch GPU wheel(cu121) 설치 시도…")
        subprocess.run(
            base_pip
            + ["torch", "torchvision", "torchaudio", "--index-url", PYTORCH_CUDA_INDEX_URL],
            check=True,
            env=env,
        )
        print("PyTorch GPU wheel 설치 완료.")
    except subprocess.CalledProcessError:
        print("PyTorch GPU wheel 설치 실패 -> CPU wheel 설치로 폴백합니다.")
        subprocess.run(base_pip + ["torch", "torchvision", "torchaudio"], check=True, env=env)

    # 2) 나머지 패키지 설치
    req = Path(__file__).resolve().parent / "requirements-export.txt"
    if req.is_file():
        subprocess.run(base_pip + ["-r", str(req)], check=True, env=env)
    else:
        subprocess.run(base_pip + ["ultralytics", "onnx", "onnxsim"], check=True, env=env)

    if importlib.util.find_spec("ultralytics") is None:
        raise ModuleNotFoundError("자동 설치 후에도 ultralytics import 에 실패했습니다.")


def _pick_device_or_cpu(user_device: str | None) -> str:
    if user_device:
        return user_device
    try:
        import torch

        if torch.cuda.is_available():
            print("CUDA GPU 감지: 학습 디바이스로 GPU(0) 사용")
            return "0"
    except Exception:  # noqa: BLE001
        # torch import 이 불가하면 Ultralytics 자동 탐지를 그대로 맡기기보다 CPU를 명시해 일관되게 처리
        pass
    print("CUDA GPU 미감지: 학습 디바이스로 CPU 사용")
    return "cpu"


def _det_line_to_seg_line(parts: list[str]) -> str | None:
    """YOLO detect 한 줄(class xc yc w h) → 세그 한 줄(class x1 y1 … 사각형)."""
    if len(parts) != 5:
        return None
    try:
        c = int(float(parts[0]))
        xc, yc, w, h = (float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4]))
    except ValueError:
        return None
    x1 = _clip01(xc - w / 2)
    x2 = _clip01(xc + w / 2)
    y1 = _clip01(yc - h / 2)
    y2 = _clip01(yc + h / 2)
    return (
        f"{c} {x1:.6f} {y1:.6f} {x2:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x1:.6f} {y2:.6f}"
    )


def _convert_label_text_to_segmentation(src_text: str) -> str:
    out: list[str] = []
    for line in src_text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        seg = _det_line_to_seg_line(parts)
        out.append(seg if seg is not None else line)
    return "\n".join(out) + ("\n" if out else "")


def _find_brain_tumor_dataset_root(unpacked: Path) -> Path:
    for train_img_dir in unpacked.rglob("images/train"):
        if not train_img_dir.is_dir():
            continue
        root = train_img_dir.parent.parent
        if (root / "labels" / "train").is_dir():
            return root.resolve()
    raise FileNotFoundError(
        f"ZIP 내부에서 images/train 과 labels/train 을 찾지 못했습니다: {unpacked}"
    )


def _clear_dataset_media(ds: Path) -> None:
    for split in ("train", "val"):
        for kind in ("images", "labels"):
            d = ds / kind / split
            if not d.is_dir():
                continue
            for f in d.iterdir():
                if f.is_file():
                    f.unlink()


def cmd_fetch(repo: Path, *, force: bool) -> int:
    """Ultralytics brain-tumor.zip 을 받아 data/brain_ct_seg 에 복사(박스 라벨 → 사각형 세그)."""
    if not force and count_train_images(repo) > 0:
        print(
            "data/brain_ct_seg/images/train 에 이미 이미지가 있습니다. "
            "다시 받으려면: python brain_ct_pipeline.py fetch --force",
            file=sys.stderr,
        )
        return 1

    ensure_layout(repo)
    write_data_yaml(repo, force=False)
    ds = dataset_root(repo)
    if force:
        _clear_dataset_media(ds)

    print("Ultralytics brain-tumor.zip 다운로드 중… (~4.2 MB, 데이터셋 AGPL-3.0)")
    with tempfile.TemporaryDirectory() as td:
        zpath = Path(td) / "brain-tumor.zip"
        _download_url_to_file(BRAIN_TUMOR_ZIP_URL, zpath, timeout=600)
        unpack = Path(td) / "unpacked"
        unpack.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zpath, "r") as zf:
            zf.extractall(unpack)
        src_root = _find_brain_tumor_dataset_root(unpack)

        n_img = 0
        n_lbl_nonempty = 0
        for split in ("train", "val"):
            simages = src_root / "images" / split
            slabels = src_root / "labels" / split
            if not simages.is_dir():
                continue
            dimages = ds / "images" / split
            dlabels = ds / "labels" / split
            for img in sorted(simages.iterdir()):
                if not img.is_file() or img.suffix.lower() not in TRAIN_IMG_EXT:
                    continue
                shutil.copy2(img, dimages / img.name)
                n_img += 1
                stem = img.stem
                sf = slabels / f"{stem}.txt"
                df = dlabels / f"{stem}.txt"
                if sf.is_file():
                    raw = sf.read_text(encoding="utf-8", errors="replace")
                    conv = _convert_label_text_to_segmentation(raw)
                    df.write_text(conv, encoding="utf-8")
                    if conv.strip():
                        n_lbl_nonempty += 1
                else:
                    df.write_text("", encoding="utf-8")

    print(
        f"완료: 이미지 {n_img}장을 data/brain_ct_seg 로 복사했습니다. "
        f"비어 있지 않은 세그 라벨 {n_lbl_nonempty}개(박스에서 변환)."
    )
    print(
        "원본은 검출(bounding box)입니다. 세그 과제로는 사각형 근사만 됩니다. "
        "임상·정밀 마스크는 별도 세그 라벨이 필요합니다."
    )
    print("다음: python brain_ct_pipeline.py train   또는   python brain_ct_pipeline.py all")
    return 0


def cmd_init(repo: Path, *, force: bool) -> int:
    write_data_yaml(repo, force=force)
    print(f"Dataset: {dataset_root(repo)}")
    print(f"data.yaml: {dataset_yaml(repo)}")
    print("images/train, images/val 에 슬라이스를 넣고 labels/train|val 에 YOLO 세그 .txt 를 맞춰 두세요.")
    return 0


def cmd_train(
    repo: Path,
    *,
    epochs: int,
    batch: int,
    imgsz: int,
    model: str,
    device: str | None,
    demo_data: bool,
    auto_fetch: bool,
    auto_install: bool,
) -> int:
    yml = dataset_yaml(repo)
    if not yml.is_file():
        print("data.yaml 이 없습니다. 먼저: python brain_ct_pipeline.py init", file=sys.stderr)
        return 1
    train_dir = (dataset_root(repo) / "images" / "train").resolve()
    if count_train_images(repo) < 1:
        if demo_data:
            ensure_demo_dataset(repo)
        elif auto_fetch:
            print("학습 이미지가 없어 공개 데이터를 자동으로 다운로드(fetch)합니다.")
            fr = cmd_fetch(repo, force=False)
            if fr != 0:
                print("자동 fetch 가 실패했습니다. --demo-data 또는 fetch --force 를 시도하세요.", file=sys.stderr)
                return fr
        else:
            print(
                "학습 이미지가 없습니다.\n"
                f"  기대 경로(절대): {train_dir}\n"
                f"  인식 확장자: {', '.join(sorted(TRAIN_IMG_EXT))}\n"
                "  공개 데이터 받기: python brain_ct_pipeline.py fetch\n"
                "  스모크 테스트만: python brain_ct_pipeline.py all --demo-data\n"
                "  (또는 train --demo-data)",
                file=sys.stderr,
            )
            return 1
    if count_train_images(repo) < 1:
        print("데모 데이터 설치 후에도 이미지가 없습니다.", file=sys.stderr)
        return 1

    _ensure_ultralytics_installed(auto_install=auto_install)
    from ultralytics import YOLO

    yolo11_model = YOLO(model)
    kw: dict = {
        "task": "segment",
        "data": str(yml),
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "project": str(repo / "runs" / "brain_ct_seg"),
        "name": "train",
        "exist_ok": True,
    }
    kw["device"] = _pick_device_or_cpu(device)
    yolo11_model.train(**kw)
    best = default_train_weights(repo)
    print(f"학습 완료. 가중치: {best}")
    return 0 if best.is_file() else 1


def cmd_export(repo: Path, *, weights: Path | None, imgsz: int, auto_install: bool) -> int:
    w = (weights or default_train_weights(repo)).expanduser().resolve()
    if not w.is_file():
        print(f"가중치 파일이 없습니다: {w}", file=sys.stderr)
        return 1

    _ensure_ultralytics_installed(auto_install=auto_install)
    from ultralytics import YOLO

    out_onnx = default_export_onnx(repo)
    out_onnx.parent.mkdir(parents=True, exist_ok=True)
    yolo11_model = YOLO(str(w))
    exported = yolo11_model.export(format="onnx", imgsz=imgsz, simplify=True)
    ep = Path(exported[0] if isinstance(exported, (list, tuple)) else exported)
    shutil.copy2(ep, out_onnx)
    print(f"ONNX 저장: {out_onnx}")
    return 0


def _ensure_demo_image(repo: Path) -> Path:
    dest = dataset_root(repo) / "_demo_brain_sample.jpg"
    if dest.is_file():
        return dest
    _download_url_to_file(DEMO_IMAGE_URL, dest, timeout=120)
    return dest


def cmd_predict(
    repo: Path,
    *,
    weights: Path | None,
    source: Path | None,
    conf: float,
    imgsz: int,
    auto_install: bool,
) -> int:
    w: Path | None = weights.expanduser().resolve() if weights else None
    if w is None or not w.is_file():
        cand = default_train_weights(repo)
        w = cand if cand.is_file() else default_export_onnx(repo)
    if not w.is_file():
        print("predict 에 쓸 .pt / .onnx 가 없습니다. train·export 를 먼저 실행하거나 --weights 로 지정하세요.", file=sys.stderr)
        return 1

    src = source.expanduser().resolve() if source else _ensure_demo_image(repo)
    if not src.is_file():
        print(f"입력 이미지가 없습니다: {src}", file=sys.stderr)
        return 1

    _ensure_ultralytics_installed(auto_install=auto_install)
    from ultralytics import YOLO

    model = YOLO(str(w))
    pred_root = repo / "runs" / "brain_ct_seg"
    pred_name = "predict_demo"
    model.predict(
        source=str(src),
        conf=conf,
        imgsz=imgsz,
        save=True,
        project=str(pred_root),
        name=pred_name,
        exist_ok=True,
        verbose=False,
    )
    vis = pred_root / pred_name / src.name
    print(f"시각화 저장: {vis}")
    return 0 if vis.is_file() else 0


def cmd_all(
    repo: Path,
    *,
    skip_train: bool,
    weights: Path | None,
    epochs: int,
    batch: int,
    imgsz: int,
    model: str,
    device: str | None,
    conf: float,
    demo_data: bool,
    auto_fetch: bool,
    auto_install: bool,
) -> int:
    r = cmd_init(repo, force=False)
    if r != 0:
        return r
    if skip_train:
        if weights is None and not default_train_weights(repo).is_file():
            print("--skip-train 인데 best.pt 가 없습니다. --weights 로 .pt 를 지정하세요.", file=sys.stderr)
            return 1
    else:
        r = cmd_train(
            repo,
            epochs=epochs,
            batch=batch,
            imgsz=imgsz,
            model=model,
            device=device,
            demo_data=demo_data,
            auto_fetch=auto_fetch,
            auto_install=auto_install,
        )
        if r != 0:
            return r
    export_weights = weights.expanduser().resolve() if (skip_train and weights) else None
    r = cmd_export(repo, weights=export_weights, imgsz=imgsz, auto_install=auto_install)
    if r != 0:
        return r
    return cmd_predict(
        repo,
        weights=default_export_onnx(repo),
        source=None,
        conf=conf,
        imgsz=imgsz,
        auto_install=auto_install,
    )


def _repo_from_args(ns: argparse.Namespace) -> Path:
    if ns.repo:
        return Path(ns.repo).expanduser().resolve()
    return find_repo_root(Path(__file__).resolve().parent)


def main() -> int:
    p = argparse.ArgumentParser(description="Brain CT YOLO11 segment: init, train, export, predict.")
    p.add_argument(
        "--repo",
        type=Path,
        default=None,
        help="저장소 루트 (YOLO11BrainV10.sln 이 있는 폴더). 기본: 이 스크립트 기준 자동 탐색.",
    )
    sub = p.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="data/brain_ct_seg 레이아웃 및 data.yaml 생성")
    p_init.add_argument("--force", action="store_true", help="기존 data.yaml 덮어쓰기")

    p_fetch = sub.add_parser(
        "fetch",
        help="Ultralytics brain-tumor.zip 다운로드 후 data/brain_ct_seg 에 복사(박스→세그 사각형)",
    )
    p_fetch.add_argument(
        "--force",
        action="store_true",
        help="기존 images/labels/train|val 파일을 비우고 다시 받기",
    )

    p_train = sub.add_parser("train", help="세그 학습 (images/train 에 데이터 필요)")
    p_train.add_argument("--epochs", type=int, default=100)
    p_train.add_argument("--batch", type=int, default=8)
    p_train.add_argument("--imgsz", type=int, default=640)
    p_train.add_argument("--model", default=YOLO11_SEG_MODEL_DEFAULT)
    p_train.add_argument("--device", default=None, help="예: 0, cpu (미지정 시 GPU 우선, 없으면 CPU)")
    p_train.add_argument(
        "--demo-data",
        action="store_true",
        help="images/train 이 비어 있을 때만, 샘플 JPG+더미 세그 라벨을 채워 스모크 학습",
    )
    p_train.add_argument(
        "--auto-fetch",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="학습 이미지가 비어 있으면 자동으로 fetch 수행 (기본: 사용)",
    )
    p_train.add_argument(
        "--auto-install",
        action="store_true",
        help="ultralytics 미설치 시 pip 자동 설치",
    )

    p_exp = sub.add_parser("export", help="best.pt -> exports/brain_ct_yolo11n_seg.onnx")
    p_exp.add_argument("--weights", type=Path, default=None, help="기본: runs/brain_ct_seg/train/weights/best.pt")
    p_exp.add_argument("--imgsz", type=int, default=640)
    p_exp.add_argument(
        "--auto-install",
        action="store_true",
        help="ultralytics 미설치 시 pip 자동 설치",
    )

    p_pred = sub.add_parser("predict", help="데모 이미지 또는 --source 로 predict")
    p_pred.add_argument("--weights", type=Path, default=None, help=".pt 또는 .onnx")
    p_pred.add_argument("--source", type=Path, default=None, help="이미지 경로 (없으면 Ultralytics 뇌 샘플 다운로드)")
    p_pred.add_argument("--conf", type=float, default=0.25)
    p_pred.add_argument("--imgsz", type=int, default=640)
    p_pred.add_argument(
        "--auto-install",
        action="store_true",
        help="ultralytics 미설치 시 pip 자동 설치",
    )

    p_all = sub.add_parser("all", help="init 후 train + export + predict")
    p_all.add_argument("--skip-train", action="store_true")
    p_all.add_argument("--weights", type=Path, default=None, help="--skip-train 시 필수에 가깝습니다")
    p_all.add_argument("--epochs", type=int, default=100)
    p_all.add_argument("--batch", type=int, default=8)
    p_all.add_argument("--imgsz", type=int, default=640)
    p_all.add_argument("--model", default=YOLO11_SEG_MODEL_DEFAULT)
    p_all.add_argument("--device", default=None, help="예: 0, cpu (미지정 시 GPU 우선, 없으면 CPU)")
    p_all.add_argument("--conf", type=float, default=0.25)
    p_all.add_argument(
        "--demo-data",
        action="store_true",
        help="학습 이미지가 없을 때 train 과 동일하게 데모 1장+라벨을 넣고 진행",
    )
    p_all.add_argument(
        "--auto-fetch",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="학습 이미지가 비어 있으면 자동으로 fetch 수행 (기본: 사용)",
    )
    p_all.add_argument(
        "--auto-install",
        action="store_true",
        help="ultralytics 미설치 시 pip 자동 설치",
    )

    ns = p.parse_args()
    repo = _repo_from_args(ns)

    try:
        if ns.command == "init":
            return cmd_init(repo, force=ns.force)
        if ns.command == "fetch":
            return cmd_fetch(repo, force=ns.force)
        if ns.command == "train":
            return cmd_train(
                repo,
                epochs=ns.epochs,
                batch=ns.batch,
                imgsz=ns.imgsz,
                model=ns.model,
                device=ns.device,
                demo_data=ns.demo_data,
                auto_fetch=ns.auto_fetch,
                auto_install=ns.auto_install,
            )
        if ns.command == "export":
            return cmd_export(repo, weights=ns.weights, imgsz=ns.imgsz, auto_install=ns.auto_install)
        if ns.command == "predict":
            return cmd_predict(
                repo,
                weights=ns.weights,
                source=ns.source,
                conf=ns.conf,
                imgsz=ns.imgsz,
                auto_install=ns.auto_install,
            )
        if ns.command == "all":
            return cmd_all(
                repo,
                skip_train=ns.skip_train,
                weights=ns.weights,
                epochs=ns.epochs,
                batch=ns.batch,
                imgsz=ns.imgsz,
                model=ns.model,
                device=ns.device,
                conf=ns.conf,
                demo_data=ns.demo_data,
                auto_fetch=ns.auto_fetch,
                auto_install=ns.auto_install,
            )
        return 1
    except ModuleNotFoundError as e:
        print(f"필수 Python 패키지 누락: {e}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as e:
        print(f"자동 설치/명령 실행 실패: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
