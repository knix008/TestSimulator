# DiffMergeWinV10 MSI Installer

Visual Studio에서 **Release** 빌드로 MSI 설치 파일을 만드는 방법입니다.

## 사전 준비

1. **Visual Studio 2022/2026** 워크로드: `.NET 데스크톱 개발`
2. **HeatWave Community Edition** (선택 — `Product.wxs` Designer/IntelliSense용)
   - [Visual Studio Marketplace - HeatWave](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17)
3. **.NET 8 Desktop Runtime (x64)** — 설치 대상 PC에 필요 (프레임워크 종속 배포)

> WiX MSBuild SDK(`WixToolset.Sdk`)는 NuGet으로 자동 복원됩니다.  
> MSI 빌드는 HeatWave 없이도 동작합니다.

## Visual Studio에서 MSI 빌드

1. **`DiffMergeWinV10.sln`** 열기
2. 구성: **Release** (Debug에서는 MSI가 만들어지지 않음)
3. 플랫폼: **Any CPU** 또는 **x64**
4. **빌드 → 솔루션 빌드** 또는 **`DiffMergeWinV10.App` 빌드**

Release로 App 프로젝트가 빌드되면 WiX MSI가 **자동으로** 생성됩니다.

### MSI 출력 경로

```
installer\bin\Release\DiffMergeWinV10Setup.msi
```

> **참고:** MSI는 `DiffMergeWinV10.App\bin\...` 폴더가 아니라 위 **`installer\bin\Release\`** 경로에 생성됩니다.

## 명령줄 빌드

```powershell
cd c:\Home\Projects\TestSimulator\DIff&MergeWinV10
dotnet build DiffMergeWinV10.sln -c Release
```

또는 Installer만:

```powershell
dotnet build installer\DiffMergeWinV10.Installer.wixproj -c Release -p:Platform=x64
```

## 프로젝트 구조

| 파일 | 역할 |
|------|------|
| `installer\DiffMergeWinV10.Installer.wixproj` | WiX MSI 프로젝트 (App Release 빌드 시 자동 호출) |
| `installer\Product.wxs` | 설치 UI, 바로가기, 파일 포함 |
| `DiffMergeWinV10.sln` | App 프로젝트 — Release 빌드 시 MSI 자동 생성 |

## MSI가 생성되지 않을 때

| 원인 | 해결 |
|------|------|
| **Debug** 구성으로 빌드 | 툴바 구성을 **Release**로 변경 |
| MSI를 App 출력 폴더에서 찾음 | **`installer\bin\Release\DiffMergeWinV10Setup.msi`** 확인 |
| `.slnx`만 사용 | **`DiffMergeWinV10.sln`** 사용 권장 |
| 앱 실행 중 publish 실패 | 실행 중인 `DiffMergeWinV10.App.exe` 종료 후 다시 빌드 |
| Windows Installer 서비스 오류 | 관리자 권한으로 VS 실행, 또는 `msiexec /unregister` 후 `/register` |

## 참고

- 현재 MSI는 **프레임워크 종속(win-x64)** 배포입니다.
- Installer 빌드 시 앱을 자동 `dotnet publish` 합니다 (`SkipInstaller=true`로 재귀 빌드 방지).
