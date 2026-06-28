# Image Rembg (ImageRembgWinV10)

Windows용 대화형 이미지 배경 제거 도구입니다. rembg2(RMBG-2.0)·rembg(U2Net) AI 모델과 OpenCV 기반 알고리즘을 지원하며, 영역 선택·외곽선 미리보기·배경 제거·다양한 형식 저장을 제공합니다.

## 주요 기능

- **rembg2 (RMBG-2.0)** 기본 AI 배경 분리 (사람 외 일반 사물에도 강함), **rembg (U2Net)** 도 선택 가능
- OpenCV 알고리즘: GrabCut, 색상 키잉, 윤곽선 채우기, Otsu 임계값
- **자유 선택 / 사각형 선택**을 조합해 여러 영역을 동시에 선택 → 배경 제거는 모든 선택 영역에 대해 함께 수행
- 전/배경 표시, 외곽선 미리보기 후 배경 제거
- **실행 취소 / 다시 실행** (`Ctrl+Z` / `Ctrl+Y`, 선택·표시·미리보기·결과 모두 포함)
- 이미지 열기: WebP, AVIF, PNG, GIF, JPEG, BMP, TIFF, HEIC/HEIF
- 저장: 투명 배경(PNG/WebP/GIF/TIFF) 또는 흰색 배경(JPEG/BMP)
- **한국어 / English** UI (파일 → 환경설정..., 설정 자동 저장)
- MSI 설치 프로그램 (시작 메뉴·바탕화면 바로가기 선택 가능)

## 요구 사항

- Windows 10/11 (x64)
- [.NET 10 Desktop Runtime (x64)](https://dotnet.microsoft.com/download/dotnet/10.0)
- 기본 알고리즘 **rembg2 (RMBG-2.0)** 사용 시: Hugging Face 라이선스(비상업적 용도) 동의 후 받은 `rembg2.onnx` 파일을 프로그램 내 안내 대화상자에서 선택(자동 설치, 권한 불필요) 또는 `%LOCALAPPDATA%\ImageRembgWinV10\models\rembg2.onnx`에 직접 배치해야 합니다 (게이트 모델이라 자동 다운로드/설치 프로그램에 포함 불가). 자세한 내용은 [아래 섹션](#rembg-ai-모델) 참고.
- **rembg (U2Net)** 사용 시: 첫 실행 때 **u2net.onnx** 모델 자동 다운로드 (약 176MB, 인터넷 필요)

## 빠른 시작

### 실행

```powershell
cd ImageRembgWinV10
dotnet run
```

### 빌드

```powershell
dotnet build ImageRembgWinV10.sln
```

### MSI 설치 파일 만들기

Visual Studio: **`ImageRembgWinV10.sln`** 열기 → **Release** → **솔루션 빌드**

자세한 내용은 [INSTALLER.md](INSTALLER.md)를 참고하세요.

```powershell
dotnet build ImageRembgWinV10.sln -c Release
```

또는 Installer만:

```powershell
dotnet build ImageRembgWinV10.Installer\ImageRembgWinV10.Installer.wixproj -c Release -p:Platform=x64
```

출력 (기본 MSI는 **한국어**):

```
ImageRembgWinV10.Installer\bin\x64\Release\ImageRembgWinV10.msi
```

English MSI: `ImageRembgWinV10.en-US.msi` (같은 폴더)

## 사용 방법

일반 사용자용 상세 가이드는 [UsersGuide.md](UsersGuide.md)를 참고하세요.

기본 작업 흐름:

1. 이미지 열기 (또는 창에 드래그)
2. 객체를 포함하도록 사각형 영역 선택
3. **외곽선 미리보기**로 결과 확인
4. **배경 제거** 후 PNG 등으로 저장

## 프로젝트 구조

| 경로 | 설명 |
|------|------|
| `ImageRembgForm.cs` | 메인 UI 및 작업 흐름 |
| `Controls/ImageCanvas.cs` | 이미지 표시, 줌/팬, 영역 선택 |
| `Localization/` | 한국어/English UI 문자열 |
| `Services/RembgSegmentationService.cs` | rembg U2Net ONNX 추론 |
| `Services/Rembg2SegmentationService.cs` | rembg2 (RMBG-2.0) ONNX 추론 |
| `Services/SegmentationAlgorithmRunner.cs` | OpenCV 알고리즘 (영역별 처리) |
| `PreferencesForm.cs` | 환경설정(언어) 대화상자 |
| `ProgressDialogForm.cs` | AI 추론 중 진행률 표시 |
| `Services/ImageLoaderService.cs` | 다중 형식 이미지 로드 |
| `Services/ImageSaveService.cs` | 형식별 저장 |
| `Services/UserSettingsService.cs` | 언어·출력 크기 등 사용자 설정 |
| `Assets/` | 앱 아이콘 및 모델 안내 |
| `ImageRembgWinV10.Installer/` | WiX MSI 프로젝트 |
| `ImageRembgWinV10.sln` | Visual Studio 솔루션 (App + Installer) |
| `Tools/GenerateAppIcon/` | 앱 아이콘 생성 도구 |

## rembg AI 모델

### rembg2 (RMBG-2.0) — 기본 알고리즘

- Hugging Face 게이트(라이선스 동의 필요) 모델이라 **자동 다운로드/MSI 포함이 불가능**합니다.
- [briaai/RMBG-2.0 (onnx)](https://huggingface.co/briaai/RMBG-2.0/tree/main/onnx)에서 라이선스(비상업적 용도)에 동의한 뒤 onnx 파일을 받습니다.
- rembg2 선택 시 표시되는 안내 대화상자에서 받은 파일을 선택하면 `%LOCALAPPDATA%\ImageRembgWinV10\models\rembg2.onnx`로 자동 복사됩니다 (관리자 권한 불필요, MSI 설치본에서도 동작).
- 직접 배치하려면 위 경로에 저장하거나, (개발/포터블 빌드에서만 쓰기 가능한) `Assets\Models\rembg2.onnx`에 저장해도 인식됩니다.
- 파일이 없으면 rembg2 선택 시 안내 오류 메시지가 표시됩니다. 자세한 안내는 `Assets\Models\README.txt` 참고.

### rembg (U2Net)

- 기본 모델: [u2net.onnx](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx)
- 캐시 위치: `%LOCALAPPDATA%\ImageRembgWinV10\models\u2net.onnx`
- 오프라인 사용: `Assets\Models\u2net.onnx`에 파일을 직접 배치 (MD5: `60024c5c889badc19c04ad937298a77b`)

## 아이콘 재생성

```powershell
dotnet run --project Tools\GenerateAppIcon\GenerateAppIcon.csproj -- Assets
```

## 사용자 설정

| 항목 | 위치 |
|------|------|
| 설정 파일 | `%LOCALAPPDATA%\ImageRembgWinV10\settings.json` |

언어(한국어/English), 출력 크기 모드 등이 저장됩니다.

## 기술 스택

- .NET 10, Windows Forms
- OpenCvSharp4
- Microsoft.ML.OnnxRuntime (rembg U2Net)
- SixLabors.ImageSharp (+ HEIF/AVIF)
- WiX Toolset 5 (MSI)

## 버전

`Directory.Build.props`에서 제품 버전을 관리합니다.

## 라이선스

Copyright (c) ImageRembg. All rights reserved.
