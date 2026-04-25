# RTSP Server 프로젝트 시작 가이드

## 🚀 빠른 시작

### 1. 개발 환경에서 실행
```powershell
# 프로젝트 폴더로 이동
cd RTSPServer

# 빌드 및 실행
dotnet run
```

### 2. Visual Studio에서 열기
```
1. Visual Studio 2022 실행
2. RTSPServer.csproj 파일 열기
3. F5 키를 눌러 디버깅 시작
```

### 3. 배포판 생성
```powershell
# PowerShell 스크립트 실행 (권장)
.\Build.ps1

# 또는 배치 파일 실행
.\Build.bat

# 설치 프로그램 포함
.\Build.ps1 -CreateInstaller
```

## 📁 프로젝트 구조

```
RTSPServer/
│
├── App.xaml                    # WPF 애플리케이션 정의
├── App.xaml.cs                 # 애플리케이션 코드비하인드
├── MainWindow.xaml             # 메인 윈도우 UI (Modern Design)
├── MainWindow.xaml.cs          # 메인 윈도우 로직
│
├── RtspServer.cs               # RTSP 서버 구현
├── VideoStreamer.cs            # 비디오 스트리밍 로직
├── VideoPlayer.cs              # 비디오 플레이어 관리
│
├── RTSPServer.csproj           # 프로젝트 파일
├── app.manifest                # 애플리케이션 매니페스트 (UAC 설정)
│
├── Build.ps1                   # 빌드 자동화 스크립트 (PowerShell)
├── Build.bat                   # 빌드 배치 파일
├── setup.iss                   # Inno Setup 설치 스크립트
│
├── README.md                   # 사용자 가이드
├── DEPLOY.md                   # 배포 가이드
├── LICENSE.txt                 # 라이센스
└── QUICKSTART.md               # 이 파일
```

## 🎯 주요 기능

### ✅ 구현된 기능
1. **비디오 재생**
   - MP4, AVI, MKV, WMV, MOV 형식 지원
   - 재생/일시정지/정지 컨트롤
   - 타임라인 프로그레스 바

2. **RTSP 서버**
   - TCP 기반 RTSP 프로토콜 구현
   - 다중 클라이언트 연결 지원
   - OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN 메서드 지원

3. **Modern UI**
   - Dark 테마 디자인
   - 아이콘 버튼 (Segoe MDL2 Assets)
   - 실시간 로그 표시
   - Visual Studio 디자이너 편집 가능

4. **배포**
   - MSI 설치 프로그램 지원 (Inno Setup)
   - 단일 실행 파일 배포 가능
   - 자체 포함 배포 (Self-Contained)

## 🔧 개발 도구

### 필수 요구사항
- .NET 10.0 SDK
- Windows 10 이상
- Visual Studio 2022 (선택사항)

### 선택사항
- Inno Setup 6 (MSI 설치 프로그램 생성용)
- Git (버전 관리)

## 💻 사용 예제

### 비디오 로드 및 재생
```
1. 애플리케이션 실행
2. "비디오 열기" 버튼 클릭
3. 비디오 파일 선택
4. "▶ 재생" 버튼 클릭
```

### RTSP 서버 시작
```
1. 비디오 로드
2. "RTSP 서버 시작" 버튼 클릭
3. 로그에서 서버 주소 확인
   → rtsp://localhost:554/stream
```

### 클라이언트 연결 (VLC)
```
1. VLC Media Player 실행
2. 미디어 → 네트워크 스트림 열기
3. URL 입력: rtsp://localhost:554/stream
4. 재생 클릭
```

## 🐛 문제 해결

### 포트 554 사용 오류
**문제**: "서버를 시작할 수 없습니다"
**해결**: 
- 관리자 권한으로 실행
- 또는 코드에서 포트 번호 변경 (예: 8554)

### 비디오 재생 안됨
**문제**: 비디오가 로드되지 않음
**해결**:
- 지원되는 파일 형식인지 확인
- Windows Media Player 코덱 설치
- K-Lite Codec Pack 설치

### 빌드 오류
**문제**: "SDK를 찾을 수 없습니다"
**해결**:
```powershell
# .NET SDK 설치 확인
dotnet --version

# .NET 10.0 SDK 다운로드
# https://dotnet.microsoft.com/download
```

## 📚 추가 문서

- [README.md](README.md) - 전체 사용 설명서
- [DEPLOY.md](DEPLOY.md) - 상세 배포 가이드
- [LICENSE.txt](LICENSE.txt) - 라이센스 정보

## 🎓 학습 리소스

### C# & WPF
- [Microsoft WPF 문서](https://docs.microsoft.com/dotnet/desktop/wpf/)
- [C# 프로그래밍 가이드](https://docs.microsoft.com/dotnet/csharp/)

### RTSP 프로토콜
- [RFC 2326 - RTSP](https://tools.ietf.org/html/rfc2326)
- [RTSP 프로토콜 설명](https://en.wikipedia.org/wiki/Real_Time_Streaming_Protocol)

## 🆘 지원

문제가 발생하면:
1. 로그 확인 (애플리케이션 하단 로그 영역)
2. README.md의 문제 해결 섹션 참조
3. GitHub Issues에 문제 보고

## 📝 개발 노트

### 주요 클래스
- `RtspServer`: RTSP 서버 메인 클래스
- `RtspClientSession`: 클라이언트 세션 관리
- `VideoStreamer`: 비디오 스트리밍 로직
- `VideoPlayer`: 비디오 플레이어 상태 관리
- `MainWindow`: UI 및 사용자 상호작용

### 확장 가능한 기능
- H.264 인코딩/디코딩
- RTP 스트리밍
- 다중 스트림 지원
- 녹화 기능
- 네트워크 대역폭 조절

## 🔄 업데이트 계획

- [ ] H.264 비디오 코덱 지원
- [ ] RTP over UDP 구현
- [ ] 멀티캐스트 스트리밍
- [ ] 웹 기반 클라이언트
- [ ] FFmpeg 통합

---

**버전**: 1.0.0  
**최종 업데이트**: 2026-04-25  
**개발**: RTSP Server Development Team
