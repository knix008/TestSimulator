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
| 표·그림 고품질 변환 (rhwp) | `Tools/rhwp/rhwp.exe` (저장소에 번들, MSI 포함) |
| LLM Markdown 정리 | [Ollama](https://ollama.com/) 로컬 실행 (`http://localhost:11434`) |

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
| 번들 도구 | `Tools\rhwp\rhwp.exe` (표·그림 변환) |

MSI만 별도로 빌드하려면:

```powershell
dotnet build HWP2DocWinV10.Installer\HWP2DocWinV10.Installer.wixproj -c Release
```

## 주요 기능

- **HWP / HWPX 열기**: `.hwp`, `.hwpx` 파일을 Markdown으로 변환
- **변환 옵션**: rhwp 사용 여부, LLM Markdown 정리 (Ollama) 선택
- **Markdown 편집 + 미리보기**: WebView2 기반 — 좌측 원문 편집, 우측 렌더링 미리보기
- **문서 구조 패널**: 제목·표·목록 등을 트리로 표시 (기본 **숨김**, 툴바 토글)
- **보기 옵션**: 문서 구조 표시/숨김, 왼쪽/오른쪽 배치, 폰트 크기(8~24 pt, 기본 10 pt)
- **보내기**: Markdown(`.md`), Word(`.docx`), PDF(`.pdf`) — Word/PDF는 설정된 본문 글꼴 크기 반영
- **설정 저장**: `%AppData%\HWP2DocWinV10\settings.txt`에 UI·변환 옵션 저장
- **오류 상세 표시**: 실패 시 상세 내용 팝업 및 클립보드 복사
- **프로그램 정보**: 메뉴 **정보** 및 툴바 **정보** 버튼 (F1)

## 화면 구성

기본 배치(문서 구조 패널은 **숨김**):

```
[ Markdown 편집 (WebView2) ] | [ 미리보기 (WebView2) ]
```

문서 구조 패널을 켜면 Markdown·미리보기 옆(왼쪽 또는 오른쪽)에 트리 패널이 표시됩니다.

- **Markdown**: Markdig와 동일한 HTML/CSS 껍데기 안에서 원문을 편집합니다.
- **미리보기**: 변환된 Markdown을 HTML로 렌더링합니다.
- **문서 구조**: 툴바 **문서 구조** 또는 **보기** 메뉴에서 표시/숨김·위치 변경. 숨김 시 Markdown과 미리보기가 **50:50** 너비입니다.

### 툴바

열기 · 변환 · Markdown/Word/PDF 보내기 · 글꼴 · **문서 구조** · 정보

## 변환 파이프라인

열기·변환 시 **변환 옵션** 대화 상자가 표시됩니다.

```
1. unhwp — 문서 구조(JSON) 분석, 제목 힌트 추출
2. rhwp (옵션 ON && rhwp.exe 있음)
     → export-markdown: 표·그림·본문 Markdown 생성
     → unhwp: 임베드 그림 자산 보조 추출
   rhwp OFF 또는 실패
     → unhwp ToMarkdown
3. 후처리 — 줄바꿈 복원, 표 정규화, 이미지 경로 통합
4. LLM (옵션 ON) — Ollama로 Markdown 서식 정리 (내용 유지)
```

| 구성 요소 | 역할 |
|-----------|------|
| [unhwp](https://www.nuget.org/packages/Unhwp) 0.5.1 (MIT) | HWP/HWPX 파싱, Markdown 변환(폴백), 제목 구조·자산 추출 |
| [rhwp](https://github.com/edwardkim/rhwp) v0.7.17 (MIT) | 표·그림·본문 Markdown (`Tools/rhwp/rhwp.exe`, MSI 번들) |
| [Ollama](https://ollama.com/) (선택) | 로컬 LLM — Markdown 서식 정리 (`OllamaClient`) |
| Markdig | Markdown → HTML 미리보기 |
| Microsoft WebView2 | Markdown 편집 UI, HTML 미리보기, PDF 생성 |
| DocumentFormat.OpenXml | Word(`.docx`) 보내기 (HTML AltChunk) |

시작 시 상태 표시줄: `준비 — rhwp 사용 가능` / `준비 — rhwp 없음 (unhwp만 사용)`

> 한컴 SDK를 사용하지 않으므로, 복잡한 머리글·번호 매기기·세밀한 레이아웃은 원본과 다를 수 있습니다. rhwp v0.7은 병합 셀·중첩 표 등에 한계가 있습니다.

## rhwp 바이너리

| 항목 | 내용 |
|------|------|
| 위치 | `Tools/rhwp/rhwp.exe` |
| 출처 | [edwardkim/rhwp releases](https://github.com/edwardkim/rhwp/releases) |
| 빌드 | `HWP2DocWinV10.csproj`가 출력 폴더 `Tools\rhwp\`로 복사 |
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
│   ├── ConvertOptionsDialog.cs     # 변환 옵션 (rhwp / LLM)
│   ├── LlmSettingsDialog.cs        # Ollama 모델 설정
│   ├── AboutDialog.cs              # 프로그램 정보
│   ├── ErrorDialog.cs              # 오류 상세 팝업
│   ├── AppUserSettings.cs          # 사용자 설정 저장/로드
│   ├── Export/                     # Markdown 후처리·미리보기·보내기
│   ├── Services/
│   │   ├── HwpConversionService.cs # HWP 변환 파이프라인
│   │   ├── RhwpConversionService.cs
│   │   ├── RhwpLocator.cs
│   │   └── OllamaClient.cs         # LLM 정리
│   └── Assets/                     # 앱 아이콘, 툴바 아이콘
├── Tools/
│   ├── GenerateIcon/               # 앱·툴바 아이콘 생성
│   ├── VerifyUnhwp/                # unhwp 변환 검증 (개발용)
│   └── rhwp/                       # rhwp.exe (MSI 번들)
└── HWP2DocWinV10.Installer/        # WiX MSI 설치 패키지
```

## 라이선스

저장소 루트 또는 본 프로젝트의 라이선스 정책을 따릅니다.

| 구성 요소 | 라이선스 |
|-----------|----------|
| HWP2DocWinV10 | (저장소 정책) |
| unhwp | MIT |
| rhwp | MIT |
| Markdig | BSD-2-Clause |
| DocumentFormat.OpenXml | MIT |
