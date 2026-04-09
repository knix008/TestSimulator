# PandocWin V2.0

Windows용 **Pandoc 파일 변환기**입니다. [Pandoc](https://pandoc.org/)을 사용해 Markdown, Word, HTML 등 여러 문서 형식을 서로 변환합니다.

## 요구 사항

- **OS:** Windows 10 이상 (64비트 권장)
- **.NET:** [.NET 10 SDK](https://dotnet.microsoft.com/download) (Windows 데스크톱 런타임 포함 대상: `net10.0-windows`)
- **Pandoc:** PATH에 있으면 바로 사용합니다. 없으면 앱에서 의존성 설치(다운로드·실행)를 도와 줍니다.
- **PDF 등 추가 엔진:** PDF 출력 시 LaTeX(XeLaTeX/LuaLaTeX + MiKTeX 등) 또는 wkhtmltopdf가 필요할 수 있습니다. **의존성** 창에서 안내·자동 설치를 사용할 수 있습니다.
- **MSI 빌드:** WiX **CLI**(`wix.exe`, v6 권장)가 필요합니다.

## 빌드 및 실행

저장소 루트에서:

```powershell
cd PandocWinV2.0
dotnet build
dotnet run --project PandocWinV2.0.csproj
```

Visual Studio에서는 `PandocWinV2.0.sln` 또는 `PandocWinV2.0.slnx`를 열고 시작 프로젝트로 앱 프로젝트를 선택합니다.

### 설치본(MSI) 사용 시 참고

- **변환·PDF:** 설치 경로가 `Program Files`일 때, 바로가기 **시작 위치**가 설치 폴더로 잡히면 `pandoc`/PDF 엔진이 그 폴더에 임시 파일을 쓰려다 실패할 수 있습니다. 앱에서는 **문서 폴더로 현재 디렉터리를 바꾸고**, `pandoc` 실행 시 **출력 파일이 있는 폴더**를 작업 디렉터리로 사용합니다.
- **한글 UI·EULA:** MSI는 `Package.wxs`에서 **코드페이지 949**, WiX 빌드 시 **`-culture ko-kr`**을 사용합니다. 동의 화면은 `Setup\License.rtf`(유효한 RTF `\u` 이스케이프)입니다.

## MSI 설치 패키지

설치 프로젝트(`Setup\PandocWinV2.0.Setup.csproj`)는 **`Microsoft.Build.NoTargets`** 기반이라 Visual Studio가 **일반 .NET SDK 프로젝트**처럼 로드합니다(HeatWave 불필요). 빌드 시 앱을 **Release + SingleFile**로 퍼블리시한 뒤 **WiX CLI**(`wix.exe`)로 `Package.wxs`를 컴파일합니다.

- **WiX CLI:** [WiX Toolset Command-Line Tools](https://github.com/wixtoolset/wix/releases) 설치(또는 `winget install WiXToolset.WiXCLI`). 기본 경로 `C:\Program Files\WiX Toolset v6.0\bin\wix.exe`를 자동으로 쓰고, 없으면 PATH의 `wix`를 사용합니다.
- **NuGet:** `WixToolset.UI.wixext`, `WixToolset.Util.wixext`는 설치 프로젝트에서 복원됩니다.
- **구성:** **Release**에서만 MSI를 만듭니다. Debug로 Setup 프로젝트를 빌드하면 MSI 단계는 건너뜁니다.
- **업그레이드·재설치:** 이미 같은 제품(`UpgradeCode` 동일)이 설치되어 있으면, 새 MSI 실행 시 **이전 버전을 먼저 제거한 뒤** 설치합니다(`MajorUpgrade`, `Schedule=afterInstallInitialize`, `AllowSameVersionUpgrades`). 배포할 때마다 `Setup\Package.wxs`의 `Package` **Version**을 올리는 것을 권장합니다(프로그램 추가/제거에 표시되는 제품 버전과 동일).

`.wxs` 편집 보조·IntelliSense는 [HeatWave](https://www.firegiant.com/docs/wix/heatwave/)를 쓰면 편합니다(선택).

**권장 (앱 + MSI 한 번에, Release):**

```powershell
dotnet build PandocWinV2.0.sln -c Release
```

생성 위치: `bin\Release\publish\PandocWinV2.0.msi`

**설치 프로젝트만:**

```powershell
dotnet build Setup\PandocWinV2.0.Setup.csproj -c Release
```

**배치 파일:**

```text
Setup\build_msi.bat
```

> **참고:** `dotnet build PandocWinV2.0.slnx`는 현재 SDK 동작에 따라 Setup 프로젝트를 항상 포함하지 않을 수 있습니다. CLI에서 **앱 + MSI까지 한 번에** 빌드할 때는 **`PandocWinV2.0.sln`** 사용을 권장합니다.

### 문제 해결

| 증상 | 확인 |
|------|------|
| MSI 빌드 실패, `wix` 없음 | WiX CLI 설치 후 PATH 또는 `Program Files\WiX Toolset v6.0\bin\wix.exe` |
| 설치 화면 한글 깨짐 | `Package.wxs`의 `Codepage`, `wix build -culture ko-kr`, `License.rtf` 인코딩 |
| PDF 변환 접근 거부 | 최신 빌드 사용(작업 디렉터리 처리). 출력 경로가 쓰기 가능한 폴더인지 확인 |

## 프로젝트 구조

| 경로 | 설명 |
|------|------|
| `PandocWinV2.0.sln` / `PandocWinV2.0.slnx` | 솔루션(CLI 전체 빌드는 `.sln` 권장) |
| `PandocWinV2.0.csproj` | WinForms 메인 앱(`RuntimeIdentifiers`: win-x64, MSI 퍼블리시용) |
| `PandocWin20Form.*` | 메인 UI·변환 로직 |
| `DependencyForm.cs`, `DependencyInstaller.cs` | Pandoc / MiKTeX / wkhtmltopdf 등 의존성 안내·설치 |
| `Properties\PublishProfiles\SingleFile.pubxml` | MSI에 넣기 위한 win-x64 단일 exe 퍼블리시 설정 |
| `Setup\PandocWinV2.0.Setup.csproj` | MSI 빌드용 메타 프로젝트(NoTargets + WiX CLI) |
| `Setup\PandocWinV2.0.Setup.targets` | 퍼블리시 및 `wix build` 호출 |
| `Setup\Package.wxs` | 설치 패키지 정의 |
| `Setup\License.rtf` | 설치 마법사 라이선스 텍스트 |
| `Setup\build_msi.bat` | MSI 빌드용 배치 |

## 지원 형식 (요약)

입력 예: Markdown, HTML, Word(docx), LaTeX, EPUB, ODT, reStructuredText 등.  
출력 예: Word, PDF, HTML, Markdown, LaTeX, EPUB, ODT, PPTX, RTF, TXT 등.  
실제 변환 가능 여부는 설치된 Pandoc·엔진에 따라 달라집니다.

## 라이선스

이 저장소에 별도의 `LICENSE` 파일이 없다면, 사용·배포 조건은 저장소 소유자의 정책을 따릅니다. WiX·Pandoc·MiKTeX 등 서드파티 도구는 각각의 라이선스를 따릅니다.
