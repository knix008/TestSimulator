# 한국어 OCR (OCRWinV10)

**한국어 특화** Windows OCR 프로그램입니다. 한글·숫자·영문이 섞인 문서와 손글씨를 인식하며, PaddleOCR은 **오프라인(모델 내장)** 으로 동작합니다.

**사용 방법:** [UsersGuide.md](UsersGuide.md)

## 주요 기능

- **다중 OCR 엔진** — PaddleOCR(권장) / EasyOCR / Windows OCR / Tesseract
- **한국어 + 영어** — 한글 우선, 영문 병행 인식
- **손글씨** — 3종 전처리 + 다중 패스 OCR
- **모던 UI** — 3패널(원본 | 박스 | 텍스트), 텍스트 결과 하단에 **복사·저장** 버튼
- **결과 저장** — 텍스트 + 박스 이미지(원본 확장자, PDF 원본은 PNG)
- **설정 자동 저장** — 종료 시 엔진·전처리·창 크기·분할 위치 등 저장, 다음 실행 시 복원
- **MSI 설치** — 바탕화면·시작 메뉴 바로가기·프로그램 추가/제거에 앱 아이콘

## 지원 파일 형식

| 형식 | 확장자 |
|------|--------|
| 이미지 | .jpg, .jpeg, .png, .bmp, .tiff, .tif, .gif, .webp, .avif, .heic, .heif 등 |
| PDF | .pdf (페이지별 렌더링) |

## 시스템 요구사항

- Windows 10 (Build 17763) 이상 또는 Windows 11
- .NET 10 Runtime (개발 실행 시; **MSI는 self-contained** 포함)
- Windows OCR 사용 시 **한국어 언어팩** 권장

## 사용법

1. **파일 열기** — `열기` 또는 드래그 앤 드롭 (`Ctrl+O`)
2. **OCR 엔진** — `PaddleOCR (한·영, 권장)` 등 선택
3. **전처리** — `자동` / `손글씨` / `없음`
4. **OCR 실행** — `F5` (EasyOCR·Tesseract 등 미설치 엔진은 설치 팝업)
5. **결과** — 텍스트 패널 아래 **복사**, **텍스트 저장**, **박스 이미지**, **모두 저장**, **지우기**
   - 단축키: 텍스트 `Ctrl+S`, 박스 `Ctrl+Shift+S`, 둘 다 `Ctrl+Shift+A` (파일 메뉴)

### 설정·데이터 경로

| 항목 | 경로 |
|------|------|
| 사용자 설정 | `%AppData%\OCRWinV10\settings.json` |
| PaddleOCR 한국어 모델 (앱 번들) | `{설치폴더}\models\paddle\korean_PP-OCRv5_mobile_rec\` |
| PaddleOCR 캐시 (다운로드 시) | `%LocalAppData%\OCRWinV10\engines\paddle\korean_PP-OCRv5_mobile_rec\` |
| EasyOCR / Tesseract 모델 | `%LocalAppData%\OCRWinV10\engines\` |

PaddleOCR 한국어 모델은 저장소·MSI에 **포함**되어 있어 일반적으로 추가 다운로드가 필요 없습니다.

## 빌드 (Visual Studio 2022 / 2026)

### 사전 준비

```powershell
dotnet tool install --global wix
```

WiX **7.x** SDK (`Setup/OCRWinV10Setup.wixproj`). [WiX Toolset VS Extension](https://marketplace.visualstudio.com/items?itemName=WixToolset.WixToolsetVisualStudio2022Extension) 설치를 권장합니다.

### Debug

```powershell
dotnet build OCRWinV10.sln -c Debug
dotnet run --project OCRWinV10/OCRWinV10.csproj
```

### Release + MSI

MSI는 **Setup 프로젝트 한 곳**에서만 만듭니다 (`dotnet publish` self-contained win-x64 → WiX). 앱 프로젝트 Release 빌드와 MSI 생성을 분리해 중복 publish/MSI를 막습니다.

Visual Studio **Release** 구성 → **솔루션 빌드** (`OCRWinV10.sln`) 시 `OCRWinV10Setup`만 빌드됩니다. 앱만 실행·디버그할 때는 `OCRWinV10` 프로젝트를 개별 빌드하세요.

명령줄 (솔루션):

```powershell
dotnet build OCRWinV10.sln -c Release
```

MSI만 필요할 때:

```powershell
dotnet build Setup/OCRWinV10Setup.wixproj -c Release
```

**MSI 출력:** `Setup/bin/Release/OCRWinV10Setup.msi`

### 설치 패키지

- 설치 경로: `C:\Program Files\한국어 OCR\`
- 시작 메뉴·바탕화면 바로가기 (앱 아이콘)
- 설정 → 앱 → 프로그램 추가/제거에 제품 아이콘 (`ARPPRODUCTICON`)

## 프로젝트 구조

```
OCRWinV10/
├── OCRWinV10.sln
├── OCRWinV10/
│   ├── OCRWinV10.csproj
│   ├── app.ico
│   ├── models/paddle/korean_PP-OCRv5_mobile_rec/   # 한국어 Paddle 모델 (번들)
│   ├── OCRForm.cs / OCRForm.Designer.cs
│   ├── Ocr/
│   │   ├── OcrService.cs
│   │   ├── PaddleKoreanModelStore.cs
│   │   ├── EngineDownloadHelper.cs
│   │   └── Providers/          # Paddle, EasyOCR, Windows, Tesseract
│   ├── Ui/
│   ├── ImageFileLoader.cs
│   ├── ImagePreprocessor.cs
│   ├── ResultSaveHelper.cs
│   └── SettingsManager.cs
├── Setup/
│   ├── OCRWinV10Setup.wixproj
│   ├── Product.wxs
│   └── Payload.wxs
├── create-icon.ps1
├── UsersGuide.md
├── .gitignore
└── README.md
```

## OCR 엔진 요약

| 엔진 | 설치 | 비고 |
|------|------|------|
| PaddleOCR | 앱에 포함 | 한·영 V5, 권장 |
| EasyOCR | 최초 ~100MB 다운로드 | ko+en |
| Windows OCR | OS 내장 | 한국어 언어팩 권장 |
| Tesseract | tessdata 다운로드 | kor+eng |

## MMOCR

[MMOCR](https://github.com/open-mmlab/mmocr)은 .NET NuGet만으로 통합하기 어렵습니다. [MMDeploy](https://github.com/open-mmlab/mmdeploy) SDK와 변환 모델이 필요합니다.

## 라이선스

MIT License
