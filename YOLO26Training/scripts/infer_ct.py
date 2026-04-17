import argparse
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
MASK_COLORS = [
    (0, 0, 255),    # red
    (0, 255, 0),    # green
    (255, 0, 0),    # blue
    (0, 255, 255),  # yellow
    (255, 0, 255),  # magenta
    (255, 255, 0),  # cyan
]


def get_draw_config(image: np.ndarray) -> tuple[int, float, int]:
    h, w = image.shape[:2]
    ref = max(h, w)
    thickness = max(2, int(round(ref / 320)))
    font_scale = max(0.6, ref / 1400.0)
    padding = max(4, int(round(ref / 220)))
    return thickness, font_scale, padding


def draw_readable_boxes(result, image: np.ndarray) -> np.ndarray:
    """
    Draw high-contrast boxes and label backgrounds for readability.
    """
    out = image.copy()
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return out

    names = result.names if result.names is not None else {}
    thickness, font_scale, padding = get_draw_config(out)
    font = cv2.FONT_HERSHEY_SIMPLEX

    xyxy = boxes.xyxy.cpu().numpy().astype(int)
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.zeros(len(xyxy))
    clss = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else np.zeros(len(xyxy), dtype=int)

    for i in range(len(xyxy)):
        x1, y1, x2, y2 = xyxy[i]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(out.shape[1] - 1, x2), min(out.shape[0] - 1, y2)

        # Bright green box with black border for strong contrast.
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 0, 0), thickness + 2, lineType=cv2.LINE_AA)
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 255, 0), thickness, lineType=cv2.LINE_AA)

        class_id = int(clss[i])
        class_name = str(names.get(class_id, class_id))
        text = f"{class_name} {confs[i]:.2f}"
        (tw, th), baseline = cv2.getTextSize(text, font, font_scale, max(1, thickness - 1))

        label_h = th + baseline + (padding * 2)
        label_w = tw + (padding * 2)
        y_top = y1 - label_h - 2
        if y_top < 0:
            y_top = y1 + 2
        y_bottom = y_top + label_h
        x_left = x1
        x_right = min(out.shape[1] - 1, x_left + label_w)

        cv2.rectangle(out, (x_left, y_top), (x_right, y_bottom), (0, 0, 0), -1, lineType=cv2.LINE_AA)
        cv2.rectangle(out, (x_left, y_top), (x_right, y_bottom), (0, 255, 0), 1, lineType=cv2.LINE_AA)
        text_org = (x_left + padding, y_bottom - baseline - padding)
        cv2.putText(
            out,
            text,
            text_org,
            font,
            font_scale,
            (255, 255, 255),
            max(1, thickness - 1),
            lineType=cv2.LINE_AA,
        )
    return out


def collect_images(source: Path) -> list[Path]:
    if source.is_file():
        if source.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image file extension: {source.suffix}")
        return [source]

    if source.is_dir():
        images = sorted(
            [p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
        )
        if not images:
            raise FileNotFoundError(f"No images found in directory: {source}")
        return images

    raise FileNotFoundError(f"Source path does not exist: {source}")


def render_colored_segmentation(seg_result, alpha: float = 0.45) -> np.ndarray:
    """
    Render segmentation masks as semi-transparent color overlays.
    """
    base = seg_result.orig_img.copy()
    if base is None:
        return seg_result.plot()

    h, w = base.shape[:2]
    if seg_result.masks is not None and seg_result.masks.data is not None:
        masks = seg_result.masks.data.cpu().numpy()
        for idx, mask in enumerate(masks):
            color = np.array(MASK_COLORS[idx % len(MASK_COLORS)], dtype=np.uint8)
            resized_mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
            binary = resized_mask > 0.5
            if not np.any(binary):
                continue
            overlay = np.zeros_like(base, dtype=np.uint8)
            overlay[binary] = color
            base = np.where(
                overlay > 0,
                (base * (1.0 - alpha) + overlay * alpha).astype(np.uint8),
                base,
            )

    # Draw readable boxes/labels on top after color fill.
    annotated = draw_readable_boxes(seg_result, base)
    return annotated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run detection+segmentation inference and save visualized outputs."
    )
    parser.add_argument("--source", required=True, type=str, help="Input image file or directory")
    parser.add_argument(
        "--detect-model",
        type=str,
        default="runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt",
        help="Path to detection model weights",
    )
    parser.add_argument(
        "--seg-model",
        type=str,
        default="runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/best.pt",
        help="Path to segmentation model weights",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="inference_outputs",
        help="Directory to save visualized results",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--conf", type=float, default=0.10, help="Confidence threshold")
    parser.add_argument("--device", type=str, default="0", help="Inference device (e.g. 0, cpu)")
    args = parser.parse_args()

    source = Path(args.source)
    detect_model_path = Path(args.detect_model)
    seg_model_path = Path(args.seg_model)
    output_dir = Path(args.output_dir)

    if not detect_model_path.exists():
        raise FileNotFoundError(f"Detection model not found: {detect_model_path.resolve()}")
    if not seg_model_path.exists():
        raise FileNotFoundError(f"Segmentation model not found: {seg_model_path.resolve()}")

    images = collect_images(source)
    detect_model = YOLO(str(detect_model_path))
    seg_model = YOLO(str(seg_model_path))

    detect_dir = output_dir / "detection"
    seg_dir = output_dir / "segmentation"
    detect_dir.mkdir(parents=True, exist_ok=True)
    seg_dir.mkdir(parents=True, exist_ok=True)

    for image_path in images:
        detect_result = detect_model.predict(
            source=str(image_path),
            imgsz=args.imgsz,
            conf=args.conf,
            device=args.device,
            verbose=False,
        )[0]
        seg_result = seg_model.predict(
            source=str(image_path),
            imgsz=args.imgsz,
            conf=args.conf,
            device=args.device,
            verbose=False,
        )[0]

        detect_vis = draw_readable_boxes(detect_result, detect_result.orig_img)
        seg_vis = render_colored_segmentation(seg_result)

        if source.is_dir():
            relative_path = image_path.relative_to(source)
        else:
            relative_path = Path(image_path.name)

        detect_output = detect_dir / relative_path
        seg_output = seg_dir / relative_path
        detect_output.parent.mkdir(parents=True, exist_ok=True)
        seg_output.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(detect_output), detect_vis)
        cv2.imwrite(str(seg_output), seg_vis)

    print(f"Inference completed for {len(images)} image(s).")
    print(f"Detection visualizations: {detect_dir.resolve()}")
    print(f"Segmentation visualizations: {seg_dir.resolve()}")


if __name__ == "__main__":
    main()
