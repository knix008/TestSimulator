# SuperResolutionV10

Visual Studio **Windows Forms 디자이너**로 GUI를 편집할 수 있는 C# Super Resolution 샘플 앱입니다.  
알고리즘은 UI에서 `SwinIR`, `ESRGAN`, `AuraSR` 중 선택할 수 있습니다.

## 요구 사항

- Windows
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (또는 Visual Studio에 포함된 SDK)
- Visual Studio 2022 이상 또는 Visual Studio 2026(WinForms 디자이너, 솔루션 빌드)

## 솔루션 구조

| 경로 | 설명 |
| ---- | ---- |
| `SuperResolutionV10.sln` | **권장** 솔루션(앱 + WiX 설치 프로젝트) |
| `SuperResolutionApp/` | WinForms 프로젝트 |
| `SuperResolutionApp/SuperResolutionForm.*` | 메인 폼(코드 + Designer) |
| `SuperResolutionInstaller/` | WiX 5 MSI 패키지 프로젝트 |

## 빌드 및 실행

```powershell
cd SuperResolutionV10
dotnet build .\SuperResolutionV10.sln -c Release
dotnet run --project .\SuperResolutionApp\SuperResolutionApp.csproj
```

Visual Studio에서 **`SuperResolutionV10.sln`**을 연 뒤 구성을 **Release**로 두고 **솔루션 빌드**하면 앱과 함께 설치 패키지가 생성됩니다.

## 설치 파일(MSI)

- **WiX Toolset 5**(`WixToolset.Sdk`)가 NuGet으로 복원되며, 별도의 WiX 전역 설치는 필요 없습니다.
- 솔루션 **Release** 빌드 시 `SuperResolutionInstaller`가 `dotnet publish`(win-x64, 프레임워크 종속) 결과를 수집해 MSI를 자동 생성합니다.
- 결과물 위치:
  - `SuperResolutionInstaller\bin\Release\SuperResolutionAppSetup.msi`
  - 동일 파일이 `artifacts\SuperResolutionAppSetup.msi`로 복사됩니다.

### Visual Studio 2026에서 설치 파일 자동 생성

1. `SuperResolutionV10.sln`을 엽니다.
2. 솔루션 구성 `Release`, 플랫폼 `Any CPU`를 선택합니다.
3. **Build > Build Solution** 실행 시 앱 + 설치 프로젝트가 함께 빌드됩니다.

> **참고:** .NET 10 SDK 기본 `.slnx`만 사용할 경우, WiX 프로젝트가 `Release|Any CPU` 구성에서 빌드 대상에서 제외될 수 있습니다. 이 저장소는 Visual Studio / `dotnet build`에서 안정적으로 MSI까지 빌드되도록 **클래식 `.sln`**을 사용합니다.

## 현재 동작

- 알고리즘 선택: `Bicubic`, `SwinIR`, `ESRGAN`, `AuraSR`
- 모델 선택 시 기본 파라미터(Scale/Runtime/Tile/Overlap) 자동 적용
- 입력/출력 미리보기: 휠 줌, 스크롤, 가운데 정렬
- 진행률 표시: ProgressBar + `%` + 상태바 상태 텍스트
- 저장: 자동 저장(기본 `Pictures`, 불가 시 `Desktop`) + 수동 저장(`JPG/PNG`)
- 실행 장치: `CPU` / `CUDA` 선택(기본 `CPU`)

## 모델 준비 자동화

앱 GUI의 **`Prepare Models`** 버튼을 누르면 아래 작업을 자동 실행합니다.

- `SwinIR` ONNX 다운로드
- `ESRGAN` ONNX 다운로드/구성
- `AuraSR` 소스 가중치 다운로드 + ONNX export
- ONNX Runtime 로딩 검증(스크립트 옵션에 따라 생략 가능)

동일 기능을 CLI로도 실행할 수 있습니다:

```powershell
python .\scripts\prepare_sr_models.py
```

옵션 예시:

```powershell
# ESRGAN을 external-data(.onnx + .data) 형태로 준비
python .\scripts\prepare_sr_models.py --esrgan-mode external

# 특정 모델만 준비
python .\scripts\prepare_sr_models.py --skip-swinir --skip-esrgan
```

> **중요:** `AuraSR`는 export 결과가 external data 파일(여러 sidecar 파일)을 생성할 수 있으므로 `models` 폴더의 관련 파일들을 함께 유지해야 합니다.

## 모델 파일과 Git

- 이 저장소는 모델 파일을 Git에 포함하지 않는 정책입니다.
- `.gitignore`에서 `models/**`, `*.onnx`, `*.engine`, `*.trt` 등을 제외합니다.
- 따라서 모델은 각 개발 환경에서 `Prepare Models` 버튼(또는 스크립트)으로 로컬에 준비해야 합니다.

## 라이선스

이 저장소에 별도 라이선스 파일이 없다면, 프로젝트 소유자 기준으로 정하시면 됩니다.
