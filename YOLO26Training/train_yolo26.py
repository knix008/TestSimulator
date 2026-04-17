from pathlib import Path
from ultralytics import YOLO

def validate_segmentation_labels(labels_dir: Path) -> None:
    if not labels_dir.exists():
        raise FileNotFoundError(f"Labels directory not found: {labels_dir.resolve()}")

    label_files = sorted(labels_dir.glob("*.txt"))
    if not label_files:
        raise FileNotFoundError(f"No label files found in: {labels_dir.resolve()}")

    # YOLO segmentation format: class x1 y1 x2 y2 x3 y3 ... (>= 7 columns)
    for label_file in label_files[:20]:
        text = label_file.read_text(encoding="utf-8").strip()
        if not text:
            continue

        for line in text.splitlines():
            parts = line.split()
            if len(parts) < 7:
                raise ValueError(
                    "Current labels appear to be detection format, not segmentation format. "
                    f"Invalid line in {label_file}: '{line}'"
                )

def main():
    data_yaml = Path("yolo_data.yaml")
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml.resolve()}")

    # segmentation 학습 전에 라벨 포맷을 확인
    validate_segmentation_labels(Path("yolo_dataset/labels/train"))

    # segmentation 모델 사용
    model = YOLO("yolo26-seg.yaml")

    # 학습
    results = model.train(
        data=str(data_yaml),
        epochs=50,
        imgsz=640,
        batch=8,          # CPU 환경에서 메모리/속도 균형
        device="cpu",     # 현재 CUDA 비활성 환경
        workers=4,
        patience=20,      # 개선 없으면 조기 종료
        amp=False,        # CPU에서는 mixed precision 비활성
        project="yolo26_runs",
        name="ct_brain_seg_exp",
        exist_ok=True
    )

    # 학습 완료 후 best.pt를 ONNX로 export
    save_dir = Path(getattr(results, "save_dir", "runs/segment/yolo26_runs/ct_brain_seg_exp"))
    best_pt = save_dir / "weights" / "best.pt"
    if not best_pt.exists():
        raise FileNotFoundError(f"Trained weight not found: {best_pt}")

    export_model = YOLO(str(best_pt))
    export_path = export_model.export(format="onnx", imgsz=640, dynamic=True, simplify=True)
    print(f"ONNX export completed: {export_path}")

if __name__ == '__main__':
    main()
