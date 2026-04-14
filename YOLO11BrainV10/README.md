# YOLO11BrainV10

Windows용 **뇌 CT(또는 단일 프레임 DICOM) 슬라이스**에 대해 Ultralytics 스타일 **YOLO11 ONNX**로 **인스턴스 세그멘테이션** 또는 **검출**을 실행하는 WinForms 앱입니다. ONNX Runtime으로 추론하며, CUDA가 있으면 GPU를 쓰고 없으면 CPU로 동작합니다.

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

1. **모델**에서 Ultralytics에서보낸 `.onnx` 선택 (세그는 마스크 프로토가 포함된 export).
2. **클래스** 입력란에 학습 시 `data.yaml`의 `names` 순서와 동일하게 쉼표로 구분해 입력.
3. **이미지**로 PNG/JPEG 등 또는 단일 프레임 **DICOM** (`.dcm`) 선택.
4. **신뢰 수준** 슬라이더 조정 후 분석 실행.
5. 결과 저장·CSV보내기는 메뉴/버튼 사용.

**도구 → 추천 기본값 적용**으로 신뢰도·클래스 문구를 권장값으로 맞출 수 있습니다.

## ONNX·학습 관련 스크립트

빌드 출력의 `tools` 폴더에 복사됩니다.

| 파일 | 설명 |
|------|------|
| `export_yolo11_brain_onnx.py` | `.pt` → ONNX보내기 (Ultralytics) |
| `train_yolo11n_seg_brain_ct.py` | 학습 예시 스크립트 |
| `requirements-export.txt` | Python 의존성 |
| `Download-SampleAssets.ps1` | 샘플 자산 다운로드 (PowerShell) |

앱의 **PyTorch→ONNX 변환** 메뉴는 PATH의 `py`/`python` 또는 환경 변수 `YOLO11_PYTHON`을 사용합니다.

## 지원 형식

- **입력 이미지**: PNG, JPEG, BMP, TIFF, 단일 프레임 DICOM 등 (`BrainCtSliceLoader` 기준)
- **모델**: Ultralytics YOLO 세그/검출 ONNX와 호환되는 출력 형식

## 문제 해결 요약

- **검출·세그가 전혀 없음**: 신뢰도를 낮춰 보기, 모델이 해당 영상 도메인으로 학습되었는지 확인, 클래스 이름 순서가 `data.yaml`과 일치하는지 확인.
- **GPU 사용 안 됨**: 상태줄에 CPU 폴백 메시지가 나오면 CUDA/cuDNN 및 PATH를 확인 (DLL 126 등).

## 라이선스·서드파티

프로젝트에 포함된 패키지(ONNX Runtime, fo-dicom 등)는 각각의 라이선스를 따릅니다. 샘플 이미지 출처는 다운로드 시 함께 저장되는 `ATTRIBUTION.txt`를 참고하세요.
