# HWP2DocWinV10

Windows용 아래한글(HWP/HWPX) 문서 변환 도구입니다. 한컴 SDK 없이 **Markdown** 변환을 우선 지원하며, **Word(.docx)** 와 **PDF** 내보내기도 제공합니다.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (개발·빌드용)
- **실행 시**: [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0)
- **Markdown 편집·미리보기·PDF 내보내기**: [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

### 선택 사항

| 기능 | 요구 사항 |
|------|-----------|
| Release MSI 설치 패키지 빌드 | [WiX Toolset](https://wixtoolset.org/) 6.x (`WixToolset.Sdk` NuGet으로 자동 복원) |
| UI 디자이너 편집 | Visual Studio 2022 이상 (WinForms Designer) |

## 빌드 / 실행

### Visual Studio

1. `HWP2DocWinV10.sln` 열기
2. `HWP2DocWinV10` 프로젝트를 시작 프로젝트로 설정
3. **Debug**: F5로 실행
4. **Release**: 빌드 시 MSI 설치 패키지가 자동 생성됩니다

### dotnet CLI

```powershell
cd HWP2DocWinV10
dotnet build HWP2DocWinV10.sln -c Release
dotnet run --project HWP2DocWinV10\HWP2DocWinV10.csproj -c Debug
```

Release 빌드는 경고를 오류로 처리합니다(`TreatWarningsAsErrors=true`).

## 설치 패키지 (MSI)

**Release** 구성으로 빌드하면 WiX 설치 프로젝트가 함께 실행되어 MSI가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 출력 경로 | `HWP2DocWinV10.Installer\bin\Release\ko-KR\HWP2Doc-Setup.msi` |
| 설치 위치 | `C:\Program Files\HWP2Doc\` |
| 바로 가기 | 시작 메뉴 (기본), 바탕 화면 (선택) |
| 사전 요구 | .NET 10 Desktop Runtime, WebView2 Runtime |

MSI만 별도로 빌드하려면:

```powershell
dotnet build HWP2DocWinV10.Installer\HWP2DocWinV10.Installer.wixproj -c Release
```

## 주요 기능

- **HWP / HWPX 열기**: `.hwp`, `.hwpx` 파일을 Markdown으로 변환
- **Markdown 편집 + 미리보기**: WebView2 기반 동일 UI 껍데기 — 좌측 원문 편집, 우측 렌더링 미리보기
- **문서 구조 패널**: 제목·표·목록 등을 트리로 표시, 항목 선택 시 편집창·미리보기 동시 이동
- **보기 옵션**: 문서 구조 표시/숨김, 왼쪽/오른쪽 배치, 폰트 크기(8~24 pt, 기본 10 pt)
- **내보내기**: Markdown(`.md`), Word(`.docx`), PDF(`.pdf`) — Word/PDF는 설정된 본문 글꼴 크기 반영
- **설정 저장**: 문서 구조 위치·표시 여부·글꼴 크기를 `%AppData%\HWP2DocWinV10\settings.txt`에 저장
- **오류 상세 표시**: 실패 시 상세 내용 팝업 및 클립보드 복사
- **프로그램 정보**: 메뉴 **정보** 및 툴바 **정보** 버튼 (F1)

## 화면 구성

기본 배치(문서 구조 패널은 **오른쪽**):

```
[ Markdown 편집 (WebView2) ] | [ 미리보기 (WebView2) ] | [ 문서 구조 ]
```

- **Markdown**: Markdig와 동일한 HTML/CSS 껍데기 안에서 원문을 편집합니다.
- **미리보기**: 변환된 Markdown을 HTML로 렌더링합니다.
- **문서 구조**: `보기` 메뉴에서 숨기거나 왼쪽/오른쪽으로 옮길 수 있습니다. 구조 패널을 숨기면 Markdown과 미리보기가 **50:50** 너비로 배치됩니다.

### 툴바

열기 · 변환 · Markdown/Word/PDF 내보내기 · **글꼴** 크기 선택 · 정보

## 변환 엔진

| 구성 요소 | 역할 |
|-----------|------|
| [unhwp](https://github.com/choijungyun/unhwp) (MIT) | HWP/HWPX → Markdown 변환 (번들 `Tools/unhwp/unhwp.exe`) |
| Markdig | Markdown → HTML 미리보기 |
| Microsoft WebView2 | Markdown 편집 UI, HTML 미리보기, PDF 생성 |
| DocumentFormat.OpenXml | Word(`.docx`) 내보내기 (HTML AltChunk) |

> 한컴 SDK를 사용하지 않으므로, 복잡한 머리글·번호 매기기·세밀한 레이아웃은 원본과 다를 수 있습니다.

## 아이콘 재생성

`Assets/app.ico` 및 툴바·메뉴 아이콘은 `Tools/GenerateIcon` 프로젝트로 생성합니다.

```powershell
dotnet run --project HWP2DocWinV10\Tools\GenerateIcon\GenerateIcon.csproj -- HWP2DocWinV10\Assets
```

## 문서

- [UsersGuide.md](UsersGuide.md) — 기능별 상세 사용 설명

## 프로젝트 구조

```
HWP2DocWinV10/
├── HWP2DocWinV10.sln
├── README.md
├── UsersGuide.md
├── HWP2DocWinV10/
│   ├── HWP2DocForm.cs              # 메인 UI (편집·미리보기·구조·내보내기)
│   ├── AboutDialog.cs              # 프로그램 정보
│   ├── ErrorDialog.cs              # 오류 상세 팝업
│   ├── AppUserSettings.cs          # 사용자 설정 저장/로드
│   ├── ToolbarIcons.cs             # 메뉴·툴바 아이콘
│   ├── Export/
│   │   ├── PreviewHtmlBuilder.cs   # 미리보기·편집·내보내기 HTML
│   │   ├── MarkdownDocxExporter.cs # Word 내보내기
│   │   ├── MarkdownStructureParser.cs
│   │   ├── MarkdownPreviewNormalizer.cs
│   │   └── MarkdownLineBreakRestorer.cs
│   ├── Services/
│   │   └── HwpConversionService.cs # unhwp 변환
│   ├── Assets/                     # 앱 아이콘, 툴바 아이콘
│   └── Tools/
│       ├── unhwp/                  # unhwp.exe (번들)
│       └── GenerateIcon/           # 아이콘 생성 도구
└── HWP2DocWinV10.Installer/        # WiX MSI 설치 패키지
```

## 라이선스

저장소 루트 또는 본 프로젝트의 라이선스 정책을 따릅니다.  
번들된 **unhwp**는 MIT 라이선스입니다.
