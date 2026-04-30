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

- 입력 이미지 로드, 배율(x2~x8) 선택, 결과 저장, 입력/출력 미리보기(휠 줌·스크롤)
- `ISuperResolutionEngine` 기반으로 알고리즘별 엔진을 붙일 수 있는 구조
- MVP 단계에서는 **고품질 Bicubic** 업스케일로 동작합니다(실제 신경망 추론은 다음 단계).

## 실제 모델 연동(다음 단계)

1. 사용할 모델을 **ONNX**(`.onnx`)로 준비합니다.
2. NuGet에 `Microsoft.ML.OnnxRuntime`(필요 시 GPU 패키지)을 추가합니다.
3. 알고리즘별 엔진 클래스를 구현합니다(예: `EsrganOnnxEngine`, `SwinIrOnnxEngine`, `AuraSrOnnxEngine`).
4. `SuperResolutionService`에서 선택된 알고리즘과 모델 경로에 맞게 엔진을 매핑합니다.

> **참고:** 기본 `.gitignore`에서 `*.onnx`와 `artifacts/`를 제외해 두었습니다. MSI를 저장소에 포함하려면 `.gitignore`에서 `artifacts/` 줄을 제거하세요.

## 라이선스

이 저장소에 별도 라이선스 파일이 없다면, 프로젝트 소유자 기준으로 정하시면 됩니다.
