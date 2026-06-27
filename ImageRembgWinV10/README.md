# Image Rembg (ImageRembgWinV10)

Windows용 대화형 이미지 배경 제거 도구입니다. rembg U2Net AI 모델과 OpenCV 기반 알고리즘을 지원하며, 영역 선택·외곽선 미리보기·배경 제거·다양한 형식 저장을 제공합니다.

## 주요 기능

- **rembg (U2Net)** 기본 AI 배경 분리
- OpenCV 알고리즘: GrabCut, 색상 키잉, 윤곽선 채우기, Otsu 임계값
- 영역 선택, 전/배경 표시, 외곽선 미리보기 후 배경 제거
- 이미지 열기: WebP, AVIF, PNG, GIF, JPEG, BMP, TIFF, HEIC/HEIF
- 저장: 투명 배경(PNG/WebP/GIF/TIFF) 또는 흰색 배경(JPEG/BMP)
- **한국어 / English** UI (보기 → 언어, 설정 자동 저장)
- MSI 설치 프로그램 (시작 메뉴·바탕화면 바로가기 선택 가능)

## 요구 사항

- Windows 10/11 (x64)
- [.NET 10 Desktop Runtime (x64)](https://dotnet.microsoft.com/download/dotnet/10.0)
- rembg AI 사용 시: 첫 실행 때 **u2net.onnx** 모델 자동 다운로드 (약 176MB, 인터넷 필요)

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

출력: `ImageRembgWinV10.Installer\bin\x64\Release\en-us\ImageRembgWinV10.msi`  
(VS 구성에 따라 `ImageRembgWinV10.Installer\bin\Release\en-us\` 경로일 수 있음)

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
| `Services/SegmentationAlgorithmRunner.cs` | OpenCV 알고리즘 |
| `Services/ImageLoaderService.cs` | 다중 형식 이미지 로드 |
| `Services/ImageSaveService.cs` | 형식별 저장 |
| `Services/UserSettingsService.cs` | 언어·출력 크기 등 사용자 설정 |
| `Assets/` | 앱 아이콘 및 모델 안내 |
| `ImageRembgWinV10.Installer/` | WiX MSI 프로젝트 |
| `ImageRembgWinV10.sln` | Visual Studio 솔루션 (App + Installer) |
| `Tools/GenerateAppIcon/` | 앱 아이콘 생성 도구 |

## rembg AI 모델

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
