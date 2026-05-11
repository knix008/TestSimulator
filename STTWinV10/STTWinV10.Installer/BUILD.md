# MSI 설치 파일 빌드 방법

## 사전 요구사항

1. **WiX Toolset 설치**
   - [WiX v4 다운로드](https://wixtoolset.org/docs/intro/)
   - 또는 dotnet tool로 설치:
   ```powershell
   dotnet tool install --global wix
   ```

2. **Visual Studio 2022 이상**
   - Release 빌드 구성 필요

## 빌드 단계

### 1. Release 모드로 빌드

```powershell
cd d:\Home\Projects\TestSimulator\STTWinV10
dotnet build -c Release
```

### 2. MSI 설치 파일 생성

#### 방법 1: Visual Studio에서 빌드
1. Visual Studio에서 솔루션 열기
2. 빌드 구성을 "Release"로 변경
3. `STTWinV10.Installer` 프로젝트를 마우스 오른쪽 클릭
4. "빌드" 선택
5. MSI 파일이 `STTWinV10.Installer\bin\Release\` 폴더에 생성됨

#### 방법 2: 명령줄에서 빌드
```powershell
cd d:\Home\Projects\TestSimulator\STTWinV10
dotnet build STTWinV10.Installer\STTWinV10.Installer.wixproj -c Release
```

또는 전체 솔루션 빌드:
```powershell
msbuild STTWinV10.sln /p:Configuration=Release /p:Platform=x64
```

### 3. MSI 파일 위치

빌드가 완료되면 MSI 파일은 다음 위치에 생성됩니다:
```
STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi
```

파일 크기: 약 1.8MB

## 설치 파일 특징

- **버전**: 1.3.0.0
- **플랫폼**: x64 (64비트)
- **설치 위치**: `C:\Program Files\STTWinV10\`
- **바로가기 옵션** (사용자 선택 가능):
  - 시작 메뉴: `STTWinV10` 폴더 (daemon_hammer.ico 아이콘)
  - 바탕화면: `실시간 음성 인식 (STTWinV10)` (daemon_hammer.ico 아이콘)
- **포함 파일**:
  - STTWinV10.exe (주 실행 파일)
  - 모든 DLL 의존성 (NAudio, Whisper.net, System.Reactive)
  - 런타임 구성 파일
  - daemon_hammer.ico (아이콘)

## 설치 과정

설치 시 사용자는 다음을 선택할 수 있습니다:

1. **설치 경로 선택**
2. **기능 선택**:
   - ✅ STTWinV10 (필수 - 주 애플리케이션)
   - ☑ 시작 메뉴 바로가기 (선택 사항, 기본 선택됨)
   - ☑ 바탕화면 바로가기 (선택 사항, 기본 선택됨)

사용자는 원하는 바로가기만 선택하여 설치할 수 있습니다.

## 커스터마이징

### 제품 정보 변경
`STTWinV10.Installer\Product.wxs` 파일에서:
- `Manufacturer`: 제조사 이름
- `Version`: 제품 버전
- `ARPURLINFOABOUT`: 웹사이트 URL

### 라이선스 변경
`STTWinV10.Installer\License.rtf` 파일 수정

### 바로가기 기본값 변경
바로가기 기능의 기본 선택 상태를 변경하려면 `Product.wxs`에서 Feature의 `Level` 속성 수정:
- `Level="1"`: 기본 선택됨 (설치됨)
- `Level="2"` 이상: 기본 선택 안 됨 (사용자가 수동으로 선택해야 함)

예시 - 바탕화면 바로가기를 기본 선택 해제:
```xml
<Feature Id="DesktopShortcutFeature" 
         Title="바탕화면 바로가기" 
         Level="2">  <!-- 2로 변경하면 기본 선택 안 됨 -->
```

### 바로가기 아이콘 변경
`Product.wxs`의 Icon 섹션에서 아이콘 파일 경로 변경:
```xml
<Icon Id="AppIcon.ico" SourceFile="..\STTWinV10\your_icon.ico" />
```
현재는 `daemon_hammer.ico`를 사용 중입니다.

### UI 이미지 커스터마이징
다음 이미지 파일을 `STTWinV10.Installer\` 폴더에 추가:
- `DialogBackground.bmp` (493x312 픽셀)
- `Banner.bmp` (493x58 픽셀)

## 문제 해결

### WiX 도구를 찾을 수 없음
```powershell
dotnet tool install --global wix --version 4.0.5
```

### 빌드 오류: 파일을 찾을 수 없음
- Release 모드로 먼저 메인 프로젝트를 빌드했는지 확인
- 모든 DLL이 출력 폴더에 있는지 확인

### GUID 변경 필요 시
`Product.wxs`의 `UpgradeCode`는 고정값으로 유지 (업그레이드 감지용)
각 Component의 `Guid="*"`는 자동 생성됨

## 배포

생성된 MSI 파일을:
1. 사용자에게 직접 배포
2. GitHub Releases에 업로드
3. 웹사이트에서 다운로드 제공

## 제거

사용자는 다음 방법으로 제거 가능:
- Windows 설정 → 앱 및 기능 → STTWinV10 제거
- 제어판 → 프로그램 제거
- MSI 파일을 다시 실행하여 "제거" 옵션 선택
