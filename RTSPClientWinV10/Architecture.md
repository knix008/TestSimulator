# RTSPClientWinV10 Architecture

LAN 전용 1:1 영상·음성 통화 구조입니다.  
임베디드 장치에는 브라우저/WebRTC 대신 **기존 Civetweb + GStreamer/RTSP**를 사용하고, Windows 쪽은 WinForms 클라이언트로 대응합니다.

---

## 설계 원칙

| 계층 | 기술 | 역할 |
|------|------|------|
| 시그널링 | HTTP JSON `/api/call/*` (Civetweb 또는 시뮬레이터) | RTSP URL 교환, 통화 시작/종료 |
| 미디어 (장치→PC) | 장치 RTSP publish | PC가 LibVLC로 재생 |
| 미디어 (PC→장치) | PC FFmpeg `rtsp_flags listen` | 장치가 RTSP pull·재생 |

- Civetweb은 **제어 채널만** 담당 (미디어 전송 아님)
- WebRTC는 장치 부담·구현 복잡도 때문에 사용하지 않음
- 같은 LAN 가정 (NAT/ICE 없음). 같은 PC 테스트는 loopback(`127.0.0.1`) 사용

---

## 전체 구조

### 실장치 연동

```
┌────────────────────┐       HTTP /api/call/*        ┌─────────────────────┐
│  Windows PC        │◄─────────────────────────────►│  Embedded device    │
│  RTSPClientWinV10  │                               │  Civetweb           │
│                    │  play rtsp://device/.../device│  GStreamer RTSP     │
│  LibVLC            │◄──────────────────────────────│  publish            │
│                    │  pull rtsp://pc/.../pc        │                     │
│  FFmpeg RTSP listen│──────────────────────────────►│  gst rtspsrc play   │
└────────────────────┘                               └─────────────────────┘
```

### 같은 PC 시뮬레이터

```
┌────────────────────┐       HTTP :8080              ┌─────────────────────┐
│  RTSPClientWinV10  │◄─────────────────────────────►│ RTSPDeviceSimWinV10 │
│  RTSP :8554/pc     │                               │ RTSP :8555/device   │
│  LibVLC ◄──────────┼────── device stream ──────────┤ FFmpeg publish      │
│  FFmpeg publish ───┼────── pc stream ─────────────►│ LibVLC play         │
└────────────────────┘                               └─────────────────────┘
```

시뮬레이터는 실장치와 동일한 `/api/call/*` 계약을 구현합니다.

---

## 통화 시퀀스

1. (시뮬/장치) 시그널링 서버가 listen, 장치 측 RTSP publish 준비
2. PC가 FFmpeg RTSP listen 시작 (`rtsp://<host>:8554/pc`)
3. PC `POST /api/call/start` `{ pc_rtsp_url, pc_host, ... }`
4. 장치가 `device_rtsp_url`을 응답하고 PC RTSP를 pull·재생
5. PC가 `device_rtsp_url`을 LibVLC로 재생
6. `POST /api/call/hangup` → 양측 파이프라인/세션 정리

Loopback 모드에서는 advertise host가 `127.0.0.1`입니다.

---

## 솔루션 구성

```
RTSPClientWinV10/
├── src/
│   ├── RTSPCall.Core/          # 공통 모델·서비스
│   ├── RTSPClientWinV10/       # PC WPF 클라이언트
│   └── RTSPDeviceSimWinV10/    # 장치 시뮬레이터 WPF
├── installer/
│   └── RTSPClientWinV10.Setup/ # WiX 6 MSI (Release)
├── device/
│   ├── civetweb/               # 실장치 call_api.c/.h
│   └── scripts/                # GStreamer publish/pull/stop
└── scripts/
    └── run-local-simulator.ps1
```

### RTSPCall.Core

| 구성 요소 | 역할 |
|-----------|------|
| `SignalingClient` | 장치/시뮬 HTTP API 호출 |
| `SignalingHttpServer` | 시뮬레이터용 `/api/call/*` HttpListener |
| `FfmpegPublisher` | DirectShow 또는 lavfi test pattern → RTSP listen |
| `RtspPlayerService` | LibVLCSharp 재생 |
| `CallSessionController` | PC 측 통화 오케스트레이션 |
| `DirectShowDeviceEnumerator` | ffmpeg 장치 목록 (+ test pattern) |

### Windows UI

- **WinForms** (`MainForm` + `MainForm.Designer.cs`) — Visual Studio Form Designer로 편집
- LibVLC `VideoView`는 디자인 타임을 깨뜨리므로 runtime에 `panelVideo`에 부착

### Installer

- WiX Toolset 6, Release 빌드 시 self-contained `win-x64` publish를 harvest
- 출력: `artifacts/msi/RTSPClientWinV10.msi`

### Device (실기기)

- `call_api.c` — Civetweb 핸들러 등록
- `start_device_publish.sh` / `start_pc_pull.sh` / `stop_call.sh`

---

## 시그널링 API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/call/status` | 세션 상태 |
| POST | `/api/call/start` | `pc_rtsp_url` 수신, `device_rtsp_url` 반환 |
| POST | `/api/call/hangup` | 세션 종료 |

요청/응답 JSON 필드명은 snake_case (`pc_rtsp_url`, `device_rtsp_url` 등).

---

## 미디어 / 지연

- 영상: H.264 baseline, ultrafast, zerolatency, GOP ≈ 1s
- 음성: AAC (또는 장치 Opus)
- 전송: RTSP over TCP (LAN·방화벽 단순화)
- LibVLC network caching ≈ 150 ms
- 장치 `rtspsrc latency` ≈ 120 ms

추가 저지연이 필요하면 미디어만 RTP/UDP로 바꾸고 시그널링은 유지하는 방향을 권장합니다.

---

## 포트 기본값

| 용도 | 기본 |
|------|------|
| 시그널링 HTTP | 8080 |
| PC RTSP | 8554 / `pc` |
| 장치(시뮬) RTSP | 8555 / `device` |
| 실장치 RTSP (스크립트 기본) | 8554 / `device` |
