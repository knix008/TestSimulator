# RTSP Server - Video Streaming Application

## 개요
RTSP 서버는 비디오 파일을 RTSP 프로토콜을 통해 스트리밍할 수 있는 Windows 애플리케이션입니다.

## 주요 기능
- ✅ 비디오 파일 재생 (MP4, AVI, MKV, WMV, MOV)
- ✅ RTSP 서버를 통한 실시간 스트리밍
- ✅ H.264 비디오 인코딩 및 RTP 스트리밍
- ✅ AAC 오디오 인코딩 및 RTP 스트리밍
- ✅ 비디오/오디오 동시 스트리밍
- ✅ 재생/일시정지/정지 컨트롤
- ✅ Modern UI 디자인 (다크 테마)
- ✅ 실시간 로그 표시
- ✅ 인터랙티브 타임라인 슬라이더
  - 드래그하여 재생 위치 변경
  - 재생된 구간 시각적 표시 (파란색)
  - 미재생 구간 표시 (회색)
  - 부드러운 애니메이션 (떨림 없음)

## 시스템 요구사항
- Windows 10 이상
- .NET 10.0 이상
- 최소 4GB RAM
- 비디오 코덱 지원
- **FFmpeg** (비디오/오디오 스트리밍에 필수)

## FFmpeg 설치

이 애플리케이션은 RTSP 스트리밍을 위해 FFmpeg이 필요합니다.

### Chocolatey를 이용한 설치 (권장)

1. **PowerShell을 관리자 권한으로 실행**
   - 시작 메뉴에서 "PowerShell" 검색
   - 우클릭 → "관리자 권한으로 실행"

2. **Chocolatey가 설치되어 있지 않은 경우, 먼저 설치**
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

3. **FFmpeg 설치**
   ```powershell
   choco install ffmpeg
   ```

4. **설치 확인**
   ```powershell
   ffmpeg -version
   ```

### 수동 설치

1. [FFmpeg 공식 웹사이트](https://ffmpeg.org/download.html)에서 Windows 빌드 다운로드
2. 압축 해제 후 `bin` 폴더를 시스템 PATH에 추가
3. 명령 프롬프트에서 `ffmpeg -version`으로 설치 확인

## 설치 방법

### 개발 환경에서 실행
```powershell
cd RTSPServer
dotnet restore
dotnet build
dotnet run
```

### 배포판 생성
```powershell
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

## 사용 방법

1. **비디오 로드**
   - "비디오 열기" 버튼을 클릭하여 비디오 파일을 선택합니다.

2. **비디오 재생**
   - ▶ (재생) 버튼: 비디오 재생 시작
   - ⏸ (일시정지) 버튼: 재생 일시정지
   - ⏹ (정지) 버튼: 재생 정지
   - 타임라인 슬라이더를 드래그하여 원하는 위치로 이동

3. **RTSP 서버 시작**
   - "RTSP 서버 시작" 버튼을 클릭합니다.
   - 기본 주소: `rtsp://localhost:554/stream`
   - **주의**: 포트 554를 사용하려면 관리자 권한이 필요합니다.

4. **클라이언트 연결**
   - VLC Media Player나 다른 RTSP 클라이언트에서 서버 주소로 연결합니다.
   - VLC에서: 미디어 → 네트워크 스트림 열기 → `rtsp://localhost:554/stream`

## RTSP 클라이언트 연결 예제

### VLC Media Player
```
1. VLC 실행
2. 미디어 → 네트워크 스트림 열기
3. URL 입력: rtsp://localhost:554/stream
4. 재생 클릭
```

### FFmpeg
```bash
ffplay rtsp://localhost:554/stream
```

### Python (opencv-python)
```python
import cv2
cap = cv2.VideoCapture('rtsp://localhost:554/stream')
```

## 관리자 권한으로 실행
포트 554를 사용하려면 관리자 권한이 필요합니다:
1. RTSPServer.exe를 우클릭
2. "관리자 권한으로 실행" 선택

또는 포트 번호를 변경하여 일반 권한으로 실행할 수 있습니다 (예: 8554).

## 문제 해결

### FFmpeg을 찾을 수 없음
- FFmpeg이 설치되어 있는지 확인: `ffmpeg -version`
- 관리자 권한으로 PowerShell을 실행하여 `choco install ffmpeg` 실행
- 설치 후 애플리케이션 재시작

### 서버 시작 실패
- 관리자 권한으로 실행했는지 확인
- 포트 554가 이미 사용 중인지 확인
- 방화벽 설정 확인

### 비디오 재생 안됨
- 비디오 코덱이 설치되어 있는지 확인
- 지원되는 파일 형식인지 확인 (MP4, AVI, MKV, WMV, MOV)
- 파일 경로에 한글이나 특수문자가 없는지 확인

### 슬라이더가 떨리거나 반응하지 않음
- 애플리케이션을 재시작해 보세요
- 비디오 파일이 제대로 로드되었는지 확인

### 클라이언트 연결 실패
- 서버가 시작되었는지 확인
- 방화벽에서 포트가 열려있는지 확인
- 올바른 URL을 사용하고 있는지 확인

## 기술 스택
- .NET 10.0
- WPF (Windows Presentation Foundation)
  - 커스텀 UI 컨트롤 및 스타일
  - DispatcherTimer를 이용한 부드러운 UI 업데이트
- RTSP Protocol (RFC 2326)
- RTP/UDP Streaming (RFC 3550)
- FFmpeg (비디오/오디오 인코딩)
  - H.264 Video Codec (Annex-B 형식)
  - AAC Audio Codec (ADTS 형식)
- TCP/IP Networking

## 라이센스
이 프로젝트는 교육 및 개발 목적으로 제공됩니다.

## 버전 정보
- 버전: 1.0.0
- 빌드 날짜: 2026-04-25

## 개발자 정보
C# WPF 기반 RTSP 서버 애플리케이션
