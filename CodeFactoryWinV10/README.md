# Code Analyzer

C# WinForms 기반 코드 분석 도구입니다. 지정한 디렉터리 아래 **여러 프로그래밍 언어**의 소스 코드를 분석하고, 함수 호출 관계를 트리 형태 그래프로 시각화합니다.

> **참고:** 여기서 말하는 "언어"는 UI 현지화(한국어/영어 메뉴)가 아니라 **C#, Python, Java 등 프로그래밍 언어**를 의미합니다.

Visual Studio 디자이너에서 `MainForm` UI를 편집할 수 있습니다.

## 요구 사항

- [.NET 8 SDK](https://dotnet.microsoft.com/download) 이상
- Windows (WinForms)
- Visual Studio 2022 / 2026 (디자이너 편집 시 권장)

## 기능

- 루트 디렉터리 선택 후 하위 디렉터리 자동 수집
- `bin`, `obj`, `.git` 등 기본 제외 디렉터리 자동 체크
- 사용자가 체크한 디렉터리는 분석에서 제외
- **12종 프로그래밍 언어** 선택 분석
- Roslyn 기반 C# / VB.NET 함수 호출 관계 분석
- 기타 언어는 패턴 기반 분석
- 모든 하위 디렉터리 재귀 탐색 (bin, obj, node_modules 등 자동 제외)
- 상태바 프로그래스바로 분석 진행률 표시
- 트리 형태 호출 그래프 (좌→우 / 위→아래 레이아웃)
- 연결선 스타일: 직선, 직각, 베지어
- 노드별 접기/펼치기 (`+/-` 버튼, 전체 접기/펼치기)

## 실행

### 명령줄

```bash
dotnet run --project CodeAnalyzer
```

### Visual Studio

1. `CodeAnalyzer.sln`을 엽니다.
2. F5로 실행합니다.

## MSI 설치 파일 빌드 (Release)

이 저장소에는 WiX Toolset v5 기반 설치 프로젝트(`CodeAnalyzer.Setup`)가 포함되어 있습니다.

### Visual Studio 2026

1. 솔루션 `CodeAnalyzer.sln`을 엽니다.
2. 상단 구성(Configuration)을 `Release`로 변경합니다.
3. **Build Solution**을 실행합니다.
4. MSI 결과물을 확인합니다.

- `CodeAnalyzer.Setup/bin/Release/CodeAnalyzer.Setup.msi`

### 명령줄

```powershell
dotnet build .\CodeAnalyzer.sln -c Release
```

### 문제 해결 (Visual Studio 2026)

- MSI 설치 프로젝트는 실행 대상이 아닙니다. F5(디버그 시작)로 실행되지 않습니다.
- MSI는 반드시 Build로 생성해야 합니다.

권장 순서:

1. 시작 프로젝트는 `CodeAnalyzer`로 둡니다.
2. 구성(Configuration)을 `Release`로 선택합니다.
3. Build > Build Solution을 실행합니다.
4. `CodeAnalyzer.Setup/bin/Release/CodeAnalyzer.Setup.msi` 생성 여부를 확인합니다.

추가 확인:

- Configuration Manager에서 `CodeAnalyzer.Setup`의 Build 체크가 Release에 켜져 있어야 합니다.
- 그래도 Visual Studio에서만 실패하면, 동일 솔루션에서 명령줄 `dotnet build .\CodeAnalyzer.sln -c Release`가 성공하는지 먼저 확인하세요.

## 사용 방법

1. **루트 디렉터리**를 선택합니다.
2. **분석할 프로그래밍 언어**를 선택합니다.
3. 분석에서 **제외할 하위 디렉터리**를 체크합니다.
4. **분석 실행**을 클릭합니다.
5. **시작 함수**를 선택하면 호출 트리가 표시됩니다.
6. **레이아웃**과 **연결선** 스타일을 변경할 수 있습니다.
7. 노드 **+/-** 버튼으로 하위 호출을 접거나 펼칩니다.

## 지원 프로그래밍 언어

| 프로그래밍 언어 | 확장자 | 분석 방식 |
|----------------|--------|-----------|
| C# | `.cs` | Roslyn (정밀) |
| VB.NET | `.vb` | Roslyn (정밀) |
| Python | `.py` | 패턴 기반 |
| Java | `.java` | 패턴 기반 |
| Kotlin | `.kt`, `.kts` | 패턴 기반 |
| C / C++ | `.c`, `.h`, `.cpp`, `.hpp` … | 패턴 기반 |
| Go | `.go` | 패턴 기반 |
| Rust | `.rs` | 패턴 기반 |
| Swift | `.swift` | 패턴 기반 |
| JavaScript / TypeScript | `.js`, `.ts`, `.jsx`, `.tsx` … | 패턴 기반 |
| Ruby | `.rb` | 패턴 기반 |
| PHP | `.php` | 패턴 기반 |

## 프로젝트 구조

```
CodeFactoryWinV10/
├── CodeAnalyzer.sln
├── CodeAnalyzer/
│   ├── MainForm.cs
│   ├── MainForm.Designer.cs
│   ├── Controls/                   # 그래프 UI
│   ├── Models/
│   └── Services/
│       ├── LanguageRegistry.cs     # 지원 프로그래밍 언어 목록
│       ├── MultiLanguageCallGraphAnalyzer.cs
│       ├── CSharpCallGraphAnalyzer.cs
│       └── PatternCallGraphAnalyzer.cs
```

## 기술 스택

- C# / .NET 8
- Windows Forms
- [Roslyn](https://github.com/dotnet/roslyn) (`Microsoft.CodeAnalysis.CSharp`, `VisualBasic`)

## 참고

- **C# / VB.NET**은 Roslyn으로 비교적 정밀하게 분석합니다.
- **그 외 언어**는 패턴 기반이라 동적 호출, 매크로, 복잡한 문법은 누락될 수 있습니다.
- 순환 호출은 사이클 노드로 표시되며, 해당 경로는 더 이상 확장하지 않습니다.
