# YOLO11nBrainV10

Windows용 **뇌 CT(또는 단일 프레임 DICOM) 슬라이스**에 대해 Ultralytics 스타일 **YOLO11n ONNX**로 **인스턴스 세그멘테이션** 또는 **검출**을 실행하는 WinForms 앱입니다. ONNX Runtime으로 추론하며, CUDA가 있으면 GPU를 쓰고 없으면 CPU로 동작합니다.

**모델은 저장소에 포함되지 않습니다.** 뇌 CT에 맞는 가중치는 아래 **Python 학습 → ONNX 보내기** 절차로 준비한 뒤, 앱에서 해당 `.onnx`를 선택합니다.

## 요구 사항

- Windows 10/11, **x64**
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- (선택) NVIDIA GPU + CUDA/cuDNN — 패키지는 `Microsoft.ML.OnnxRuntime.Gpu` 기준이며, GPU 초기화에 실패하면 자동으로 **CPU**로 폴백합니다.

## 빌드

저장소에서 이 폴더 기준:

```powershell
cd src\YOLO11BrainV10
dotnet build -c Release
```

또는 솔루션:

```powershell
dotnet build YOLO11BrainV10.sln -c Release
```

출력 예: `src\YOLO11BrainV10\bin\x64\Release\net8.0-windows\` (구성에 따라 `Release\net8.0-windows`일 수 있음)

## 실행 (GUI)

인수 없이 실행하면 메인 창이 열립니다.

```powershell
dotnet run --project src\YOLO11BrainV10\YOLO11BrainV10.csproj -c Release
```

빌드 후에는 `YOLO11BrainV10.exe`를 해당 `bin` 폴더에서 직접 실행해도 됩니다.

## 실행 (콘솔 / 배치)

```text
YOLO11BrainV10 --model <brain_seg.onnx> --input <파일|폴더> [--output 디렉터리] [--conf 0.25] [--labels a,b,c]
```

- `--labels` 기본값: `negative,positive` (Ultralytics `brain-tumor.yaml` 클래스 순서와 맞출 것)
- `--output` 생략 시 첫 입력 파일과 같은 상위 경로 아래 `brain_yolo_out` 폴더에 PNG 저장
- 도움말: `--help` 또는 `-h`

## 데이터·설정 경로 (앱이 만드는 위치)

| 용도 | 경로 |
|------|------|
| 앱 루트 | `%LocalAppData%\YOLO11BrainV10\` |
| CT 샘플·다운로드 기본 | `%LocalAppData%\YOLO11BrainV10\data\ct\` |
| ONNX / `.pt` 복사본 기본 | `%LocalAppData%\YOLO11BrainV10\models\` |
| 사용자 설정 | `%LocalAppData%\YOLO11BrainV10\preferences.json` |

도구 메뉴에서 CT 저장 폴더를 바꿀 수 있습니다.

## 사용 흐름 (GUI)

1. **모델**에서 Ultralytics에서 보낸 `.onnx` 선택 (세그는 마스크 프로토가 포함된 export).
2. **클래스** 입력란에 학습 시 `data.yaml`의 `names` 순서와 동일하게 쉼표로 구분해 입력.
3. **이미지**로 PNG/JPEG 등 또는 단일 프레임 **DICOM** (`.dcm`) 선택.
4. **신뢰 수준** 슬라이더 조정 후 분석 실행.
5. 결과 저장·CSV 보내기는 메뉴/버튼 사용.

**도구 → 추천 기본값 적용**으로 신뢰도·클래스 문구를 권장값으로 맞출 수 있습니다.

## Python으로 학습 → ONNX → 앱

의료 뇌 CT에 맞는 세그멘테이션(또는 검출)은 **본인 데이터로 Ultralytics에서 학습**한 뒤 ONNX로 보내는 흐름을 권장합니다.

### 1) 환경

```powershell
cd src\YOLO11BrainV10\tools
pip install -r requirements-export.txt
```

### 2) 데이터셋 디렉터리 (YOLO Segment 형식)

`yolo segment train`에는 **세그용 라벨**(폴리곤/마스크, YOLO-seg 텍스트)이 필요합니다. Ultralytics `brain-tumor` 배포 zip의 박스 라벨만으로는 세그 학습이 되지 않습니다. Roboflow 등에서 **YOLOv8 Segmentation** 형식으로 export 하거나, NIfTI 마스크에서 변환해 준비합니다.

예시 레이아웃 (`MY_DATASET`은 실제 절대 경로로 바꿉니다):

```text
MY_DATASET/
  data.yaml
  images/train/   … png/jpg
  images/val/
  labels/train/  … 세그용 .txt (클래스별 폴리곤)
  labels/val/
