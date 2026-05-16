# VNC Server

C#으로 구현된 Windows용 VNC 서버입니다.

## 주요 기능

### 1. VNC 서버 기능
- **RFB 프로토콜 3.8** 지원
- 실시간 화면 공유
- 원격 마우스/키보드 입력 제어
- 다중 모니터 지원
- 비밀번호 인증

### 2. System Tray 통합
- 작업 표시줄 트레이에 아이콘으로 상주
- 트레이 메뉴에서 서버 시작/중지
- 창 최소화 시 트레이로 이동
- 더블클릭으로 설정 창 열기

### 3. 설정 옵션
- **포트 설정**: VNC 서버 포트 (기본값: 5900)
- **비밀번호 보호**: 접속 시 비밀번호 요구
- **원격 입력 허용**: 클라이언트의 마우스/키보드 입력 허용
- **다중 연결**: 동시에 여러 클라이언트 접속 허용
- **자동 시작**: 프로그램 실행 시 자동으로 서버 시작
- **트레이로 최소화**: 창 닫기 시 트레이로 최소화

## 빌드 및 실행

### 빌드
```powershell
cd VNCServer
dotnet build
```

### 실행
```powershell
dotnet run
```

또는 빌드된 실행 파일:
```powershell
.\bin\Debug\net8.0-windows\VNCServer.exe
```

## 사용 방법

### 1. 서버 시작
1. 프로그램을 실행합니다
2. 필요한 설정을 구성합니다 (포트, 비밀번호 등)
3. "서버 시작" 버튼을 클릭합니다
4. 상태가 "실행 중"으로 변경됩니다

### 2. VNC 클라이언트 접속
- **주소**: `localhost:5900` (또는 설정한 포트)
- **비밀번호**: 설정 화면에서 입력한 비밀번호

추천 VNC 클라이언트:
- RealVNC Viewer
- TigerVNC
- UltraVNC Viewer
- TightVNC Viewer

### 3. System Tray 사용
- 트레이 아이콘 우클릭: 컨텍스트 메뉴
- 트레이 아이콘 더블클릭: 설정 창 열기
- 창 닫기: 트레이로 최소화 (설정 활성화 시)

## 프로젝트 구조

```
VNCServer/
├── VNCForm.cs              # 메인 UI 폼
├── VNCForm.Designer.cs     # UI 디자이너
├── Program.cs              # 진입점
├── Settings/
│   └── ServerSettings.cs   # 설정 관리
└── VNCServer/
    ├── VNCServerCore.cs    # VNC 서버 코어
    ├── VNCClient.cs        # 클라이언트 연결 처리
    ├── ScreenCapture.cs    # 화면 캡처
    └── InputSimulator.cs   # 입력 시뮬레이션
```

## 기술 스택
- **.NET 8.0**
- **Windows Forms**
- **RFB Protocol 3.8**
- **System.Drawing** (화면 캡처)
- **System.Net.Sockets** (네트워크)

## 설정 파일 위치
설정은 자동으로 저장됩니다:
```
%APPDATA%\VNCServer\settings.json
```

## 보안 고려사항

⚠️ **중요**: 이 VNC 서버는 교육/테스트 목적으로 만들어졌습니다.

- 기본 VNC 인증은 보안이 약합니다
- 인터넷에 직접 노출하지 마세요
- 신뢰할 수 있는 네트워크에서만 사용하세요
- 강력한 비밀번호를 사용하세요
- 프로덕션 환경에서는 VPN이나 SSH 터널을 사용하세요

## 향후 개선 사항
- [ ] 더 강력한 암호화 지원 (TLS/SSL)
- [ ] 성능 최적화 (압축, 인코딩 옵션)
- [ ] 클립보드 동기화
- [ ] 파일 전송
- [ ] 접속 로그 및 통계
- [ ] 화면 품질/프레임레이트 조절
- [ ] 선택 영역만 공유

## 라이선스
MIT License

## 문의
프로젝트 관련 문의나 버그 리포트는 GitHub Issues를 이용해주세요.
