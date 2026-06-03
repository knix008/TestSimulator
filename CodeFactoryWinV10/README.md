# Code Analyzer

C# WinForms 기반 코드 분석 도구입니다. 지정한 디렉터리 아래 **여러 프로그래밍 언어**의 소스 코드를 분석하고, 함수 호출 관계를 트리 형태 그래프로 시각화합니다.

> **참고:** 여기서 말하는 "언어"는 UI 현지화가 아니라 **C#, Python, Java 등 프로그래밍 언어**를 의미합니다.

## 요구 사항

- [.NET 8 SDK](https://dotnet.microsoft.com/download) 이상
- Windows (WinForms)
- Visual Studio 2022 / 2026 (UI 디자이너·솔루션 빌드 시 권장)
- MSI 빌드: [WiX Toolset v5](https://docs.firegiant.com/wix/) (NuGet `WixToolset.Sdk`로 자동 복원)

## 기능

- 루트 디렉터리 선택 후 하위 디렉터리 자동 수집
- `bin`, `obj`, `.git` 등 기본 제외 디렉터리 자동 체크
- 사용자가 체크한 디렉터리는 분석에서 제외
- **12종 프로그래밍 언어** 선택 분석
- Roslyn 기반 C# / VB.NET 함수 호출 관계 분석
- Tree-sitter·패턴 기반 기타 언어 분석
- 트리 형태 호출 그래프 (좌→우 / 위→아래 레이아웃)
- 연결선 스타일: 직선, 직각, 베지어
- 노드별 접기/펼치기, UML·시퀀스·파일 관계 다이어그램

## 프로젝트 구조

```
CodeFactoryWinV10/
├── CodeAnalyzer.sln          # 솔루션 (이 파일만 사용)
├── nuget.config              # NuGet 소스 (nuget.org)
├── CodeAnalyzer/             # WinForms 앱
│   ├── Assets/AppIcon.ico    # 앱·설치 아이콘
│   ├── MainForm.cs
│   ├── Controls/
│   ├── Models/
│   └── Services/
└── CodeAnalyzer.Setup/       # WiX MSI 설치 프로젝트
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

## MSI 설치 파일

WiX v5로 Windows 설치 패키지(`CodeAnalyzer.Setup.msi`)를 만듭니다.

### 빌드

**Release | Any CPU**에서 `CodeAnalyzer` 또는 솔루션을 빌드하면 MSI가 생성됩니다.

```powershell
dotnet build .\CodeAnalyzer.sln -c Release
```

출력 예: `MSI ready: ...\CodeAnalyzer.Setup\bin\Release\CodeAnalyzer.Setup.msi`

| 구성 | MSI 생성 |
|------|----------|
| **Release** | 예 (자동) |
| **Debug** | 아니오 |

### 설치 시 동작

- **기능 선택** 화면에서 다음을 각각 선택할 수 있습니다.
  - 바탕 화면 바로 가기 만들기
  - 시작 메뉴 바로 가기 만들기
- `AppIcon.ico`가 바로 가기·**프로그램 추가/제거** 아이콘에 사용됩니다.
- 제거 시 선택했던 바로 가기가 함께 삭제됩니다.

### Visual Studio에서 MSI가 안 보일 때

1. 구성이 **Release | Any CPU**인지 확인합니다 (Debug에서는 MSI를 만들지 않습니다).
2. **빌드 → 솔루션 빌드** 또는 **CodeAnalyzer** 프로젝트 빌드를 실행합니다 (F5만으로는 MSI가 생기지 않습니다).
3. 출력 창에서 `MSI ready:` / `MSI created:` 메시지를 확인합니다.
4. `WixToolset.Sdk` / `WixToolset.UI.wixext` 복원 오류가 있으면 NuGet에서 `nuget.org`가 활성화되어 있는지 확인합니다.

설치 프로젝트 상세: [CodeAnalyzer.Setup/README.md](CodeAnalyzer.Setup/README.md)

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

## 기술 스택

- C# / .NET 8, Windows Forms
- [Roslyn](https://github.com/dotnet/roslyn) (`Microsoft.CodeAnalysis.*`)
- [TreeSitter.DotNet](https://www.nuget.org/packages/TreeSitter.DotNet)
- [WiX Toolset v5](https://docs.firegiant.com/wix/) + `WixToolset.UI.wixext` (설치 UI)

## 참고

- **C# / VB.NET**은 Roslyn으로 비교적 정밀하게 분석합니다.
- **그 외 언어**는 Tree-sitter·패턴 기반이라 동적 호출·매크로 등은 누락될 수 있습니다.
- 순환 호출은 사이클 노드로 표시되며, 해당 경로는 더 이상 확장하지 않습니다.
