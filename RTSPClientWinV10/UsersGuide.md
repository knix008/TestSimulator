# RTSPClientWinV10 Users Guide

Windows PC ↔ 임베디드 장치(또는 로컬 시뮬레이터) 영상·음성 통화 사용 설명서입니다.

---

## 1. 준비

1. [FFmpeg](https://ffmpeg.org/) 설치 후 터미널에서 `ffmpeg -version` 이 동작하는지 확인합니다.
2. .NET 8 SDK 또는 Visual Studio 2022/2026 (.NET 데스크톱 개발)을 준비합니다.
3. **먼저 로컬 시뮬레이터**로 동작을 확인한 뒤, 실장치에 연결하는 것을 권장합니다.

설정 파일 위치:

| 앱 | 경로 |
|----|------|
| PC 클라이언트 | `%APPDATA%\RTSPClientWinV10\settings.json` |
| 장치 시뮬레이터 | `%APPDATA%\RTSPDeviceSimWinV10\settings.json` |

---

## 2. 같은 PC 시뮬레이터 (권장 첫 테스트)

### 2.1 스크립트로 실행

```powershell
cd D:\Home\Projects\TestSimulator\RTSPClientWinV10
powershell -ExecutionPolicy Bypass -File scripts\run-local-simulator.ps1
```

### 2.2 Visual Studio / CLI로 실행

```powershell
dotnet run --project src/RTSPDeviceSimWinV10 -c Debug
dotnet run --project src/RTSPClientWinV10 -c Debug
```

### 2.3 통화 절차

1. **RTSP Device Simulator** 창에서  
   - Loopback 체크 유지  
   - Source: `(test pattern)` 권장  
   - **Start simulator**
2. **RTSP Client** 창에서  
   - **Local sim** 클릭 (Device URL = `http://127.0.0.1:8080`, Loopback on)  
   - Camera: `(test pattern)` 또는 실제 웹캠  
   - **Start call**
3. 확인  
   - 시뮬레이터: PC 스트림 표시  
   - 클라이언트: 장치(시뮬) 스트림 표시
4. 종료  
   - 클라이언트 **Hang up** → 시뮬레이터 **Stop**

### 2.4 포트 (시뮬레이터)

| 용도 | 값 |
|------|-----|
| 시그널링 | `http://127.0.0.1:8080` |
| PC RTSP | `rtsp://127.0.0.1:8554/pc` |
| 장치 시뮬 RTSP | `rtsp://127.0.0.1:8555/device` |

웹캠이 1대뿐이면 한쪽은 반드시 `(test pattern)`을 사용하세요. 두 앱이 동시에 같은 카메라를 열면 실패할 수 있습니다.

---

## 3. PC 클라이언트 (실장치 연동)

1. Device URL 예: `http://192.168.0.50:8080`
2. **Loopback** 해제 (LAN IP를 advertise)
3. **Refresh devices**로 카메라/마이크 선택
4. **Start call**
5. 종료: **Hang up**

동작 요약:

- PC가 FFmpeg로 로컬 RTSP listen
- 장치에 `pc_rtsp_url` 전달
- 장치가 돌려준 `device_rtsp_url`을 LibVLC로 재생

---

## 4. 설치본 (MSI)

```powershell
dotnet build RTSPClientWinV10.sln -c Release -p:Platform=x64
```

- 결과물: `artifacts/msi/RTSPClientWinV10.msi`
- Visual Studio에서 Configuration = **Release** 로 솔루션 빌드해도 동일
- **Debug** 구성에서는 MSI를 만들지 않음
- 설치 PC에도 FFmpeg PATH 필요

시작 메뉴: **RTSP Client Win V10**

---

## 5. Visual Studio 2026에서 GUI 편집

UI는 **WinForms** 입니다. Visual Studio **Form Designer**로 편집합니다.

1. `RTSPClientWinV10.sln` 열기 (워크로드: **.NET 데스크톱 개발**)
2. 구성: **Debug | Any CPU**
3. `MainForm.cs` 더블클릭 → 디자인 화면 (또는 파일 선택 후 Shift+F7)
4. Toolbox 드래그 & Properties 편집
5. F5 실행

| 앱 | 디자이너 파일 |
|----|----------------|
| PC 클라이언트 | `src/RTSPClientWinV10/MainForm.cs` (+ `MainForm.Designer.cs`) |
| 장치 시뮬레이터 | `src/RTSPDeviceSimWinV10/MainForm.cs` (+ `MainForm.Designer.cs`) |

- `panelVideo` 는 디자이너에서 일반 Panel입니다. 실행 시 LibVLC가 붙습니다.
- `RTSPCall.Core` 는 UI가 없는 라이브러리입니다.

---

## 6. 실장치 쪽 확인

통화 시작 후 장치에서:

- 자체 카메라 RTSP publish 동작
- PC RTSP pull (`start_pc_pull.sh` / GStreamer) 후 화면·스피커 출력
- pid/로그 기본 위치: `/tmp/rtsp-call/`

자세한 연동: [device/README.md](./device/README.md), [Architecture.md](./Architecture.md)

---

## 7. 시그널링 API

### GET `/api/call/status`

```json
{
  "ok": true,
  "state": "idle|active|error",
  "session_id": "...",
  "device_rtsp_url": "rtsp://...",
  "pc_rtsp_url": "rtsp://...",
  "message": "..."
}
```

### POST `/api/call/start`

```json
{
  "caller_id": "PCNAME",
  "pc_host": "192.168.0.10",
  "pc_rtsp_url": "rtsp://192.168.0.10:8554/pc",
  "pc_rtsp_port": 8554
}
```

응답에 `device_rtsp_url` 이 있어야 합니다.

### POST `/api/call/hangup`

파이프라인 중지 후 `state=idle`.

---

## 8. 문제 해결

| 증상 | 확인 |
|------|------|
| Signaling unreachable | 시뮬레이터를 먼저 Start 했는지, Device URL/포트 |
| Start call 실패 (카메라) | `(test pattern)` 사용, 다른 앱의 카메라 점유 해제 |
| 시뮬은 되는데 실장치만 실패 | LAN IP, Civetweb `/api/call/*`, 방화벽 TCP 8554 |
| PC 영상만 장치에서 안 보임 | PC 방화벽, `pc_rtsp_url`이 장치가 접근 가능한 IP인지 |
| ffmpeg device list 실패 | PATH의 `ffmpeg`, 그래도 test pattern은 사용 가능 |
| 소리 없음 | 마이크 선택, 장치 `alsasrc` / `AUDIO_SINK` |
| MSI 설치 후 송출 실패 | 대상 PC에 FFmpeg 설치 |

---

## 9. 관련 문서

- [README.md](./README.md) — 개요·빌드
- [Architecture.md](./Architecture.md) — 구조·시퀀스
- [installer/README.md](./installer/README.md) — MSI
- [device/README.md](./device/README.md) — 실장치 연동
