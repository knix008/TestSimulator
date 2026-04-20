# YOLO26BrainV20

Windows에서 뇌 CT·MRI 스타일 이미지에 대해 **Ultralytics YOLO26(segmentation) ONNX** 추론을 실행하는 **WinForms** 앱과, Python으로 **데이터 준비 → 학습 → ONNX보내기**까지 이어지는 도구 모음입니다.

## 1) 요구 사항

| 구분 | 내용 |
|------|------|
| OS | Windows 10/11 (x64) |
| .NET | .NET 8 SDK |
| Python | 3.10 이상 (Ultralytics·PyTorch가 지원하는 버전; 3.11·3.12 권장) |
| GPU | (선택) NVIDIA GPU + CUDA용 PyTorch 빌드 |

GPU가 없어도 학습·추론은 가능하며, 학습 스크립트는 CUDA가 없으면 `device=cpu`로 동작합니다.

## 2) 저장소 구조

| 경로 | 설명 |
|------|------|
| `src/YOLO26BrainV20/` | C# WinForms 앱·ONNX 추론 코드 |
| `src/YOLO26BrainV20/tools/` | Python 스크립트·의존성 목록 |
| `data/brain_ct_seg/` | 기본 학습 데이터(다운로드 스크립트로 채움) |
| `samples/` | COCO 80 라벨 텍스트 등(빌드 리소스용) |
| `runs/` | 학습 로그·가중치(로컬 생성, 기본 `.gitignore`) |
| `models/` |보낸 ONNX 등(로컬 생성, 기본 `.gitignore`) |

**도구 스크립트 요약**

| 파일 | 역할 |
|------|------|
| `requirements-train.txt` | 학습 + ONNX export용 pip 의존성 |
| `requirements-export.txt` | ONNX export만 할 때 최소 의존성 |
| `download_brain_dataset.py` | Ultralytics brain-tumor zip → `data/brain_ct_seg` |
| `pipeline_train_brain.py` | 다운로드(선택) → 학습 → ONNX 한 번에 실행 |
| `train_from_scratch.ps1` | `pip install` 후 `pipeline_train_brain.py` 호출 |
| `train_yolo26n_seg_brain_ct.py` | YOLO26n-seg 학습만 실행 |
| `export_yolo26_brain_onnx.py` | `.pt` → ONNX |
| `download_sample_assets.py` | 앱 테스트용 샘플 이미지 1장 |
| `verify_onnx_io.py` | ONNX 입출력 이름·shape 점검(onnxruntime) |

## 3) .NET 앱 빌드

저장소 루트(`YOLO26BrainV20` 폴더, 솔루션 파일이 있는 위치)에서:

```powershell
dotnet build .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release
```

빌드 시 `samples/coco80_labels_comma.txt`가 필요합니다(리포지토리에 포함).

## 4) Python 환경

```powershell
cd .\src\YOLO26BrainV20\tools
pip install -r requirements-train.txt
```

학습부터 ONNX export까지 모두 포함합니다. export만 할 때는 `requirements-export.txt`만 설치해도 됩니다.

## 5) 학습 데이터 준비

`brain-tumor` 공개 데이터를 받아 `data/brain_ct_seg`을 채웁니다.

```powershell
cd .\src\YOLO26BrainV20\tools
python download_brain_dataset.py
```

- `images/train`, `images/val`, `labels/train`, `labels/val` 생성  
- `data/brain_ct_seg/data.yaml` 생성  
- 검출(box) 라벨을 세그용 **사각형 폴리곤** 라벨로 변환  

**`data.yaml`은 드라이브·PC가 바뀌어도 깨지지 않도록** `path:` 절대 경로를 넣지 않습니다. 데이터 루트는 YAML 파일이 있는 폴더(`brain_ct_seg`)입니다.

이미 이미지가 있으면 스크립트는 종료 코드 `1`로 종료합니다. 다시 받으려면:

```powershell
python download_brain_dataset.py --force
```

다른 클론 경로를 쓸 때:

```powershell
python download_brain_dataset.py --repo "C:\path\to\YOLO26BrainV20"
```

