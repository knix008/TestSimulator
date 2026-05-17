# XManWindowsV10 개발 가이드

## 아키텍처 개요

### 주요 컴포넌트

1. **XManServer**: 메인 서버 클래스
   - 전체 시스템 초기화 및 관리
   - 메인 루프 실행

2. **NetworkServer**: 네트워크 통신 담당
   - TCP/IP 소켓 서버
   - X11 클라이언트 연결 수락
   - 포트: 6000 + display_number

3. **X11Protocol**: X11 프로토콜 처리
   - X11 메시지 파싱
   - 요청 처리 및 응답 생성
   - 이벤트 전송

4. **WindowManager**: 윈도우 관리
   - X Window를 Win32 Window로 매핑
   - 윈도우 생성, 삭제, 매핑
   - 이벤트 처리

5. **DirectXRenderer**: 렌더링 엔진
   - DirectX 11 기반
   - 그래픽 명령 실행
   - 하드웨어 가속

## X11 프로토콜 흐름

### 연결 설정

1. 클라이언트가 연결 요청
2. 서버가 프로토콜 버전 확인
3. 성공 응답 + 서버 정보 전송

### 일반 요청

1. 클라이언트가 요청 전송 (예: CreateWindow)
2. 서버가 요청 파싱
3. 해당 작업 수행 (윈도우 생성 등)
4. 필요시 응답 전송

### 이벤트

1. 서버에서 이벤트 발생 (키보드, 마우스 등)
2. X11 이벤트 형식으로 변환
3. 클라이언트에 전송

## 구현해야 할 주요 기능

### 현재 구현된 기능

✅ 네트워크 서버 (TCP/IP)
✅ 기본 X11 연결 설정
✅ DirectX 초기화
✅ 윈도우 관리 기본 구조

### 구현 필요 기능

❌ X11 프로토콜 완전 구현

- CreateWindow, MapWindow, UnmapWindow
- ConfigureWindow
- CreateGC, ChangeGC
- PolyFillRectangle, PolyLine
- ImageText8, ImageText16
- PutImage, GetImage
- 키보드/마우스 이벤트

❌ DirectX 렌더링 구현

- 사각형, 선, 텍스트 그리기
- 이미지 렌더링
- 폰트 지원

❌ 리소스 관리

- Pixmap
- GC (Graphics Context)
- Colormap
- Cursor

## 디버깅 팁

### 로그 확인

서버는 stdout에 로그를 출력합니다:

- 클라이언트 연결/해제
- X11 요청 처리
- 윈도우 생성/삭제

### Wireshark로 패킷 분석

X11 프로토콜을 Wireshark로 캡처하여 분석 가능:

```
tcp.port == 6000
```

### Xephyr 참고

기존 X Server인 Xephyr 소스 코드 참고:

- https://gitlab.freedesktop.org/xorg/xserver

## 성능 최적화

1. **버퍼링**: 여러 그리기 명령을 모아서 한번에 실행
2. **캐싱**: 자주 사용되는 리소스 캐싱
3. **멀티스레딩**: 렌더링과 네트워크를 분리
4. **DirectX 최적화**: 배치 렌더링, 인스턴싱 등

## 테스트 방법

### 로컬 테스트

```bash
# 서버 시작
XManWindowsV10.exe 0

# Linux/WSL에서
export DISPLAY=localhost:0
xterm
```

### 원격 테스트

```bash
# Windows에서 서버 시작
XManWindowsV10.exe 0

# Linux 머신에서
export DISPLAY=192.168.1.100:0
xclock
```

## 참고 자료

- X Window System Protocol: https://www.x.org/releases/X11R7.7/doc/xproto/x11protocol.html
- Xlib Manual: https://www.x.org/releases/current/doc/libX11/libX11/libX11.html
- DirectX 11 Documentation: https://docs.microsoft.com/en-us/windows/win32/direct3d11/
