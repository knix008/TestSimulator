# DiffMergeWinV10 MSI Installer

Visual Studio에서 **Release** 빌드로 MSI 설치 파일을 만드는 방법입니다.

## 사전 준비

1. **Visual Studio 2022/2026** 워크로드: `.NET 데스크톱 개발`
2. **HeatWave Community Edition** (WiX VS 확장, Designer 편집용 — 선택)
   - [Visual Studio Marketplace - HeatWave](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17)
3. **.NET 8 Desktop Runtime (x64)** — 설치 대상 PC에 필요 (프레임워크 종속 배포)

> WiX MSBuild SDK(`WixToolset.Sdk`)는 NuGet으로 자동 복원됩니다.  
> 명령줄/`dotnet build`는 HeatWave 없이도 동작합니다.

## Visual Studio에서 MSI 빌드

1. **`DiffMergeWinV10.sln`** 열기 (`.slnx`보다 VS 구성 관리와 MSI 빌드에 적합)
2. 구성: **Release**
3. 플랫폼: **Any CPU** 또는 **x64** (둘 다 Installer MSI 빌드 포함)
4. **빌드 → 솔루션 빌드**

> **주의:** `DiffMergeWinV10.App` 앱 프로젝트만 단독 빌드하면 EXE/DLL만 생성되고 MSI는 만들어지지 않습니다.  
> MSI가 필요하면 **솔루션 빌드** 또는 **`DiffMergeWinV10.Installer` 프로젝트**를 빌드하세요.

### MSI 출력 경로

```
installer\bin\Release\DiffMergeWinV10Setup.msi
```

## 명령줄 빌드

```powershell
cd d:\Home\Projects\TestSimulator\DIff&MergeWinV10
dotnet build DiffMergeWinV10.sln -c Release
```

또는 Installer만:

```powershell
dotnet build installer\DiffMergeWinV10.Installer.wixproj -c Release -p:Platform=x64
```

## 프로젝트 구조

| 파일 | 역할 |
|------|------|
| `installer\DiffMergeWinV10.Installer.wixproj` | WiX MSI 프로젝트 |
| `installer\Product.wxs` | 설치 UI, 바로가기, 파일 포함 |
| `DiffMergeWinV10.sln` | VS Release 빌드 시 App + Installer 함께 빌드 |

## MSI가 생성되지 않을 때

| 원인 | 해결 |
|------|------|
| 앱 프로젝트만 빌드 | **솔루션 빌드** 또는 **Installer 프로젝트** 빌드 |
| `.slnx`만 사용 | **`DiffMergeWinV10.sln`** 사용 권장 |
| 구성 관리에서 Installer 체크 해제 | **빌드 → 구성 관리자**에서 `DiffMergeWinV10.Installer` **빌드** 체크 |
| 앱 실행 중 publish 실패 | 실행 중인 `DiffMergeWinV10.App.exe` 종료 후 다시 빌드 |
| Windows Installer 서비스 오류 | 관리자 권한으로 VS 실행, 또는 `msiexec /unregister` 후 `/register` |

## 참고

- 현재 MSI는 **프레임워크 종속(win-x64)** 배포입니다.
- Installer 빌드 시 앱을 자동 `dotnet publish` 합니다 (`SkipInstaller=true`로 재귀 빌드 방지).
