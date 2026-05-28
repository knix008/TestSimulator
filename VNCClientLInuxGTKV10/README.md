# VNC GTK Client

Linux용 GTK3 기반 VNC (RFB 프로토콜) 클라이언트입니다.  
C11 / POSIX로 작성되었으며 GTK에 의존하지 않는 순수 C 코어 계층을 포함합니다.

---

## 소스 계층 구조

```
src/
├── vnc_types.h            RFB 프로토콜 상수·구조체
│
├── vnc_core.h / .c        ── [core layer] ──────────────────────
│                          순수 POSIX C 구현
│                          • RFB 3.3 / 3.7 / 3.8 프로토콜
│                          • VNC 인증 (DES, libgcrypt)
│                          • 인코딩: Raw · CopyRect · RRE · Hextile
│                          • pthreads 기반 비동기 연결
│                          의존성: libgcrypt, pthreads, POSIX sockets
│
├── profile.h / .c         사용자 프로필 저장 (GKeyFile)
│
├── vnc_client.h / .c      ── [adapter layer] ───────────────────
│                          VncCore를 GLib 이벤트 루프에 연결
│                          • VNC 스레드 콜백 → g_idle_add() 마샬링
│                          의존성: glib-2.0 (GTK 불필요)
│
├── vnc_display.h / .c     ── [UI layer] ─────────────────────────
├── connection_dialog.h/.c GTK3 위젯 및 다이얼로그
├── main_window.h / .c     의존성: gtk+-3.0
└── main.c
```

## 기능

| 항목 | 내용 |
|---|---|
| 프로토콜 | RFB 3.3 / 3.7 / 3.8 |
| 보안 | None, VNC Authentication (DES) |
| 인코딩 | Raw, CopyRect, RRE, Hextile |
| 프로필 | `~/.config/vnc-gtk-client/profiles.ini` |
| 화면 스케일 | None (1:1) / Fit (비율 유지) / Fill |
| 입력 | 키보드, 마우스, 스크롤 |
| 특수 키 | Ctrl+Alt+Del 전송 |
| 클립보드 | 서버 → 클라이언트 텍스트 동기화 |
| 녹화 | 툴바 `🔴 Record` / `🟢 Stop` 단일 버튼 (H.264 + 오디오) |
| 녹화 저장 | 기본 `~/Videos/vnc-recording-YYYYMMDD-HHMMSS.mp4` |
| 녹화 완료 알림 | 저장 완료 시 팝업으로 경로 표시 |

## 빌드

### 의존 패키지 설치

```bash
make deps          # Ubuntu / Debian (누락된 패키지만 설치)
```

수동 설치:
```bash
sudo apt-get install libgtk-3-dev libgcrypt20-dev libglib2.0-dev ffmpeg
```

### 빌드 및 실행

```bash
make               # 의존성 확인/설치 + 빌드
make run           # 빌드 후 실행
make install       # /usr/local/bin 에 설치
make clean         # 빌드 결과물 삭제
```

빌드 시 세 계층이 순서대로 컴파일됩니다:
```
  [core]    src/vnc_core.c
  [core]    src/profile.c
  [adapter] src/vnc_client.c
  [ui]      src/vnc_display.c
  [ui]      src/connection_dialog.c
  [ui]      src/main_window.c
  [ui]      src/main.c
  [LD]  Linking vncclient ...
```

## 사용 방법

1. 애플리케이션 실행
2. 툴바의 **Connect** 버튼 클릭
3. 프로필 추가 → 호스트, 포트, 비밀번호 입력 후 **Save**
4. 프로필 선택 후 **Connect**
5. 녹화가 필요하면 **🔴 Record**, 종료 시 **🟢 Stop**

## 녹화 안내

- 비디오 코덱: H.264 (`libx264`, 고화질 설정)
- 오디오 입력이 가능한 환경이면 오디오도 함께 녹화
- 저장 완료 시 팝업으로 파일 경로 표시
- 오디오 환경이 없으면 비디오만 저장될 수 있음

## 디버그 로그

기본 실행 시 CLI 디버그 로그는 출력하지 않습니다.

필요 시 아래처럼 켤 수 있습니다:

```bash
VNC_CORE_VERBOSE=1 ./vncclient
```

### 단축키

| 키 | 동작 |
|---|---|
| F11 | 전체화면 전환 |

## 라이선스

MIT
