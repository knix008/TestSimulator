# STTWinV10 MSI 설치 파일 빌드 완료

## 빌드 결과

✅ **MSI 설치 파일이 성공적으로 생성되었습니다!**

### 파일 정보
- **파일명**: STTWinV10Setup.msi
- **위치**: `STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi`
- **크기**: 약 1.8MB
- **버전**: 1.3.0.0
- **플랫폼**: x64 (64비트)

### 설치 특징

**설치 위치**
- 기본 경로: `C:\Program Files\STTWinV10\`

**바로가기 생성 (사용자 선택 가능)**
- 시작 메뉴: `STTWinV10` 폴더 내 (daemon_hammer.ico 아이콘)
- 바탕화면: `실시간 음성 인식 (STTWinV10)` (daemon_hammer.ico 아이콘)

설치 시 "기능 선택" 화면에서 원하는 바로가기만 선택할 수 있습니다:
- ✅ STTWinV10 (필수 - 주 애플리케이션)
- ☑ 시작 메뉴 바로가기 (선택 사항, 기본 선택됨)
- ☑ 바탕화면 바로가기 (선택 사항, 기본 선택됨)

**포함된 파일**
- STTWinV10.exe (주 실행 파일)
- NAudio 라이브러리 (7개 DLL)
- Whisper.net 라이브러리
- System.Reactive 라이브러리
- daemon_hammer.ico (애플리케이션 아이콘)
- 런타임 구성 파일

### 다음 단계

#### 1. MSI 테스트
```powershell
# MSI 파일 위치로 이동
cd STTWinV10.Installer\bin\x64\Release\

# 탐색기에서 열기
explorer .
```

#### 2. 설치 테스트
- `STTWinV10Setup.msi` 파일을 더블클릭
- 설치 마법사 따라가기
- 설치 완료 후 시작 메뉴에서 실행

#### 3. 배포 준비
- GitHub Releases에 업로드
- 웹사이트에서 다운로드 링크 제공
- 사용자에게 직접 배포

### Release 빌드 명령어

```powershell
# 전체 프로세스
cd d:\Home\Projects\TestSimulator\STTWinV10

# 1. Release 빌드
dotnet build -c Release

# 2. MSI 생성
dotnet build STTWinV10.Installer\STTWinV10.Installer.wixproj -c Release

# 3. MSI 파일 확인
explorer STTWinV10.Installer\bin\x64\Release\
```

### Visual Studio에서 빌드

1. Visual Studio 2022 열기
2. 솔루션 구성: `Release`
3. 솔루션 플랫폼: `x64`
4. 솔루션 탐색기에서 `STTWinV10.Installer` 프로젝트 마우스 오른쪽 클릭
5. "빌드" 선택
6. 출력 창에서 빌드 성공 확인

### 제거 방법

사용자는 다음 방법으로 애플리케이션 제거 가능:
- Windows 설정 → 앱 → STTWinV10 → 제거
- 제어판 → 프로그램 및 기능 → STTWinV10 → 제거
- MSI 파일 다시 실행 → "제거" 옵션 선택

### 커스터마이징

**제품 정보 변경**
`Product.wxs` 파일 수정:
- Line 4: `Manufacturer="Your Company Name"` - 회사명 변경
- Line 5: `Version="1.3.0.0"` - 버전 변경
- Line 15-16: URL 및 설명 변경

**라이선스 수정**
`License.rtf` 파일을 워드패드로 열어 수정

### 문제 해결

**빌드 오류 발생 시**
```powershell
# WiX 재설치
dotnet tool uninstall --global wix
dotnet tool install --global wix --version 4.0.5

# 솔루션 정리 후 재빌드
dotnet clean
dotnet build -c Release
```

**파일을 찾을 수 없음 오류**
- Release 빌드를 먼저 실행했는지 확인
- `STTWinV10\bin\Release\net8.0-windows\` 폴더에 모든 DLL이 있는지 확인

### 추가 정보

자세한 내용은 다음 문서 참고:
- `README.md`: 프로젝트 전체 문서
- `BUILD.md`: MSI 빌드 상세 가이드
- `Product.wxs`: MSI 패키지 정의 파일

---

**축하합니다!** 이제 STTWinV10 애플리케이션을 MSI 설치 파일로 배포할 수 있습니다. 🎉
