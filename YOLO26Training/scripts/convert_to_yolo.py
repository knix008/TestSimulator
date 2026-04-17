import os
import shutil
import pandas as pd
from sklearn.model_selection import train_test_split

# YOLO26 라벨 매핑
YOLO_LABELS = {'aneurysm': 0, 'cancer': 1, 'tumor': 2}

# 경로 설정
CSV_PATH = './data/ct_brain.csv'
IMG_ROOT = './data/files'
YOLO_ROOT = './yolo_dataset'

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
            # YOLO Detection 라벨 파일 생성
            # 형식: class cx cy w h
            # 원본 bbox가 없어서 전체 이미지를 1개 객체 bbox로 가정
            yolo_label = f"{label} 0.5 0.5 1.0 1.0\n"
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
