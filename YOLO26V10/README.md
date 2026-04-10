# YOLO26V10

Windows Forms 기반 YOLO26 추론 도구입니다.  
현재 작업 타입: Segmentation / Detection / Pose / Classify / OBB

## 요구 사항

- Windows x64
- .NET SDK 10.x 이상
- (모델 변환 시) Python 3 + `ultralytics`

Python 준비 예시:

```powershell
py -3 -m pip install -r tools\requirements-export.txt
```

## 빌드

### Visual Studio에서 열기

- 일반: **`YOLO26V10.sln`** — 앱 + `YOLO26V10.Installer`(WiX). Solution Explorer에 **installer** 폴더 아래 Installer 프로젝트가 보입니다.
- **“호환되지 않음” / 로드 안 됨:** WiX SDK 스타일 `.wixproj`는 Visual Studio가 기본으로 인식하지 않습니다. **FireGiant HeatWave**(Visual Studio Marketplace, WiX용 확장)를 설치한 뒤 VS를 다시 시작하면 Installer 프로젝트가 정상 로드됩니다. `tools\install-heatwave.ps1`(관리자 PowerShell)로 VSIX 설치를 시도할 수 있습니다.
- WiX 확장 없이 앱만: **`YOLO26V10.AppOnly.sln`**
- **Release 솔루션 빌드 속도:** `YOLO26V10.csproj`의 MSI 후속 빌드는 **솔루션을 열었을 때(`SolutionDir` 있음)** 비활성화되어, WiX가 MSI를 **한 번만** 만듭니다. (`dotnet build YOLO26V10.csproj`처럼 **솔루션 없이** 빌드할 때만 후속 MSI가 돌아갑니다.) 병렬 빌드로 cab 잠금이 나면 `dotnet build ... -m:1`로 시도해 보세요.

### 앱만 빌드

```powershell
dotnet build YOLO26V10.csproj -c Release
```

### 솔루션 빌드 (앱 + Installer)

```powershell
dotnet build YOLO26V10.sln -c Release
```

생성물:

- 앱: `bin\Release\net472\YOLO26V10.exe`
- 설치 파일(MSI): `bin\Release\installer\YOLO26V10_Setup.msi`

## 실행

```powershell
.\bin\Release\net472\YOLO26V10.exe
```

## 모델 준비/재시도 정책

- 앱에서 `모델 준비` 또는 다운로드 다이얼로그를 통해 `.pt` 다운로드 + ONNX 변환을 수행합니다.
- 실패 시 `다시 시도`를 선택하면 해당 모델의 로컬 `.pt`, `.pt.part`, `.onnx`를 정리한 뒤 처음부터 다시 진행합니다.
- 다운로드는 `.part` 임시 파일에 받고 완료 후 최종 파일로 이동합니다.

## Installer 동작

- 설치 범위: per-machine
- 설치 경로: `Program Files\YOLO26V10\app`
- 바탕화면/시작 메뉴 바로가기를 생성합니다.

## 참고

- Release 빌드 중 파일 잠금 오류가 나면 실행 중인 `YOLO26V10.exe`를 종료한 뒤 다시 빌드하세요.
- `dotnet build ... -p:SkipInstaller=true`로 MSI 생성 단계를 건너뛸 수 있습니다.
