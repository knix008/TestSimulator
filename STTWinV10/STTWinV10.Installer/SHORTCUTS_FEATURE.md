# MSI 설치 파일 - 바로가기 선택 기능 추가 완료

## 주요 변경사항 ✅

### 사용자 선택 가능한 바로가기
설치 시 사용자가 원하는 바로가기를 선택할 수 있도록 개선되었습니다.

**설치 화면 구성:**
1. 환영 화면
2. 라이선스 동의
3. **기능 선택 화면** ⭐ (새로 추가)
   - ✅ STTWinV10 (필수 - 주 애플리케이션)
   - ☑ 시작 메뉴 바로가기 (선택 가능, 기본 선택됨)
   - ☑ 바탕화면 바로가기 (선택 가능, 기본 선택됨)
4. 설치 준비
5. 설치 진행
6. 완료

### 아이콘 설정
- 시작 메뉴 바로가기: daemon_hammer.ico
- 바탕화면 바로가기: daemon_hammer.ico
- 프로그램 추가/제거: daemon_hammer.ico

### 기술 구현

**WiX Feature 분리:**
```xml
<!-- 주 애플리케이션 (필수) -->
<Feature Id="ProductFeature" Title="STTWinV10" Level="1">
  <ComponentGroupRef Id="ProductComponents" />
</Feature>

<!-- 시작 메뉴 바로가기 (선택 사항) -->
<Feature Id="StartMenuShortcutFeature" 
         Title="시작 메뉴 바로가기" 
         Level="1">
  <ComponentRef Id="StartMenuShortcutComponent" />
</Feature>

<!-- 바탕화면 바로가기 (선택 사항) -->
<Feature Id="DesktopShortcutFeature" 
         Title="바탕화면 바로가기" 
         Level="1">
  <ComponentRef Id="DesktopShortcutComponent" />
</Feature>
```

**UI 타입 변경:**
- 이전: `WixUI_InstallDir` (설치 경로만 선택)
- 현재: `WixUI_FeatureTree` (기능 선택 가능)

## 빌드 결과

✅ **MSI 파일**: `STTWinV10Setup.msi`  
📁 **위치**: `STTWinV10.Installer\bin\x64\Release\`  
📦 **크기**: 1.75 MB  
🕐 **빌드 시간**: 2026-05-11 오후 5:49:03

## 테스트 방법

### 1. MSI 파일 실행
```powershell
cd STTWinV10.Installer\bin\x64\Release\
.\STTWinV10Setup.msi
```

### 2. 기능 선택 화면 확인
- "기능 선택" 화면에서 트리 구조로 표시됨
- 각 기능 옆의 아이콘을 클릭하여 선택/해제 가능
- 기본적으로 모든 바로가기가 선택됨

### 3. 설치 옵션 시나리오

**시나리오 1: 모든 바로가기 설치 (기본)**
- STTWinV10: 설치됨
- 시작 메뉴 바로가기: 설치됨
- 바탕화면 바로가기: 설치됨

**시나리오 2: 시작 메뉴만**
- STTWinV10: 설치됨
- 시작 메뉴 바로가기: 설치됨
- 바탕화면 바로가기: 설치 안 함 (체크 해제)

**시나리오 3: 바탕화면만**
- STTWinV10: 설치됨
- 시작 메뉴 바로가기: 설치 안 함 (체크 해제)
- 바탕화면 바로가기: 설치됨

**시나리오 4: 바로가기 없음**
- STTWinV10: 설치됨
- 시작 메뉴 바로가기: 설치 안 함
- 바탕화면 바로가기: 설치 안 함
- (프로그램 파일 폴더에서 직접 실행 가능)

## 사용자 경험

### 설치 시
1. MSI 파일 더블클릭
2. 라이선스 동의
3. **"Customize" 또는 "기능 선택" 버튼 클릭**
4. 원하는 바로가기 선택/해제
5. "Next" → 설치 진행

### 업그레이드 시
- 기존 설치가 있으면 자동으로 업그레이드
- 바로가기 선택은 새로 지정 가능

### 제거 시
- Windows 설정 → 앱 → STTWinV10 → 제거
- 설치된 모든 바로가기 자동 제거

## 개발자를 위한 커스터마이징

### 바로가기 기본값 변경

**바탕화면 바로가기를 기본 해제:**
```xml
<Feature Id="DesktopShortcutFeature" 
         Title="바탕화면 바로가기" 
         Level="2">  <!-- Level을 2 이상으로 설정 -->
```

**시작 메뉴를 필수로 만들기:**
```xml
<Feature Id="StartMenuShortcutFeature" 
         Title="시작 메뉴 바로가기" 
         Level="1"
         AllowAdvertise="no"
         Absent="disallow">  <!-- 제거 불가 -->
```

### 아이콘 변경
`Product.wxs` 파일 수정:
```xml
<Icon Id="AppIcon.ico" SourceFile="..\STTWinV10\새아이콘.ico" />
```

### 추가 바로가기 생성
새로운 Feature와 Component 추가 가능:
- 빠른 실행 바로가기
- 특정 폴더 바로가기
- 문서 링크 등

## 배포 준비

### 1. MSI 파일 복사
```powershell
Copy-Item "STTWinV10.Installer\bin\x64\Release\STTWinV10Setup.msi" -Destination "Release\"
```

### 2. GitHub Release
1. GitHub Repository → Releases → "Create a new release"
2. Tag: v1.3.0
3. Release title: "STTWinV10 v1.3.0 - 바로가기 선택 기능 추가"
4. STTWinV10Setup.msi 업로드

### 3. 릴리스 노트 예시
```markdown
## 주요 변경사항
- 설치 시 시작 메뉴/바탕화면 바로가기를 선택할 수 있습니다
- Large-v3 모델 지원
- 인식 결과 창 높이 증가 (900px)
- daemon_hammer.ico 아이콘 적용

## 설치 방법
1. STTWinV10Setup.msi 다운로드
2. 실행 후 설치 마법사 따라가기
3. 기능 선택 화면에서 원하는 바로가기 선택

## 시스템 요구사항
- Windows 10/11 (64비트)
- .NET 8.0 Runtime
- 최소 4GB RAM (Large 모델: 8GB 권장)
```

## 문제 해결

### 기능 선택 화면이 나타나지 않음
- "Typical" 대신 "Custom" 또는 "사용자 지정" 버튼 클릭
- 또는 설치 명령줄 사용:
  ```powershell
  msiexec /i STTWinV10Setup.msi ADDLOCAL=ProductFeature,StartMenuShortcutFeature
  ```

### 바로가기가 생성되지 않음
- 설치 로그 확인:
  ```powershell
  msiexec /i STTWinV10Setup.msi /l*v install.log
  ```

### 기존 설치 제거 후 재설치
```powershell
msiexec /x STTWinV10Setup.msi
```

## 다음 단계

✅ MSI 파일 테스트 완료  
✅ 바로가기 선택 기능 검증  
✅ 문서 업데이트 완료  

**준비 완료!** 이제 MSI 파일을 배포할 수 있습니다. 🎉

---

**참고 문서:**
- [BUILD.md](BUILD.md) - 상세 빌드 가이드
- [README.md](../README.md) - 프로젝트 전체 문서
- [Product.wxs](Product.wxs) - MSI 패키지 정의