## 6) 학습 → ONNX

### 한 번에 (권장)

`pipeline_train_brain.py`는 (기본) 다운로드 → 학습 → export까지 실행합니다.

- 학습 결과: `<repo>\runs\<실행이름>\weights\best.pt`  
- ONNX 기본 출력: `<repo>\models\brain_ct_yolo26n_seg.onnx`  

```powershell
cd .\src\YOLO26BrainV20\tools
pip install -r requirements-train.txt
python pipeline_train_brain.py
```

PowerShell 한 스크립트:

```powershell
cd .\src\YOLO26BrainV20\tools
.\train_from_scratch.ps1
```

자주 쓰는 옵션:

```powershell
python pipeline_train_brain.py --epochs 50 --skip-download
python pipeline_train_brain.py --force-download
python pipeline_train_brain.py --out-onnx "D:\artifacts\brain_seg.onnx"
python pipeline_train_brain.py --run-name my_exp1 --device cpu
```

`--skip-download` 없이 다운로드가 `1`로 끝나면 “이미 데이터 있음”으로 간주하고 학습은 계속합니다.

#### 파이프라인이 끝까지 됐는지 확인

1. **종료 코드**  
   - `0`: 끝까지 성공(마지막에 weights·ONNX 존재·크기 검사 통과)  
   - `2`: 학습 실패  
   - `3`: `best.pt` 없음  
   - `4`: ONNX export 실패  

2. **콘솔 요약**  
   성공 시 마지막에 `--- 이번 실행 검증 ---` 블록이 나오고, `best.pt`와 ONNX 각각 **OK / 바이트 크기**가 출력됩니다.

3. **기록 파일**  
   저장소 루트에 **`.pipeline_last.json`**이 갱신됩니다(마지막 성공 시점, `run_name`, weights·ONNX 절대 경로, 파일 크기 등). Git에는 올리지 않도록 `.gitignore`에 넣어 두었습니다.

4. **나중에 다시 검사만**  

```powershell
cd .\src\YOLO26BrainV20\tools
python pipeline_train_brain.py --verify
```

위 명령은 학습을 돌리지 않고, `.pipeline_last.json`에 적힌 경로가 **지금도 존재하는지**만 확인합니다. CI나 스크립트에서는 `python pipeline_train_brain.py --verify`의 exit code가 `0`인지 보면 됩니다.

### 학습만

```powershell
cd .\src\YOLO26BrainV20\tools
python train_yolo26n_seg_brain_ct.py
```

- 기본 `data.yaml`: `<repo>\data\brain_ct_seg\data.yaml`  
- **`--data`를 생략하면** 매 실행 시 위 YAML을 **이식 가능한 형식으로 다시 씁니다**(예전 `path: D:\...` 잔재 제거).  
- 기본 프로젝트 디렉터리: `<repo>\runs`  
- 기본 실행 이름: `brain_ct_yolo26n_seg`  

추가 옵션 예:

```powershell
python train_yolo26n_seg_brain_ct.py --epochs 100 --batch 8 --imgsz 640
python train_yolo26n_seg_brain_ct.py --device 0
python train_yolo26n_seg_brain_ct.py --device cpu
python train_yolo26n_seg_brain_ct.py --project "D:\runs" --name exp1 --exist-ok
python train_yolo26n_seg_brain_ct.py --cos-lr --patience 40 --workers 4
```

### ONNX만 변환

가중치 경로는 실제 학습 결과 폴더에 맞게 바꿉니다.

```powershell
cd .\src\YOLO26BrainV20\tools
python export_yolo26_brain_onnx.py --weights "..\..\runs\brain_ct_yolo26n_seg\weights\best.pt" --out "..\..\models\brain_ct_yolo26n_seg.onnx" --imgsz 640 --opset 12
```

`pipeline_train_brain.py`로 학습했다면 실행 이름(예: `from_scratch_20260415_235648utc`) 아래의 `weights\best.pt`를 지정하면 됩니다.

## 7) 샘플 이미지 (선택)

```powershell
cd .\src\YOLO26BrainV20\tools
python download_sample_assets.py
```

