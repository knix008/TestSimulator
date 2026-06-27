# Image Rembg MSI Installer

Visual Studio 2026에서 Release 빌드로 MSI 설치 파일을 만드는 방법입니다.

## 사전 준비

1. **Visual Studio 2026** 워크로드
   - `.NET 데스크톱 개발`
2. **HeatWave Community Edition** (WiX용 VS 확장)
   - [Visual Studio Marketplace - HeatWave](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17)
   - VS 2026 / 2022 공용 확장
3. **.NET 10 Desktop Runtime (x64)** — 설치 대상 PC에 필요 (프레임워크 종속 배포)

> WiX MSBuild SDK(`WixToolset.Sdk`)는 NuGet으로 자동 복원되므로 WiX를 별도 설치하지 않아도 명령줄/`dotnet build`는 동작합니다.  
> Visual Studio Designer에서 `.wixproj`를 편집하려면 **HeatWave** 설치를 권장합니다.

## Visual Studio 2026에서 MSI 빌드

1. `ImageRembgWinV10.sln` 또는 `ImageRembgWinV10.slnx` 열기
2. 구성: **Release**
3. 플랫폼: **x64** (Installer 프로젝트 기준)
4. 솔루션 탐색기에서 **`ImageRembgWinV10.Installer`** 프로젝트 선택
5. **빌드 → ImageRembgWinV10.Installer 빌드**

### MSI 출력 경로

```
ImageRembgWinV10.Installer\bin\x64\Release\en-us\ImageRembgWinV10.msi
```

## 명령줄 빌드

```powershell
cd d:\Home\Projects\TestSimulator\ImageRembgWinV10
dotnet build ImageRembgWinV10.Installer\ImageRembgWinV10.Installer.wixproj -c Release -p:Platform=x64
```

## 프로젝트 구조

| 파일 | 역할 |
|------|------|
| `ImageRembgWinV10.Installer\ImageRembgWinV10.Installer.wixproj` | WiX MSI 프로젝트 |
| `ImageRembgWinV10.Installer\Package.wxs` | 설치 UI, 바로가기, .NET 런타임 검사 |
| `Properties\PublishProfiles\Installer.pubxml` | Release publish 설정 (win-x64) |
| `Directory.Build.props` | 제품명/버전/제조사 공통 메타데이터 |

## 설치 프로그램 기능

- `Program Files\Image Rembg`에 앱 배포
- 설치 중 **기능 선택** 화면에서 시작 메뉴 / 바탕화면 바로가기 생성 여부 선택 (기본: 둘 다 선택)
- 바로가기 및 실행 파일에 `Assets\AppIcon.ico` 아이콘 적용
- .NET 10 Desktop Runtime (x64) 사전 검사
- 이전 버전 자동 업그레이드 (MajorUpgrade)

## 버전 변경

`Directory.Build.props`의 `Version`, `AssemblyVersion`을 수정한 뒤 Installer 프로젝트를 다시 Release\|x64로 빌드합니다.

## 참고

- 현재 MSI는 **프레임워크 종속(win-x64)** 배포입니다. 대상 PC에 .NET 10 Desktop Runtime이 없으면 설치 마법사에서 안내합니다.
- 완전 독립 배포(런타임 포함)가 필요하면 `Properties\PublishProfiles\Installer.pubxml`에서 `<SelfContained>true</SelfContained>`로 변경하고 MSI 크기 증가를 감안하세요.
