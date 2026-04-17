import os
import shutil

import cv2
import pandas as pd
from sklearn.model_selection import train_test_split

# YOLO26 라벨 매핑
YOLO_LABELS = {'aneurysm': 0, 'cancer': 1, 'tumor': 2}

# 경로 설정
CSV_PATH = './data/ct_brain.csv'
IMG_ROOT = './data/files'
YOLO_ROOT = './yolo_dataset'


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _bbox_xyxy_to_yolo(x1: float, y1: float, x2: float, y2: float, img_w: int, img_h: int) -> tuple[float, float, float, float]:
    x1 = max(0.0, min(float(img_w - 1), x1))
    y1 = max(0.0, min(float(img_h - 1), y1))
    x2 = max(0.0, min(float(img_w - 1), x2))
    y2 = max(0.0, min(float(img_h - 1), y2))
    if x2 <= x1:
        x2 = min(float(img_w - 1), x1 + 1.0)
    if y2 <= y1:
        y2 = min(float(img_h - 1), y1 + 1.0)

    cx = ((x1 + x2) / 2.0) / img_w
    cy = ((y1 + y2) / 2.0) / img_h
    w = (x2 - x1) / img_w
    h = (y2 - y1) / img_h
    return _clip01(cx), _clip01(cy), _clip01(w), _clip01(h)


def _try_bbox_from_csv(row: pd.Series, img_w: int, img_h: int) -> tuple[float, float, float, float] | None:
    # Priority 1: xmin, ymin, xmax, ymax
    xyxy_cols = ["xmin", "ymin", "xmax", "ymax"]
    if all(col in row.index for col in xyxy_cols):
        vals = [row[col] for col in xyxy_cols]
        if all(pd.notna(v) for v in vals):
            return _bbox_xyxy_to_yolo(float(vals[0]), float(vals[1]), float(vals[2]), float(vals[3]), img_w, img_h)

    # Priority 2: x, y, width, height
    xywh_cols = ["x", "y", "width", "height"]
    if all(col in row.index for col in xywh_cols):
        vals = [row[col] for col in xywh_cols]
        if all(pd.notna(v) for v in vals):
            x, y, w, h = [float(v) for v in vals]
            return _bbox_xyxy_to_yolo(x, y, x + w, y + h, img_w, img_h)
    return None


def _pseudo_tight_bbox_from_image(img_path: str) -> tuple[float, float, float, float]:
    image = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        # ultimate fallback
        return 0.5, 0.5, 1.0, 1.0

    img_h, img_w = image.shape[:2]
    # Build a foreground mask (brain area) by removing black margins.
    blurred = cv2.GaussianBlur(image, (5, 5), 0)
    _, mask = cv2.threshold(blurred, 10, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    ys, xs = (mask > 0).nonzero()
    if len(xs) < 20 or len(ys) < 20:
        return 0.5, 0.5, 1.0, 1.0

    x1, x2 = xs.min(), xs.max()
    y1, y2 = ys.min(), ys.max()
    # shrink slightly from brain ROI edges to avoid almost full-frame boxes
    pad_x = int((x2 - x1) * 0.08)
    pad_y = int((y2 - y1) * 0.08)
    x1 = min(max(0, x1 + pad_x), img_w - 2)
    y1 = min(max(0, y1 + pad_y), img_h - 2)
    x2 = max(min(img_w - 1, x2 - pad_x), x1 + 1)
    y2 = max(min(img_h - 1, y2 - pad_y), y1 + 1)

    return _bbox_xyxy_to_yolo(float(x1), float(y1), float(x2), float(y2), img_w, img_h)

# YOLO 폴더 구조 생성
def make_yolo_dirs():
    for split in ['images/train', 'images/val', 'labels/train', 'labels/val']:
        os.makedirs(os.path.join(YOLO_ROOT, split), exist_ok=True)

def convert_to_yolo():
    df = pd.read_csv(CSV_PATH)
    train_df, val_df = train_test_split(df, test_size=0.2, stratify=df['type'], random_state=42)
    for split, split_df in zip(['train', 'val'], [train_df, val_df]):
        for _, row in split_df.iterrows():
            img_path = os.path.join(IMG_ROOT, row['jpg'][1:])
            label = YOLO_LABELS[row['type']]
            image = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            if image is None:
                continue
            img_h, img_w = image.shape[:2]

            # If bbox columns exist in CSV, use them. Otherwise create tighter pseudo bbox from image foreground.
            yolo_bbox = _try_bbox_from_csv(row, img_w, img_h)
            if yolo_bbox is None:
                yolo_bbox = _pseudo_tight_bbox_from_image(img_path)
            cx, cy, w, h = yolo_bbox
            yolo_label = f"{label} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n"
            base = os.path.splitext(os.path.basename(row['jpg']))[0]
            out_img = os.path.join(YOLO_ROOT, f'images/{split}/{base}.jpg')
            out_label = os.path.join(YOLO_ROOT, f'labels/{split}/{base}.txt')
            # Use Python copy for cross-platform compatibility (Windows/Linux/macOS).
            shutil.copy2(img_path, out_img)
            with open(out_label, 'w') as f:
                f.write(yolo_label)

if __name__ == '__main__':
    make_yolo_dirs()
    convert_to_yolo()
    print('YOLO26 Detection 데이터셋 변환 완료!')