## 8) WinForms 앱 (GUI)

저장소 루트에서:

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release
```

권장 흐름:

1. **도구 → 추천 기본값 적용**으로 클래스·신뢰도를 `brain-tumor.yaml` 순서(`negative,positive`)와 YOLO 기본 신뢰도에 맞출 수 있습니다.  
2. **ONNX 모델** 선택 (`models\brain_ct_yolo26n_seg.onnx` 등).  
3. **이미지** 선택.  
4. **최소 신뢰도**: 슬라이더 + 숫자 입력.  
5. **검출 실행** — 추론 중에는 진행 표시줄(마퀴)이 표시됩니다.

세그 ONNX인 경우 마스크 오버레이·박스가 함께 표시될 수 있습니다.

## 9) 콘솔 추론

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release -- --model "D:\path\brain_seg.onnx" --input "D:\path\image_or_folder" --conf 0.25 --labels negative,positive
```

| 옵션 | 설명 |
|------|------|
| `--model`, `-m` | ONNX 파일 경로 |
| `--input`, `-i` | 이미지 파일 또는 폴더 |
| `--output`, `-o` | 결과 폴더(생략 시 `brain_yolo_out`) |
| `--conf`, `-c` | 최소 신뢰도(생략 시 권장값 0.25) |
| `--labels`, `-l` | 클래스 이름 쉼표 구분(생략 시 `negative,positive`) |

### 추론 스모크 테스트 (한 번의 forward)

모델·세션·후처리가 예외 없이 돌아가는지 빠르게 확인합니다. `--input`을 생략하면 아래 **순서대로** 첫 번째로 있는 이미지를 씁니다.

1. `%LocalAppData%\YOLO26BrainV20\samples\brain_tumor_sample.jpg` (앱에서 **샘플 다운로드**한 경우)  
2. 리포지토리 `<repo>\samples\brain_tumor_sample.jpg` (`python download_sample_assets.py`로 받은 경우; exe 기준 상위 폴더를 따라 `samples\coco80_labels_comma.txt`가 있는 루트를 찾음)  
3. 없으면 **합성 640×640**

샘플 이미지 받기(한 번):

```powershell
cd .\src\YOLO26BrainV20\tools
python download_sample_assets.py
```

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release -- --smoke-test --model ".\models\brain_ct_yolo26n_seg.onnx" --conf 0.01 --labels negative,positive
```

- 종료 코드 `0`: `Detect`까지 성공  
- `2`: `--smoke-require-detections`를 썼는데 검출 0건  
- `3`: 세션 생성 또는 `Detect` 중 예외  

ONNX 그래프만 Python에서 보려면(`pip install onnxruntime` 후):

```powershell
cd .\src\YOLO26BrainV20\tools
python verify_onnx_io.py "..\..\models\brain_ct_yolo26n_seg.onnx"
```

## 10) 문제 해결

| 증상 | 조치 |
|------|------|
| `Dataset YAML not found` | `python download_brain_dataset.py` 실행 |
| 학습 시 `images not found` / 다른 드라이브 경로 | `data/brain_ct_seg/data.yaml`에 고정 `path:`가 있으면 제거하거나, `train_yolo26n_seg_brain_ct.py`를 **`--data` 없이** 한 번 실행해 YAML이 갱신되는지 확인 |
| GPU인데 CPU로만 학습 | `python -c "import torch; print(torch.cuda.is_available())"` |
| 빌드 시 `coco80_labels_comma.txt` 없음 | `samples\coco80_labels_comma.txt` 존재 여부 확인 |
| 추론 박스/클래스가 이상함 | ONNX의 클래스 수·순서와 UI **클래스 이름** 입력이 학습 `data.yaml`의 `names`와 일치하는지 확인 |
| 공개 brain-tumor만으로 세그 품질 부족 | 박스를 폴리곤으로만 변환한 부트스트랩 데이터이므로, 실제 마스크 라벨로 재학습하는 것이 좋습니다 |

---

문의나 개선 아이디어는 이슈·PR로 남겨 주시면 됩니다.
