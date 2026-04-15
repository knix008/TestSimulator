# YOLO26BrainV10

Windows에서 뇌 영상(주로 CT/MRI 스타일 이미지)에 대해 YOLO26 ONNX 추론을 실행하는 WinForms 앱입니다.  
또한 Python 스크립트로 **학습 데이터셋 다운로드 → YOLO26 학습 → ONNX 변환**까지 진행할 수 있습니다.

이 문서는 처음부터 끝까지 따라할 수 있도록 단계별로 정리되어 있습니다.

## 1) 요구 사항

- Windows 10/11 (x64)
- .NET 8 SDK
- Python 3.10+ (권장: 3.11/3.12)
- (선택) NVIDIA GPU + CUDA 환경

GPU가 없어도 학습 가능하며, 학습 스크립트가 자동으로 CPU로 폴백합니다.

## 2) 프로젝트 구조 요약

- 앱 프로젝트: `src/YOLO26BrainV10`
- Python 도구 스크립트: `src/YOLO26BrainV10/tools`
- 학습 데이터 기본 위치: `data/brain_ct_seg`
- 샘플 이미지 기본 위치: `samples`

## 3) Python 환경 준비

프로젝트 루트에서 아래 순서로 진행합니다.

```powershell
cd src\YOLO26BrainV10\tools
pip install -r requirements-export.txt
pip install ultralytics
```

## 4) 학습용 데이터셋 다운로드

`brain-tumor` 공개 데이터셋을 다운로드하고, 학습 폴더(`data/brain_ct_seg`)를 자동 구성합니다.

```powershell
cd src\YOLO26BrainV10\tools
python download_brain_dataset.py
```

동작 내용:

- `data/brain_ct_seg/images/train`, `images/val`, `labels/train`, `labels/val` 생성
- `data/brain_ct_seg/data.yaml` 생성
- 공개셋의 검출 라벨(box)을 세그용 사각형 폴리곤 라벨로 변환

이미 데이터가 있으면 중복 다운로드를 막기 위해 종료됩니다. 강제 재다운로드는:

```powershell
python download_brain_dataset.py --force
```

저장소 경로를 직접 주려면:

```powershell
python download_brain_dataset.py --repo "D:\Home\Projects\TestSimulator\YOLO26BrainV10"
```

## 5) 샘플 이미지 다운로드 (선택)

앱 테스트용 샘플 1장을 받습니다.

```powershell
cd src\YOLO26BrainV10\tools
python download_sample_assets.py
```

## 6) YOLO26 학습 실행

### 가장 쉬운 실행 (권장)

```powershell
cd src\YOLO26BrainV10\tools
python train_yolo26n_seg_brain_ct.py
```

`--data`를 생략하면 자동으로 아래 파일을 사용합니다.

- `data/brain_ct_seg/data.yaml`

### GPU/CPU 자동 선택

`--device`를 생략하면:

- CUDA 가능 시 `device=0` (GPU)
- CUDA 불가 시 `device=cpu` (자동 폴백)

로그에서 `Using device: 0` 또는 `Using device: cpu`를 확인할 수 있습니다.

### 주요 옵션

```powershell
python train_yolo26n_seg_brain_ct.py --epochs 100 --imgsz 640 --batch 8
python train_yolo26n_seg_brain_ct.py --device cpu
python train_yolo26n_seg_brain_ct.py --device 0
python train_yolo26n_seg_brain_ct.py --project "D:\runs" --name brain_seg_exp1
python train_yolo26n_seg_brain_ct.py --repo "D:\Home\Projects\TestSimulator\YOLO26BrainV10"
```

학습 결과 기본 경로(옵션 미지정 시):

- `src/YOLO26BrainV10/tools/runs/segment/train`
- 대표 가중치: `.../weights/best.pt`

## 7) ONNX 변환

학습된 `.pt`를 ONNX로 변환합니다.

```powershell
cd src\YOLO26BrainV10\tools
python export_yolo26_brain_onnx.py --weights ".\runs\segment\train\weights\best.pt" --out ".\brain_seg.onnx"
```

옵션 예시:

```powershell
python export_yolo26_brain_onnx.py --weights ".\runs\segment\train\weights\best.pt" --out ".\brain_seg.onnx" --imgsz 640 --opset 12
```

## 8) WinForms 앱 실행 (GUI)

프로젝트 루트에서:

```powershell
dotnet run --project src\YOLO26BrainV10\YOLO26BrainV10.csproj -c Release
```

앱에서:

1. ONNX 모델 선택 (`brain_seg.onnx`)
2. 이미지 선택 (png/jpg/bmp/tif 등)
3. 클래스 입력 (`negative,positive`)
4. 분석 실행

## 9) 콘솔 모드 추론

GUI 없이 배치 처리:

```powershell
dotnet run --project src\YOLO26BrainV10\YOLO26BrainV10.csproj -c Release -- --model "D:\path\brain_seg.onnx" --input "D:\path\image_or_folder" --conf 0.25 --labels negative,positive
```

옵션:

- `--model`, `-m`: ONNX 파일
- `--input`, `-i`: 입력 파일 또는 폴더
- `--output`, `-o`: 출력 폴더 (생략 시 `brain_yolo_out`)
- `--conf`, `-c`: 신뢰도 임계값
- `--labels`, `-l`: 클래스 이름(쉼표 구분)

## 10) 문제 해결

- `Dataset YAML not found`  
  - 먼저 `python download_brain_dataset.py` 실행
- GPU가 있는데 CPU로만 학습됨  
  - `python -c "import torch; print(torch.cuda.is_available())"` 확인
  - 드라이버/CUDA/PyTorch CUDA 빌드 확인
- 결과가 잘 안 맞음  
  - 클래스 순서(`negative,positive`)가 학습 `data.yaml`와 동일한지 확인
  - 공개셋 라벨은 box 기반이므로 정밀 세그 품질 향상이 필요하면 실제 세그 마스크 라벨 데이터로 재학습 권장

---

필요하면 다음 단계로, 학습/변환/추론을 한 번에 실행하는 `pipeline` 스크립트도 추가할 수 있습니다.
