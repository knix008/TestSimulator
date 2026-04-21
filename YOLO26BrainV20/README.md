# YOLO26BrainV20

Windows에서 **뇌 CT 출혈(hemorrhage) 인스턴스 세그멘테이션**을 위해 **Ultralytics YOLO-seg 스타일 ONNX**를 실행하는 **WinForms** 앱입니다. Python 도구는 **학습된 `.pt` → ONNX 변환**과 (선택) **ONNX 입출력 점검**을 제공합니다.

## 1) 요구 사항

| 구분 | 내용 |
|------|------|
| OS | Windows 10/11 (x64) |
| .NET | .NET 8 SDK |
| Python | (선택) `.pt`→ONNX·`verify_onnx_io.py` 사용 시 3.10+ 및 `requirements-export.txt` |
| GPU | (선택) C# 추론: ONNX Runtime CUDA; Python export: CUDA용 PyTorch |
| MSI 빌드 | WiX Toolset 5 SDK(`WixToolset.Sdk`) — NuGet 복원으로 `dotnet build` 가능; Visual Studio에서는 **Release \| x64**로 솔루션 빌드 |

## 2) 저장소 구조

| 경로 | 설명 |
|------|------|
| `YOLO26BrainV20.sln` | WinForms 프로젝트 + WiX 설치 프로젝트 |
| `src/YOLO26BrainV20/` | C# WinForms 앱·ONNX 추론 코드 |
| `src/YOLO26BrainV20/tools/` | `export_yolo26_brain_onnx.py`, `requirements-export.txt`, `verify_onnx_io.py` |
| `installer/YOLO26BrainV20.Installer/` | WiX(`Package.wxs`) — Release 빌드 시 `YOLO26BrainV20.msi` 생성 |
| `samples/` | (선택) 데모용 샘플 이미지 — 빌드에 필수 아님 |
| `models/` | ONNX 등 로컬 자산(용량이 크면 `.gitignore`로 제외 권장) |

**도구 스크립트 (`src/YOLO26BrainV20/tools/`)**

| 파일 | 역할 |
|------|------|
| `requirements-export.txt` | PyTorch 가중치 → ONNX export용 최소 pip 의존성 |
| `export_yolo26_brain_onnx.py` | `.pt` → ONNX |
| `verify_onnx_io.py` | ONNX 입출력 이름·shape 점검(`onnxruntime`) |

## 3) .NET 앱 빌드

저장소 루트에서:

```powershell
dotnet build .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release
```

**출혈 세그 ONNX**와(선택) 입력 이미지만 있으면 추론을 실행할 수 있습니다.

## 4) MSI 설치 패키지 (WiX)

프레임워크 종속 배포(`SelfContained=false`, RID `win-x64`)를 MSI로 묶습니다. 설치 PC에는 **.NET 8 Windows Desktop 런타임(x64)**가 필요합니다.

```powershell
dotnet build .\installer\YOLO26BrainV20.Installer\YOLO26BrainV20.Installer.wixproj -c Release
```

생성물: `installer\YOLO26BrainV20.Installer\bin\Release\YOLO26BrainV20.msi`

Visual Studio 2022/2025/2026 등에서 솔루션을 연 뒤 **구성: Release**, **플랫폼: x64**로 빌드하면 동일하게 WiX 프로젝트가 함께 빌드됩니다.

## 5) Python — `.pt` → ONNX (선택)

```powershell
cd .\src\YOLO26BrainV20\tools
pip install -r requirements-export.txt
python export_yolo26_brain_onnx.py --weights "D:\path\to\best.pt" --out "D:\path\to\hemorrhage_seg.onnx" --imgsz 640 --opset 12
```

`--weights`에는 이미 갖고 있는 YOLO 세그 체크포인트(`.pt`) 경로를 넣으면 됩니다.

## 6) 샘플 이미지 (선택)

CLI 스모크 테스트(`--smoke-test`, `--input` 생략)는 `%LocalAppData%\YOLO26BrainV20\samples\brain_tumor_sample.jpg` 또는 리포 **`samples/brain_tumor_sample.jpg`**가 있으면 그 파일을 쓰고, 없으면 합성 이미지를 사용합니다. GUI **도구 → 샘플 이미지 폴더 열기**로 로컬 `samples` 폴더를 탐색기에서 열 수 있습니다.

## 7) WinForms 앱 (GUI)

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release
```

1. **도구 → 추천 기본값 적용**으로 클래스(`hemorrhage`)·신뢰도를 맞출 수 있습니다.  
2. **출혈 세그 ONNX** 선택.  
3. **뇌 CT 이미지** 선택.  
4. **세그 실행** — 세그 ONNX이면 마스크 오버레이와 박스가 그려집니다.  
5. **도구 → PyTorch(.pt)→ONNX 변환**으로 GUI에서 export를 실행할 수도 있습니다(로컬 Python 필요).  
6. **실행 공급자** 콤보에서 CPU / CUDA 등 ONNX Runtime 실행 공급자를 선택할 수 있습니다.

## 8) 콘솔 추론

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release -- --model "D:\path\hemorrhage_seg.onnx" --input "D:\path\image_or_folder" --conf 0.25 --labels hemorrhage
```

| 옵션 | 설명 |
|------|------|
| `--model`, `-m` | ONNX 파일 경로 |
| `--input`, `-i` | 이미지 파일 또는 폴더 |
| `--output`, `-o` | 결과 폴더(생략 시 입력 근처 `brain_ct_hemorrhage_seg_out`) |
| `--conf`, `-c` | 최소 신뢰도(생략 시 앱 권장값) |
| `--labels`, `-l` | 클래스 이름(생략 시 `hemorrhage`; 모델 클래스 순서와 일치해야 함) |
| `--ep`, `-e` | `auto`(기본), `cpu`, `cuda`/`gpu` — ONNX Runtime 실행 공급자 |
| `--cuda-device` | CUDA 사용 시 GPU 인덱스(기본 `0`) |

### 스모크 테스트

`--input` 생략 시: `%LocalAppData%\YOLO26BrainV20\samples\...` → 리포 `samples\...` → 없으면 합성 이미지.

```powershell
dotnet run --project .\src\YOLO26BrainV20\YOLO26BrainV20.csproj -c Release -- --smoke-test --model ".\models\hemorrhage_seg.onnx" --conf 0.01 --labels hemorrhage --ep auto
```

### ONNX 입출력 확인 (Python)

```powershell
cd .\src\YOLO26BrainV20\tools
pip install onnxruntime
python verify_onnx_io.py "..\..\models\hemorrhage_seg.onnx"
```

## 9) 문제 해결

| 증상 | 조치 |
|------|------|
| `export` 실패 | `pip install -r requirements-export.txt`, Ultralytics·가중치 경로 확인 |
| 추론 박스/클래스가 이상함 | ONNX 클래스 수·순서와 `--labels`/앱 클래스 입력이 모델과 일치하는지 확인 |
| CUDA DLL 오류(추론) | ONNX Runtime GPU용 CUDA/cuDNN 경로 확인 |
| WiX 빌드 시 `win-x64` 자산 오류 | 앱 `.csproj`에 `RuntimeIdentifiers`가 포함돼 있는지 확인 후 `dotnet restore` |

---

문의나 개선 아이디어는 이슈·PR로 남겨 주시면 됩니다.
