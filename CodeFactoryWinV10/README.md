# Code Analyzer

C# WinForms 기반 **다언어 코드 분석 도구**입니다. 지정한 디렉터리 아래 여러 프로그래밍 언어의 소스를 분석하고, 호출 관계·구조·품질 메트릭·아키텍처 인사이트를 한 화면에서 확인할 수 있습니다.

> **참고:** 여기서 말하는 "언어"는 UI 현지화가 아니라 **C#, Python, Java 등 프로그래밍 언어**를 의미합니다.

## 요구 사항

- [.NET 8 SDK](https://dotnet.microsoft.com/download) 이상
- Windows (WinForms)
- Visual Studio 2022 / 2026 (UI 디자이너·솔루션 빌드 시 권장)
- MSI 빌드: [WiX Toolset v5](https://docs.firegiant.com/wix/) (NuGet `WixToolset.Sdk`로 자동 복원)
- Git 핫스팟 분석: 분석 대상이 Git 저장소일 때 `git` 명령 사용 가능

## 주요 기능

### 분석 범위

- 루트 디렉터리 선택 후 하위 디렉터리 자동 수집
- `bin`, `obj`, `.git` 등 기본 제외 디렉터리 자동 체크
- 사용자가 체크한 디렉터리는 분석에서 제외
- **12종 프로그래밍 언어** 선택 분석

### 시각화·탐색

- 트리 형태 **호출 그래프** (좌→우 / 위→아래 레이아웃, 직선·직각·베지어 연결선)
- **클래스·상속·시퀀스·데이터 흐름** 다이어그램
- **파일·디렉터리 관계** 그래프
- **전역 변수**, **DB ERD** 뷰
- 노드 접기/펼치기, 더블클릭으로 소스·관련 뷰 이동

### 코드 품질·메트릭

- **함수 / 파일 / 타입 / 패키지 / 아키텍처** 탭으로 메트릭·인사이트 목록 표시
- Cyclomatic·인지 복잡도, Fan-in/out, MI, LCOM, DIT, Halstead, 패키지 불안정성(I) 등
- Git 변경 핫스팟, 보안 smell, 계층 위반, 순환 호출, 중복 코드 등 **아키텍처 인사이트**
- 임계값 초과 행 **경고·심각** 강조, 열 헤더 툴팁으로 지표 설명

### 분석 설정

**분석 설정...** 버튼 하나에서 다음을 통합 관리합니다.

- 분석에 **포함·제외할 검사 항목** (탭 표시, 메트릭 종류, 아키텍처 인사이트)
- 항목별 **품질 경고 임계값** (CC, MI, God file, LCOM, Git 핫스팟 등)
- **중복 코드 최소 줄 수** (기본 10줄)

설정은 `%LocalAppData%\CodeAnalyzer\settings.json`에 저장됩니다.

### 보고서·보내기

- **분석 보고서**: HTML, Markdown, Word(.docx), PDF
- **메트릭 CSV**보내기
- 분석 결과 저장·불러오기

## 분석 결과 가이드

각 지표·인사이트가 무엇을 의미하고 실무에서 어떻게 활용하는지는 아래 문서를 참고하세요.

**[CodeAnalysisGuide.md](CodeAnalysisGuide.md)** — 분석 결과 해석 가이드

## 프로젝트 구조

```
CodeFactoryWinV10/
├── CodeAnalyzer.sln              # 솔루션 (이 파일만 사용)
├── README.md
├── CodeAnalysisGuide.md          # 분석 결과 해석 가이드
├── nuget.config
├── CodeAnalyzer/                 # WinForms 앱
│   ├── Assets/AppIcon.ico
│   ├── MainForm.cs
│   ├── Controls/                 # 뷰어·다이얼로그
│   ├── Models/                   # 메트릭·설정 모델
│   └── Services/                 # 분석·보고서·설정
│       ├── Metrics/
│       ├── Duplicates/
│       └── Reports/
└── CodeAnalyzer.Setup/           # WiX MSI 설치 프로젝트
    ├── Package.wxs
    └── CodeAnalyzer.Setup.wixproj
```

## 실행

### 명령줄

```powershell
dotnet run --project CodeAnalyzer
```

### Visual Studio

1. `CodeAnalyzer.sln`을 엽니다.
2. 구성 **Debug | Any CPU**, 시작 프로젝트 **CodeAnalyzer**에서 F5로 실행합니다.

## 사용 방법

1. **루트 디렉터리**를 선택합니다.
2. **분석할 프로그래밍 언어**를 선택합니다.
3. 필요 시 **하위 디렉터리** 제외·**분석 설정...**에서 검사 항목·임계값을 조정합니다.
4. **분석 실행**을 클릭합니다.
5. 뷰 콤보에서 **호출 그래프**, **코드 메트릭**, **중복 코드** 등을 전환합니다.
6. **시작 함수**를 선택하면 호출 트리가 표시됩니다.
7. 메트릭·아키텍처 항목을 **더블클릭**하면 관련 파일·그래프로 이동합니다.
8. **파일** 메뉴에서 보고서·CSV를보냅니다.

## 코드 메트릭 뷰 요약

| 탭 | 내용 |
|----|------|
| **파일** | LOC, 복잡도 집계, TODO, 주석%, 중복·Git·보안, public API |
| **함수** | CC, 인지, 중첩, Fan-in/out, MI, Halstead, catch·async void 등 |
| **타입** | 멤버·연산, LCOM, DIT, NOC, WMC, RFC, 타입 간 의존 |
| **패키지** | Ca, Ce, 불안정성(I), 추상도(A), 거리(D) |
| **아키텍처** | 순환 호출, 결합, 핫스팟, 계층 위반, 중복 그룹 등 인사이트 목록 |

기본 경고 임계값 예: CC **15**, 인지 **15**, 중첩 **4**, Fan-out **10**, MI **&lt; 65**, TODO/100줄 **3.0**, God file **800**줄, LCOM **0.6**, 패키지 I **0.7**. 전체 목록은 [CodeAnalysisGuide.md](CodeAnalysisGuide.md)를 참고하세요.

## 분석 보고서 (HTML / Markdown / Word / PDF)

분석 실행 후 **파일 → 분석 보고서보내기**에서 형식을 선택해 저장합니다.

| 형식 | 확장자 | 비고 |
|------|--------|------|
| HTML | `.html` | 브라우저·공유용 |
| Markdown | `.md` | Git·위키·문서 파이프라인 |
| Word | `.docx` | Microsoft Word / 호환 편집기 |
| PDF | `.pdf` | 인쇄·배포용 (QuestPDF) |

포함 섹션: 개요, 품질 요약, 함수·파일·타입 메트릭(상위), 중복 코드, 순환 호출·아키텍처. 대형 프로젝트는 표 행 수가 제한됩니다.

## 중복 코드

**분석 설정...**에서 **중복 코드 그룹**의 최소 줄 수를 설정합니다 (2~200, **기본 10**).

- 줄 단위 비교 전 **공백 정규화** 및 `//` 주석 제거
- 최소 N줄 연속이 동일한 구간을 찾고, 가능한 한 길게 확장해 그룹화
- 뷰 콤보 **중복 코드**에서 그룹·파일 위치·샘플 텍스트 확인

## 지원 프로그래밍 언어

| 프로그래밍 언어 | 확장자 | 분석 방식 |
|----------------|--------|-----------|
| C# | `.cs` | Roslyn (정밀) |
| VB.NET | `.vb` | Roslyn (정밀) |
| Python | `.py` | Tree-sitter / 패턴 |
| Java | `.java` | Tree-sitter / 패턴 |
| Kotlin | `.kt`, `.kts` | 패턴 기반 |
| C / C++ | `.c`, `.h`, `.cpp`, `.hpp` … | Tree-sitter / 패턴 |
| Go | `.go` | Tree-sitter / 패턴 |
| Rust | `.rs` | Tree-sitter / 패턴 |
| Swift | `.swift` | Tree-sitter / 패턴 |
| JavaScript / TypeScript | `.js`, `.ts`, `.jsx`, `.tsx` … | Tree-sitter / 패턴 |
| Ruby | `.rb` | Tree-sitter / 패턴 |
| PHP | `.php` | Tree-sitter / 패턴 |

## MSI 설치 파일

WiX v5로 Windows 설치 패키지(`CodeAnalyzer.Setup.msi`)를 만듭니다.

```powershell
dotnet build .\CodeAnalyzer.sln -c Release
```

출력 예: `MSI ready: ...\CodeAnalyzer.Setup\bin\Release\CodeAnalyzer.Setup.msi`

| 구성 | MSI 생성 |
|------|----------|
| **Release** | 예 (자동) |
| **Debug** | 아니오 |

설치 프로젝트 상세: [CodeAnalyzer.Setup/README.md](CodeAnalyzer.Setup/README.md)

## 기술 스택

- C# / .NET 8, Windows Forms
- [Roslyn](https://github.com/dotnet/roslyn) (`Microsoft.CodeAnalysis.*`)
- [TreeSitter.DotNet](https://www.nuget.org/packages/TreeSitter.DotNet)
- [WiX Toolset v5](https://docs.firegiant.com/wix/) + `WixToolset.UI.wixext` (설치 UI)
- [QuestPDF](https://www.questpdf.com/) (PDF 보고서)

## 정밀도·한계

| 수준 | 방식 | 언어 예 |
|------|------|---------|
| **Semantic** | Roslyn 의미 분석 | C#, VB.NET |
| **Syntax** | Tree-sitter 구문 트리 | Python, Java, Go, Rust … |
| **Approximate** | 정규식·패턴 근사 | Kotlin 등 |

- 동적 호출, 매크로, 리플렉션, 조건부 컴파일은 누락될 수 있습니다.
- Fan-in/out·순환 호출은 **호출 그래프가 구축된 함수**에 한해 의미가 있습니다.
- Git 핫스팟·테스트 비율·보안 smell은 **휴리스틱**이며 CI/전용 도구를 대체하지 않습니다.
- 순환 호출은 사이클 노드로 표시되며, 해당 경로는 더 이상 확장하지 않습니다.
