# Windows Agent

원격 Windows 머신에서 CPU, RAM, Disk, Load, Network, Process 수를 수집해 Electron 모니터로 보냅니다.

## 빌드

Visual Studio C 컴파일러와 CMake가 필요합니다.

```bat
cd agent
cmake -B build
cmake --build build --config Release
```

실행 파일: `agent/dist/windows/mmon-agent.exe`

## 콘솔 실행

모니터가 이 PC로 접속하는 경우:

```bat
agent\windows\listen.bat
```

또는

```bat
mmon-agent.exe --listen 0.0.0.0:9510
```

이 PC가 모니터로 붙는 경우:

```bat
agent\windows\connect.bat 192.168.0.10:9510
```

Electron에서는 **추가 → Ethernet TCP 접속 → Windows PC IP:9510 → MMON**.

## Windows 서비스

관리자 권한으로:

```bat
agent\windows\install-service.bat
agent\windows\uninstall-service.bat
```

서비스 이름: `MyMonitorAgent` (자동 시작, TCP 9510).

## 수집 항목

- CPU %
- RAM used/total
- 모든 고정 디스크 합계
- Load (CPU% × 논리 프로세서 수)
- Network RX/TX (64-bit 카운터)
- Process count
- Uptime
