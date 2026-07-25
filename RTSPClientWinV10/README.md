# RTSPClientWinV10

같은 LAN에서 Windows PC와 임베디드 장치(Civetweb + GStreamer/RTSP)가 **1:1 영상·음성 통화**를 하는 솔루션입니다.  
장치 없이 검증할 수 있도록 **로컬 장치 시뮬레이터**도 포함합니다.

**개발자**: SHKWON  
**버전**: 0.1.0

---

## 구성

| 프로젝트 | 설명 |
|----------|------|
| `src/RTSPClientWinV10` | PC 클라이언트 (WinForms) |
| `src/RTSPDeviceSimWinV10` | 장치 시뮬레이터 (WinForms, 같은 PC 테스트용) |
| `src/RTSPCall.Core` | 시그널링·FFmpeg·LibVLC 공통 라이브러리 |
| `installer/RTSPClientWinV10.Setup` | WiX MSI (Release 전용) |
| `device/` | 실장치 Civetweb API + GStreamer 스크립트 |
| `assets/` | 앱·MSI 아이콘 (`app.ico`, `device-sim.ico`) |

문서: [Architecture.md](./Architecture.md) · [UsersGuide.md](./UsersGuide.md)

---

## 사전 요구

- Windows 10/11
- .NET 8 SDK
- Visual Studio 2022/2026 (.NET 데스크톱 개발 워크로드) — GUI 편집 시
- [FFmpeg](https://ffmpeg.org/) (`ffmpeg`가 PATH에 있어야 함)
- 실장치 연동 시: Civetweb, GStreamer, RTSP

---

## 빠른 시작 (같은 PC 시뮬레이터)

장치 하드웨어 없이 양방향 통화를 확인합니다.

```powershell
cd D:\Home\Projects\TestSimulator\RTSPClientWinV10
powershell -ExecutionPolicy Bypass -File scripts\run-local-simulator.ps1
```

수동 실행:

1. **RTSPDeviceSimWinV10** → `Start simulator`
2. **RTSPClientWinV10** → `Local sim` → `Start call`

| 역할 | 앱 | 포트 |
|------|-----|------|
| 장치(시뮬) | RTSPDeviceSimWinV10 | HTTP `8080`, RTSP `8555/device` |
| PC | RTSPClientWinV10 | RTSP `8554/pc` |

기본 소스는 `(test pattern)`이라 웹캠이 1대여도 충돌 없이 테스트할 수 있습니다.

---

## Visual Studio에서 실행

`RTSPCall.Core` 는 **클래스 라이브러리**라서 시작 프로젝트로 두면 실행되지 않습니다.

1. `RTSPClientWinV10.sln` 을 연다.
2. 솔루션 탐색기에서 **RTSPClientWinV10**(또는 **RTSPDeviceSimWinV10**) 우클릭 → **시작 프로젝트로 설정**.
3. F5 / 디버그 시작.

또는 도구 모음의 다중 시작 프로필에서 `Simulator + Client` (`RTSPClientWinV10.slnLaunch`)를 선택합니다.

빌드 로그에 `-> ...dll` 이 보여도 정상입니다. 실행 파일은 같은 폴더의 `.exe` 입니다.

```
src\RTSPClientWinV10\bin\Debug\net8.0-windows\RTSPClientWinV10.exe
src\RTSPDeviceSimWinV10\bin\Debug\net8.0-windows\RTSPDeviceSimWinV10.exe
```

## Visual Studio 2026 GUI 편집 (WinForms Designer)

앱은 **Windows Forms** 라서 Visual Studio Form Designer로 편집할 수 있습니다.

1. `RTSPClientWinV10.sln` 열기 (워크로드: .NET 데스크톱 개발)
2. 구성: **Debug | Any CPU**
3. 솔루션 탐색기에서 더블클릭:
   - PC: `src/RTSPClientWinV10/MainForm.cs` → 디자인 화면
   - 시뮬: `src/RTSPDeviceSimWinV10/MainForm.cs` → 디자인 화면
4. Toolbox에서 Button/TextBox 등을 드래그하거나 Properties로 수정
5. 저장 후 F5 실행

영상 영역(`panelVideo`)은 디자이너에서 Panel로 보이며, LibVLC는 실행 시에만 붙습니다.

---

## 빌드 · 실행 · MSI

```powershell
# Debug — 앱만
dotnet build RTSPClientWinV10.sln -c Debug "/p:Platform=Any CPU"
dotnet run --project src/RTSPDeviceSimWinV10 -c Debug
dotnet run --project src/RTSPClientWinV10 -c Debug

# Release — 앱 + MSI
dotnet build RTSPClientWinV10.sln -c Release -p:Platform=x64
```

- MSI 출력: `artifacts/msi/RTSPClientWinV10.msi` (self-contained win-x64)
- Debug 구성에서는 Setup(MSI) 프로젝트를 빌드하지 않습니다.
- 설치 대상 PC에도 **FFmpeg가 PATH에** 있어야 합니다 (MSI에 미포함).

자세한 MSI 설명: [installer/README.md](./installer/README.md)

---

## 실장치 연동

1. `device/civetweb/call_api.c` 를 펌웨어 Civetweb에 링크하고 `call_api_register(ctx)` 호출
2. `device/scripts/` 배포 및 실행 권한 부여
3. 환경 변수 예:

```sh
export CALL_DEVICE_RTSP_URL=rtsp://192.168.0.50:8554/device
export CALL_PUBLISH_SCRIPT=/opt/rtsp-call/scripts/start_device_publish.sh
export CALL_PULL_SCRIPT=/opt/rtsp-call/scripts/start_pc_pull.sh
export CALL_STOP_SCRIPT=/opt/rtsp-call/scripts/stop_call.sh
export ASSUME_EXTERNAL_RTSP_SERVER=1   # RTSP가 이미 상시 동작 중일 때
```

PC 클라이언트 Device URL 예: `http://192.168.0.50:8080`  
Loopback 체크는 해제하고 LAN IP를 사용합니다.

---

## 방화벽

- 같은 PC 시뮬레이터(127.0.0.1): 보통 추가 설정 불필요
- 실장치 LAN: PC **TCP 8554**(또는 설정 포트) 인바운드 허용

---

## 라이선스 / 참고

- LibVLC / VideoLAN, FFmpeg, WiX Toolset은 각 프로젝트 라이선스를 따릅니다.
- 본 저장소 애플리케이션 코드 저작권: SHKWON
