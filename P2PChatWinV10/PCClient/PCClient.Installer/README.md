# PCClient MSI 설치 파일 빌드 가이드

이 프로젝트는 WiX Toolset을 사용하여 PCClient의 MSI 설치 파일을 생성합니다.

## 필수 요구사항

1. **Visual Studio 2022 이상**
   - .NET Desktop Development 워크로드 설치 필요

2. **WiX Toolset v3.11 이상**
   - [WiX Toolset 다운로드](https://wixtoolset.org/releases/)
   - WiX Toolset Build Tools 설치 필요
   - Visual Studio에서 WiX 프로젝트를 빌드하려면 Visual Studio용 WiX 확장도 설치 필요

3. **.NET 6.0 Runtime (Windows Desktop)**

## 설치 방법

### WiX Toolset 설치

1. https://wixtoolset.org/releases/ 에서 최신 버전 다운로드
2. `wix311.exe` (또는 최신 버전) 실행하여 설치
3. Visual Studio용 WiX 확장 설치:
   - Visual Studio에서 Extensions > Manage Extensions
   - "WiX Toolset Visual Studio Extension" 검색 및 설치
   - Visual Studio 재시작

## MSI 파일 빌드 방법

### Visual Studio에서 빌드

1. Visual Studio에서 `PCClient.sln` 솔루션 열기
2. 빌드 구성을 **Release | x86**으로 설정
3. Solution Explorer에서 **PCClient.Installer** 프로젝트 선택
4. 마우스 오른쪽 버튼 클릭 > **Build** 선택
5. 빌드가 완료되면 `PCClient\PCClient.Installer\bin\Release\` 폴더에 `PCClientInstaller.msi` 파일 생성

### 명령줄에서 빌드

```powershell
# PCClient 솔루션 디렉토리로 이동
cd c:\Home\Projects\TestSimulator\P2PChatWinV10\PCClient

# PCClient 프로젝트를 Release 모드로 빌드
msbuild PCClient\PCClient.csproj /p:Configuration=Release

# Installer 프로젝트 빌드
msbuild PCClient.Installer\PCClient.Installer.wixproj /p:Configuration=Release
```

## 설치 프로그램 기능

설치 중 사용자는 다음 옵션을 선택할 수 있습니다:

- ✅ **바탕화면 바로가기 생성** - 기본값: 선택됨
- ✅ **시작 메뉴 바로가기 생성** - 기본값: 선택됨

두 바로가기 모두 `daemon_hammer.ico` 아이콘을 사용합니다.

## 설치 위치

기본 설치 경로: `C:\Program Files\P2P Chat Client\`

## 문제 해결

### "WiX Toolset을 찾을 수 없습니다" 오류

- WiX Toolset이 올바르게 설치되었는지 확인
- 환경 변수에 WiX bin 경로가 추가되었는지 확인
- Visual Studio 재시작

### "ProjectReference를 해석할 수 없습니다" 오류

- PCClient 프로젝트가 먼저 빌드되었는지 확인
- Solution Configuration이 올바른지 확인 (Release|x86)

### DLL 파일을 찾을 수 없음

- PCClient 프로젝트를 Release 모드로 빌드했는지 확인
- NuGet 패키지가 복원되었는지 확인

## 추가 정보

- **언어**: 한국어 (Language Code: 1042)
- **설치 범위**: perMachine (모든 사용자)
- **업그레이드 코드**: 12345678-1234-1234-1234-123456789ABC
  (이 코드는 향후 업그레이드 시에도 동일하게 유지되어야 합니다)

## 배포

생성된 `PCClientInstaller.msi` 파일을 최종 사용자에게 배포하면 됩니다.
사용자는 MSI 파일을 더블클릭하여 설치를 시작할 수 있습니다.
