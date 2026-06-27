# HWP2DocWinV10

Windows용 아래한글(HWP/HWPX) 문서 변환 도구입니다. 한컴 SDK 없이 **Markdown** 변환을 우선 지원하며, **Word(.docx)** 와 **PDF** 보내기도 제공합니다.

## 실행 환경

- Windows 10/11 (x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (개발·빌드용)
- **실행 시**: [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0)
- **Markdown 편집·미리보기·PDF 보내기**: [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

### 선택 사항

| 기능 | 요구 사항 |
|------|-----------|
| Release MSI 설치 패키지 빌드 | [WiX Toolset](https://wixtoolset.org/) 6.x (`WixToolset.Sdk` NuGet으로 자동 복원) |
| UI 디자이너 편집 | Visual Studio 2022 이상 (WinForms Designer) |
| **rhwp** 엔진 | `Tools/rhwp/rhwp.exe` (저장소에 번들, MSI 포함) |
| **hwp2md** 엔진 (roboco / hephaex) | 각 `Tools/hwp2md-*/hwp2md.exe` (로컬 빌드·복사, MSI 미포함) |
| LLM Markdown 구조화 | [Ollama](https://ollama.com/) 로컬 실행 (`http://localhost:11434`) |

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

> **Release MSI 빌드 전**: `rhwp.exe`가 `Tools\rhwp\`에 있어야 합니다. 없으면 [rhwp 릴리스](https://github.com/edwardkim/rhwp/releases)에서 Windows용 바이너리를 받아 배치하세요.

## 설치 패키지 (MSI)

**Release** 구성으로 빌드하면 WiX 설치 프로젝트가 함께 실행되어 MSI가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 출력 경로 | `HWP2DocWinV10.Installer\bin\Release\ko-KR\HWP2Doc-Setup.msi` |
| 설치 위치 | `C:\Program Files\HWP2Doc\` |
| 바로 가기 | 시작 메뉴 (기본), 바탕 화면 (선택) |
| 사전 요구 | .NET 10 Desktop Runtime, WebView2 Runtime |
| 번들 도구 | `Tools\rhwp\rhwp.exe` (필수), `Tools\hwp2md-*\hwp2md.exe` (빌드 시 존재하면 포함) |

`hwp2md` 엔진은 Release 빌드 시 `Tools\hwp2md-*\hwp2md.exe`가 있으면 MSI에 **함께 포함**됩니다. 없으면 MSI 빌드 시 경고만 표시되고 unhwp·rhwp만 번들됩니다.

MSI만 별도로 빌드하려면:

```powershell
dotnet build HWP2DocWinV10.Installer\HWP2DocWinV10.Installer.wixproj -c Release
```

## 주요 기능

- **HWP / HWPX 열기**: `.hwp`, `.hwpx` 파일을 Markdown으로 변환
- **변환 엔진 선택**: unhwp(기본), rhwp, hwp2md(roboco-io), hwp2md(hephaex)
- **변환 옵션**: 엔진·LLM 구조화(표·제목·목록·HTML 대상 선택, 빠른 모드)
- **Markdown 편집 + 미리보기**: WebView2 기반 — 좌측 원문 편집, 우측 렌더링 미리보기
- **문서 구조 패널**: 제목·표·목록 등을 트리로 표시 (기본 **숨김**, 툴바 토글)
- **보기 옵션**: 문서 구조 표시/숨김, 왼쪽/오른쪽 배치, 폰트 크기(8~24 pt, 기본 10 pt)
- **보내기**: Markdown(`.md`), Word(`.docx`), PDF(`.pdf`) — Word/PDF는 설정된 본문 글꼴 크기 반영
- **설정 저장**: `%AppData%\HWP2DocWinV10\settings.txt`에 UI·변환 옵션 저장
- **오류 상세 표시**: 실패 시 상세 내용 팝업 및 클립보드 복사
- **프로그램 정보**: 메뉴 **정보** 및 툴바 **정보** 버튼 (F1)

## 변환 엔진

변환 옵션 대화 상자에서 **라디오 버튼**으로 엔진을 선택합니다. 모든 엔진은 unhwp로 문서 구조를 분석한 뒤, 선택 엔진으로 Markdown을 생성하고 공통 후처리를 적용합니다.

| 엔진 | 설명 | 필요 파일 |
|------|------|-----------|
| **unhwp** (기본) | NuGet 내장. 별도 설치 없음 | — |
| **rhwp** | 표·그림·본문 변환 | `Tools\rhwp\rhwp.exe` |
| **hwp2md (roboco-io)** | MIT CLI, 복잡한 표·레이아웃 비교용 | `Tools\hwp2md-roboco\hwp2md.exe` |
| **hwp2md (hephaex)** | GPL-3.0 CLI, colspan·CommonMark 표 | `Tools\hwp2md-hephaex\hwp2md.exe` |

시작 시 상태 표시줄 예: `준비 — 엔진: unhwp, rhwp, hwp2md-roboco, hwp2md-hephaex`

### hwp2md 설치 (선택)

```powershell
# roboco-io (MIT)
go install github.com/roboco-io/hwp2md/cmd/hwp2md@latest
# → %USERPROFILE%\go\bin\hwp2md.exe 를 Tools\hwp2md-roboco\ 에 복사

# hephaex (GPL-3.0) — Rust 필요
cargo install hwp2md
# → %USERPROFILE%\.cargo\bin\hwp2md.exe 를 Tools\hwp2md-hephaex\ 에 복사
```

자세한 안내: [Tools/hwp2md-roboco/README.md](Tools/hwp2md-roboco/README.md), [Tools/hwp2md-hephaex/README.md](Tools/hwp2md-hephaex/README.md)

## 변환 파이프라인

```
1. unhwp — 문서 구조(JSON) 분석, 제목 힌트 추출
2. 선택 엔진으로 Markdown 생성
     unhwp  → ToMarkdown()
     rhwp   → export-markdown + unhwp 자산 보조 추출
     hwp2md → 외부 CLI (roboco / hephaex)
3. 제목 구조 반영 (unhwp JSON 힌트)
4. 규칙 기반 후처리 — HTML 표→GFM 파이프 표, 표 정규화, 제목·줄바꿈·이미지 경로
5. LLM (옵션) — Ollama로 선택 대상(표·제목·목록·HTML) 구조화
```

| 구성 요소 | 역할 |
|-----------|------|
| [unhwp](https://www.nuget.org/packages/Unhwp) 0.5.1 (MIT) | HWP/HWPX 파싱, 구조 분석, 기본 변환, 자산 추출 |
| [rhwp](https://github.com/edwardkim/rhwp) v0.7.17 (MIT) | 표·그림·본문 Markdown (`Tools/rhwp/rhwp.exe`) |
| [roboco-io/hwp2md](https://github.com/roboco-io/hwp2md) (MIT) | 대체 Markdown CLI |
| [hephaex/hwp2md](https://github.com/hephaex/hwp2md) (GPL-3.0) | 대체 Markdown CLI |
| [Ollama](https://ollama.com/) (선택) | 로컬 LLM — Markdown 구조화 (`OllamaClient`) |
| Markdig | Markdown → HTML 미리보기 |
| Microsoft WebView2 | Markdown 편집 UI, HTML 미리보기, PDF 생성 |
| DocumentFormat.OpenXml | Word(`.docx`) 보내기 (HTML AltChunk) |

> 한컴 SDK를 사용하지 않으므로, 복잡한 머리글·번호 매기기·세밀한 레이아웃은 원본과 다를 수 있습니다.

## rhwp 바이너리

| 항목 | 내용 |
|------|------|
| 위치 | `Tools/rhwp/rhwp.exe` |
| 출처 | [edwardkim/rhwp releases](https://github.com/edwardkim/rhwp/releases) |
| 빌드 | `HWP2DocWinV10.csproj`가 출력 폴더 `Tools\` 하위로 복사 |
| MSI | `VerifyInstallerPayload`에서 필수 파일로 검증 |

자세한 내용은 [Tools/rhwp/README.md](Tools/rhwp/README.md)를 참고하세요.

## 아이콘 재생성

`Assets/app.ico` 및 툴바·메뉴 아이콘은 `Tools/GenerateIcon` 프로젝트로 생성합니다.

```powershell
dotnet run --project Tools\GenerateIcon\GenerateIcon.csproj -- HWP2DocWinV10\Assets
```

## 개발용 도구

```powershell
# unhwp 변환 결과 간단 확인
dotnet run --project Tools\VerifyUnhwp\VerifyUnhwp.csproj -c Release -- path\to\sample.hwp
```

로컬 샘플 HWP는 `Tools\test-samples\`에 두고 사용할 수 있습니다 (`.gitignore`로 제외).

## 문서

- [UsersGuide.md](UsersGuide.md) — 기능별 상세 사용 설명

## 프로젝트 구조

```
HWP2DocWinV10/
├── HWP2DocWinV10.sln
├── README.md
├── UsersGuide.md
├── HWP2DocWinV10/
│   ├── HWP2DocForm.cs              # 메인 UI (편집·미리보기·구조·보내기)
│   ├── ConvertOptionsDialog.cs     # 변환 옵션 (엔진 / LLM)
│   ├── LlmSettingsDialog.cs        # Ollama 모델·처리 대상 설정
│   ├── AboutDialog.cs              # 프로그램 정보
│   ├── AppUserSettings.cs          # 사용자 설정 저장/로드
│   ├── Export/                     # Markdown 후처리·미리보기·보내기
│   └── Services/
│       ├── HwpConversionService.cs # HWP 변환 파이프라인
│       ├── HwpConversionEngine.cs  # 엔진 목록·탐색
│       ├── Hwp2MdConversionService.cs
│       ├── RhwpConversionService.cs
│       ├── ExternalToolLocator.cs
│       └── OllamaClient.cs         # LLM 구조화
├── Tools/
│   ├── GenerateIcon/               # 앱·툴바 아이콘 생성
│   ├── VerifyUnhwp/                # unhwp 변환 검증 (개발용)
│   ├── rhwp/                       # rhwp.exe (MSI 번들)
│   ├── hwp2md-roboco/              # hwp2md roboco-io (선택)
│   ├── hwp2md-hephaex/             # hwp2md hephaex (선택)
│   └── test-samples/               # 로컬 테스트 HWP (git 제외)
└── HWP2DocWinV10.Installer/        # WiX MSI 설치 패키지
```

## 라이선스

저장소 루트 또는 본 프로젝트의 라이선스 정책을 따릅니다.

| 구성 요소 | 라이선스 |
|-----------|----------|
| HWP2DocWinV10 | (저장소 정책) |
| unhwp | MIT |
| rhwp | MIT |
| hwp2md (roboco-io) | MIT |
| hwp2md (hephaex) | GPL-3.0 |
| Markdig | BSD-2-Clause |
| DocumentFormat.OpenXml | MIT |
