# Code Analyzer

C# WinForms 기반 **다언어 코드 분석 도구**입니다. 지정한 디렉터리 아래 여러 프로그래밍 언어의 소스를 분석하고, 호출 관계·구조·품질 메트릭·아키텍처 인사이트를 한 화면에서 확인할 수 있습니다.

> **참고:** 여기서 말하는 "언어"는 UI 현지화가 아니라 **C#, Python, Java 등 프로그래밍 언어**를 의미합니다.

## 문서

| 문서 | 내용 |
|------|------|
| **[UsersGuide.md](UsersGuide.md)** | 화면·메뉴·뷰·검색·저장·보내기 등 **사용 방법** |
| **[CodeAnalysisGuide.md](CodeAnalysisGuide.md)** | 메트릭·인사이트·임계값 **해석 가이드** |
| [CodeAnalyzer.Setup/README.md](CodeAnalyzer.Setup/README.md) | MSI 설치 패키지 빌드 |

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

- 트리 형태 **호출 그래프** (좌→우 / 위→아래, 직선·직각·베지어 연결선)
- **클래스·상속·시퀀스·데이터 흐름** 다이어그램
- **파일·디렉터리 관계** 그래프
- **전역 변수** 목록·접근 함수·**접근 그래프**(함수 → 단일 전역 변수)
- **DB ERD** 뷰
- 노드 접기/펼치기, 더블클릭·검색으로 소스·관련 뷰 이동

### 코드 품질·메트릭

- **함수 / 파일 / 타입 / 패키지 / 아키텍처** 탭
- Cyclomatic·인지 복잡도, Fan-in/out, MI, LCOM, DIT, Halstead, 패키지 불안정성(I) 등
- Git 변경 핫스팟, 보안 smell, 계층 위반, 순환 호출, 중복 코드 등 **아키텍처 인사이트**
- 임계값 초과 **경고·심각** 강조, 열 헤더 툴팁

### 분석 설정

**분석 설정...**에서 검사 항목 포함·제외, 항목별 **품질 임계값**, **중복 코드 최소 줄 수**(기본 10)를 관리합니다.  
설정: `%LocalAppData%\CodeAnalyzer\settings.json`

### 보고서·보내기

- **분석 보고서**: HTML, Markdown, Word(.docx), PDF — 개요, 임계값, 품질 요약, 우선 조치, 메트릭, 중복, **전역 변수·접근 함수**, 아키텍처, 용어집
- **메트릭 CSV** (전역 변수·접근 관계 포함)
- **JSON** 분석 결과 저장·불러오기
- 현재 다이어그램 **PNG** 내보내기

## 프로젝트 구조

```
CodeFactoryWinV10/
├── CodeAnalyzer.sln
├── README.md
├── UsersGuide.md                 # 사용자 가이드
├── CodeAnalysisGuide.md          # 분석 결과 해석 가이드
├── nuget.config
├── CodeAnalyzer/                 # WinForms 앱
│   ├── Assets/AppIcon.ico
│   ├── MainForm.cs
│   ├── Controls/                 # 뷰어·다이얼로그·메뉴 아이콘
│   ├── Models/
│   └── Services/
│       ├── Metrics/
│       ├── GlobalVariables/
│       ├── Duplicates/
│       └── Reports/
└── CodeAnalyzer.Setup/           # WiX MSI
```

## 실행

```powershell
dotnet run --project CodeAnalyzer
```

Visual Studio: `CodeAnalyzer.sln` → 시작 프로젝트 **CodeAnalyzer** → **F5**

자세한 사용법: **[UsersGuide.md](UsersGuide.md)**

## 빠른 사용 흐름

1. 루트 디렉터리·언어 선택 → **분석 실행**
2. **뷰**에서 호출 그래프·코드 메트릭·전역 변수 등 전환
3. **Ctrl+F** 검색, 더블클릭으로 탐색
4. **파일** 메뉴에서 JSON 저장·보고서·CSV·이미지 보내기

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

```powershell
dotnet build .\CodeAnalyzer.sln -c Release
```

Release 구성에서 `CodeAnalyzer.Setup.msi`가 생성됩니다. Debug에서는 MSI가 만들어지지 않습니다.

## 기술 스택

- C# / .NET 8, Windows Forms
- [Roslyn](https://github.com/dotnet/roslyn)
- [TreeSitter.DotNet](https://www.nuget.org/packages/TreeSitter.DotNet)
- [WiX Toolset v5](https://docs.firegiant.com/wix/)
- [QuestPDF](https://www.questpdf.com/) (PDF 보고서)
- [DocumentFormat.OpenXml](https://www.nuget.org/packages/DocumentFormat.OpenXml) (Word 보고서)

## 정밀도·한계

| 수준 | 방식 | 언어 예 |
|------|------|---------|
| **Semantic** | Roslyn 의미 분석 | C#, VB.NET |
| **Syntax** | Tree-sitter 구문 트리 | Python, Java, Go, Rust … |
| **Approximate** | 정규식·패턴 근사 | Kotlin 등 |

- 동적 호출, 매크로, 리플렉션, 조건부 컴파일은 누락될 수 있습니다.
- Fan-in/out·순환 호출은 **호출 그래프에 포함된 함수**에 한해 의미가 있습니다.
- Git 핫스팟·테스트 비율·보안 smell은 **휴리스틱**이며 전용 도구를 대체하지 않습니다.

메트릭 해석·실무 활용: **[CodeAnalysisGuide.md](CodeAnalysisGuide.md)**
