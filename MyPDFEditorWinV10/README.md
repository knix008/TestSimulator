# MyPDFEditorWinV10

Windows용 PDF 뷰어 및 텍스트 편집 도구입니다. PDF를 열어 페이지를 탐색하고, 텍스트를 추출·편집하며, 이미지를 선택·복사·저장한 뒤 PDF / Markdown / Word 형식으로 보낼 수 있습니다.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- Visual Studio 2022 (권장) 또는 `dotnet` CLI

### 선택 사항

| 기능 | 요구 사항 |
|------|-----------|
| Release MSI 설치 패키지 빌드 | [WiX Toolset](https://wixtoolset.org/) 6.x (`WixToolset.Sdk` NuGet으로 자동 복원) |

## 빌드 / 실행

### Visual Studio

1. `MyPDFEditorWinV10.sln` 열기
2. `MyPDFEditorWinV10` 프로젝트를 시작 프로젝트로 설정
3. **Debug**: F5로 실행
4. **Release**: 빌드 시 MSI 설치 패키지가 자동 생성됩니다

### dotnet CLI

```bash
dotnet build .\MyPDFEditorWinV10.csproj -c Debug
dotnet run --project .\MyPDFEditorWinV10.csproj -c Debug
```

명령줄에서 PDF 파일을 바로 열 수 있습니다.

```bash
dotnet run --project .\MyPDFEditorWinV10.csproj -- "C:\path\to\document.pdf"
```

## 설치 패키지 (MSI)

**Release** 구성으로 빌드하면 WiX 설치 프로젝트가 함께 실행되어 MSI가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 출력 경로 | `installer\bin\Release\ko-kr\MyPDFEditorWinV10Setup.msi` |
| 설치 위치 | `C:\Program Files\MyPDFEditorWinV10\` |
| 바로 가기 | 설치 중 **바로 가기 설정** 화면에서 시작 메뉴·바탕 화면 선택 |
| 파일 연결 | `.pdf` 파일 연결 (기능 선택 화면, 기본값: 끔) |
| 업그레이드 | 기존 설치가 있으면 제거 후 재설치 동의 확인 |
| 제거 옵션 | 작업 데이터(`%AppData%\MyPDFEditorWinV10`) 삭제 여부 선택 |

MSI만 별도로 빌드하려면:

```bash
dotnet build .\installer\MyPDFEditorWinV10.Installer.wixproj -c Release -p:Platform=x64
```

설치 패키지 빌드만 건너뛰려면 `-p:SkipInstaller=true`를 지정합니다.

## 주요 기능

- **PDF 보기**: 페이지별 탐색, 확대/축소, 너비 맞춤
- **텍스트 추출·편집**: PdfPig로 전체 텍스트 추출 후 우측 편집창에서 수정
- **이미지 작업**: PDF 위 드래그로 영역 선택 → 복사, 파일 저장, 편집창 삽입
- **페이지 이미지**: 현재 페이지 내장 이미지 추출·일괄 저장
- **이미지 저장 형식**: PNG, JPEG, GIF, WebP, AVIF
- **보내기**: PDF로 저장, Markdown으로 저장 (`.md`), Word로 저장 (`.docx`)
- **프로그램 정보**: 메뉴 **정보** 및 툴바 **정보** 버튼

## 화면 구성

- **좌측**: PDF 뷰어 (페이지 탐색, 영역 선택)
- **우측 상단**: 텍스트 편집창 (RichTextBox)
- **우측 하단**: 추출된 이미지 미리보기 패널
- **툴바**: 열기, 텍스트 가져오기, 이미지 복사/저장/삽입, 페이지 이동, 보내기, 정보

## 아이콘 재생성

`Assets\AppIcon.ico`는 `tools\GenerateAppIcon.ps1`로 생성합니다.

```powershell
powershell -ExecutionPolicy Bypass -File tools\GenerateAppIcon.ps1
```

## 문서

- [UsersGuide.md](UsersGuide.md) — 기능별 상세 사용 설명

## 프로젝트 구조

```
MyPDFEditorWinV10/
├── App/            # UI 스레드, 아이콘 제공
├── Assets/         # AppIcon.ico
├── Controls/       # PdfViewerPanel
├── Dialogs/        # 정보, 이미지 형식 선택 대화상자
├── Export/         # PDF / Markdown / Word / 이미지 보내기
├── installer/      # WiX MSI 설치 패키지 (Release 빌드)
├── Models/         # EditableDocument
├── Services/       # PDF 텍스트·이미지 추출
├── tools/          # 아이콘 생성 스크립트
├── MainForm.cs     # 메인 UI
└── Program.cs      # 진입점
```

### 주요 NuGet 의존성

| 패키지 | 용도 |
|--------|------|
| PdfiumViewer.Updated | PDF 렌더링 및 화면 표시 |
| PdfPig | 텍스트·이미지 추출 |
| PDFsharp | PDF 보내기 |
| DocumentFormat.OpenXml | Word (`.docx`) 보내기 |
| SixLabors.ImageSharp | WebP, GIF 이미지 저장 |
| NeoSolve.ImageSharp.AVIF | AVIF 이미지 저장 |

## 라이선스

저장소 루트 또는 본 프로젝트의 라이선스 정책을 따릅니다.