```

`data.yaml` 예 (클래스 이름·개수는 프로젝트에 맞게 수정):

```yaml
path: C:/path/to/MY_DATASET
train: images/train
val: images/val
names:
  0: negative
  1: positive
```

CT만 학습에 쓰려면 위 `images`·`labels`에 CT 슬라이스만 넣습니다.

이 저장소에는 기본 레이아웃으로 `data/brain_ct_seg/`(이미지·라벨 폴더, `DATASET.txt`)가 있습니다. `data.yaml`은 `brain_ct_pipeline.py init`이 **절대 경로**로 생성하며, `.gitignore`에 넣어 두었습니다.

### 2b) 한 번에: `brain_ct_pipeline.py` (권장)

저장소 루트에 `YOLO11BrainV10.sln`이 있으면 스크립트가 루트를 자동으로 찾습니다.

```powershell
cd src\YOLO11BrainV10\tools
python brain_ct_pipeline.py init
```

**공개 데이터 자동 받기** — Ultralytics [brain-tumor](https://docs.ultralytics.com/datasets/detect/brain-tumor/) zip(~4.2MB, **AGPL-3.0**)을 내려받아 `data/brain_ct_seg/`에 풉니다. 원본은 **검출 박스**라서, 세그 학습용으로 각 박스를 **축에 맞는 사각형 폴리곤**으로 변환합니다(진짜 조직 마스크는 아님).

```powershell
python brain_ct_pipeline.py fetch
```

다운로드만 따로 쓰는 **전용 스크립트**(위 `fetch`와 동일):

```powershell
python download_brain_dataset.py
python download_brain_dataset.py --force
python download_brain_dataset.py --repo C:\path\to\YOLO11BrainV10
```

이미 `images/train`에 파일이 있으면 덮어쓰지 않습니다. 다시 받으려면 `fetch --force` 또는 `download_brain_dataset.py --force`(기존 train/val 이미지·라벨을 비운 뒤 재다운로드).

직접 넣을 경우, `data/brain_ct_seg/images/train` 등에 **세그 라벨이 짝지어진** 이미지를 둔 뒤:

```powershell
python brain_ct_pipeline.py train
python brain_ct_pipeline.py export
python brain_ct_pipeline.py predict
```

연속 실행:

```powershell
python brain_ct_pipeline.py all
```

`all`/`train`은 기본적으로 학습 이미지가 비어 있으면 `fetch`를 자동 실행해 공개 brain-tumor 데이터를 받습니다.  
패키지가 없는 환경에서 한 번에 진행하려면 `--auto-install`을 추가하세요.

```powershell
python brain_ct_pipeline.py all --auto-install
```

디바이스는 기본적으로 **GPU 우선**이며(CUDA 감지 시 `device=0`), GPU가 없을 때만 CPU로 폴백합니다.  
`--device`를 직접 주면 해당 값을 우선 사용합니다.

`images/train`에 아직 아무 이미지도 없으면 `train` / `all`은 실패합니다. **스모크 테스트만** 하려면 Ultralytics 샘플 1장과 더미 세그 라벨을 자동으로 넣는 옵션을 쓰세요(임상용 모델이 아닙니다).

```powershell
python brain_ct_pipeline.py all --demo-data
```

짧게 돌리려면 예: `python brain_ct_pipeline.py all --demo-data --epochs 3`.

- 학습 산출물: `runs/brain_ct_seg/train/weights/best.pt`
- ONNX: `exports/brain_ct_yolo11n_seg.onnx` (GUI에서 이 파일 선택 가능)
- `predict`는 입력이 없으면 Ultralytics 뇌 샘플 이미지를 받아 `runs/brain_ct_seg/predict_demo/`에 시각화를 저장합니다.

이미 `best.pt`만 있을 때:

```powershell
python brain_ct_pipeline.py all --skip-train --weights runs\brain_ct_seg\train\weights\best.pt
```

### 2c) 파이프라인·저장소 정리 (상세)

**`brain_ct_pipeline.py` 서브커맨드**

| 명령 | 설명 |
|------|------|
| `init` | `data/brain_ct_seg/` 하위 `images/*`, `labels/*` 및 `exports/`, `runs/brain_ct_seg/` 준비. `data.yaml` 생성(이미 있으면 유지). |
| `fetch` | Ultralytics `brain-tumor.zip` 다운로드 → `data/brain_ct_seg`에 복사. 검출 박스를 세그용 사각형 폴리곤으로 변환. `--force`로 기존 미디어 삭제 후 재수신. |
| `train` | 세그 학습. `images/train`에 이미지가 없으면 실패(절대 경로 안내). `fetch` 또는 `--demo-data`로 채울 수 있습니다. |
| `export` | `runs/brain_ct_seg/train/weights/best.pt` → `exports/brain_ct_yolo11n_seg.onnx`. `--weights`로 다른 `.pt` 지정 가능. |
| `predict` | `--weights`(`.pt` 또는 `.onnx`), `--source`(이미지). 생략 시 데모 뇌 이미지를 내려받아 시각화 저장. |
| `all` | `init` → `train` → `export` → `predict` 순서. `--demo-data`, `--skip-train`, `--weights` 지원. |

`train`/`all` 공통으로 `--auto-fetch`(기본 켜짐, `--no-auto-fetch`로 끔)과 `--auto-install`(ultralytics 자동 설치) 옵션을 지원합니다.
`--auto-install`은 PyTorch 설치 시 **GPU wheel(cu121)를 먼저 시도**하고, 실패 시 CPU wheel로 자동 폴백합니다.

**자주 쓰는 옵션**

- `--repo <경로>`: `YOLO11BrainV10.sln`이 있는 저장소 루트를 수동 지정(기본은 스크립트 위치 기준 자동 탐색).
- `init --force`: 기존 `data.yaml`을 덮어써서 `path:` 등을 다시 씁니다.
- `predict` / `all`: `--conf`, `--imgsz` 등으로 추론 설정 조정 가능.

**저장소에 이미 있는 것**

- `data/brain_ct_seg/`: 학습용 폴더 골격, `DATASET.txt`(배치 안내), 빈 폴더용 `.gitkeep`.
- `exports/`: ONNX 기본 출력 디렉터리(`.gitkeep`만 커밋).

**Git에 올리지 않는 것(`.gitignore`)**

- `data/brain_ct_seg/data.yaml` — `init`이 만드는 기계·경로 의존 파일.
- `data/brain_ct_seg/_demo_brain_sample.jpg` — `predict`가 받는 데모 이미지.
- `runs/` — Ultralytics 학습·추론 산출물.
- `exports/*.onnx` — 빌드 산출 ONNX(용량·환경 의존).

**`train_yolo11n_seg_brain_ct.py` 변경 요약**

- 선택 인자 `--project`, `--name`, `--device`(예: `0`, `cpu`)를 넘기면 Ultralytics 학습 출력 위치·디바이스를 직접 지정할 수 있습니다. 인자를 생략하면 Ultralytics 기본 동작을 따릅니다.

**빌드 출력**

- `dotnet build` 후 `bin\...\net8.0-windows\tools\` 아래에 `brain_ct_pipeline.py` 등 스크립트가 **복사**됩니다(`YOLO11BrainV10.csproj`의 `CopyToOutputDirectory`). 배포 폴더에서도 동일한 Python 흐름을 쓸 수 있습니다.

### 3) 학습 (Python, 단일 스크립트)

임의 `data.yaml`을 쓸 때:

```powershell
cd src\YOLO11BrainV10\tools
python train_yolo11n_seg_brain_ct.py --data C:\path\to\MY_DATASET\data.yaml --epochs 100 --imgsz 640 --batch 8
```

선택 인자: `--project`, `--name`, `--device`(예: `0`, `cpu`).

기본 시작 가중치는 `yolo11n-seg.pt`(Ultralytics가 캐시에 받음)입니다. `train_yolo11n_seg_brain_ct.py`만 쓰면 산출 경로는 Ultralytics 기본(`runs/segment/train/...`)에 가깝습니다. **파이프라인 스크립트**는 `runs/brain_ct_seg/train/...`로 고정합니다.

### 4) ONNX 보내기 (Python)

파이프라인을 썼다면 `export` 단계가 `exports/brain_ct_yolo11n_seg.onnx`를 만듭니다. 수동으로는:

```powershell
python export_yolo11_brain_onnx.py --weights C:\path\to\runs\brain_ct_seg\train\weights\best.pt --out brain_ct_yolo11n_seg.onnx
```

Python 의존성이 없는 환경이면 자동 설치까지 포함:

```powershell
python export_yolo11_brain_onnx.py --weights C:\path\to\best.pt --out exports\brain_ct_yolo11n_seg.onnx --auto-install
```

`--weights`를 생략하고 저장소 기본 경로(`runs/brain_ct_seg/train/weights/best.pt`)를 쓰려면:

```powershell
python export_yolo11_brain_onnx.py --repo C:\path\to\YOLO11BrainV10 --out exports\brain_ct_yolo11n_seg.onnx
```

생성된 ONNX를 GUI **모델**에서 열고, **클래스**를 학습 시 `data.yaml`의 `names` 순서와 동일하게 입력합니다.

### 5) (선택) Python에서만 빠른 시각화 확인

사전 학습된 **COCO** `yolo11n-seg` / `yolo11n`으로 파이프라인을 시험할 때(뇌 CT 전용 아님):

```powershell
python brain_ct_yolo_download_and_infer.py --out runs\brain_ct_demo --export-onnx
```

## ONNX·학습 관련 스크립트

빌드 출력의 `tools` 폴더에 복사됩니다.

| 파일 | 설명 |
|------|------|
| `brain_ct_pipeline.py` | `init` → `train` → `export` → `predict` / `all` (기본 경로 `data/brain_ct_seg`, `exports/`) |
| `download_brain_dataset.py` | 공개 brain-tumor zip만 받기(`fetch`와 동일). `--force`, `--repo` 지원 |
| `train_yolo11n_seg_brain_ct.py` | YOLO11n-seg 세그 학습 래퍼 (`--data`에 `data.yaml`) |
| `export_yolo11_brain_onnx.py` | 학습된 `.pt` → ONNX 보내기 |
| `brain_ct_yolo_download_and_infer.py` | COCO 사전학습 가중치 다운로드·세그/검출 데모·선택 ONNX (의료 전용 아님) |
| `requirements-export.txt` | Python 의존성 |
| `Download-SampleAssets.ps1` | 앱 테스트용 샘플 **이미지** 다운로드 (ONNX 미포함) |

앱의 **PyTorch→ONNX 변환** 메뉴는 PATH의 `py`/`python` 또는 환경 변수 `YOLO11_PYTHON`을 사용합니다.

## 지원 형식

- **입력 이미지**: PNG, JPEG, BMP, TIFF, 단일 프레임 DICOM 등 (`BrainCtSliceLoader` 기준)
- **모델**: Ultralytics YOLO 세그/검출 ONNX와 호환되는 출력 형식

## 문제 해결 요약

- **`brain_ct_pipeline.py train` / `all`이 바로 끝남(코드 1)**: 콘솔에 출력된 **절대 경로**의 `images/train`에 PNG/JPEG 등을 넣고, 같은 이름의 세그 `.txt`를 `labels/train`에 두세요. 연습만이면 `all --demo-data` 또는 `train --demo-data`.
- **검출·세그가 전혀 없음**: 신뢰도를 낮춰 보기, 모델이 해당 영상 도메인으로 학습되었는지 확인, 클래스 이름 순서가 `data.yaml`과 일치하는지 확인.
- **GPU 사용 안 됨**: 상태줄에 CPU 폴백 메시지가 나오면 CUDA/cuDNN 및 PATH를 확인 (DLL 126 등).

## 라이선스·서드파티

프로젝트에 포함된 패키지(ONNX Runtime, fo-dicom 등)는 각각의 라이선스를 따릅니다. 샘플 이미지 출처는 다운로드 시 함께 저장되는 `ATTRIBUTION.txt`를 참고하세요.
