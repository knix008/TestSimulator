# RTOS 포트

`mmon_protocol.c`는 malloc/소켓/파일에 의존하지 않습니다. 펌웨어에는 아래만 넣으면 됩니다.

1. `agent/src/mmon_protocol.c`
2. `agent/include/mmon.h`
3. `agent/rtos/mmon_rtos.c`
4. `agent/rtos/mmon_rtos_port.h`
5. 보드용 `mmon_rtos_now_ms` / `mmon_rtos_send` / `mmon_rtos_collect`

정적 버퍼만 사용합니다. 기본 프레임 상한은 1024바이트입니다.

## 전송

- UART: `mmon_rtos_send`에서 바이트를 그대로 씁니다. 모니터는 Serial + MMON 프로토콜로 엽니다.
- Ethernet: lwIP `tcp_write` 또는 벤더 TCP 스택에 같은 프레임을 씁니다.

## 수집 예 (FreeRTOS)

- CPU: idle hook 카운터
- Heap: `xPortGetFreeHeapSize`
- Tasks: `uxTaskGetNumberOfTasks`
- Disk/Loadavg는 보통 없습니다. 보내지 않으면 모니터는 해당 카드를 숨기거나 N/A로 표시합니다.

예제 스켈레톤은 `mmon_rtos_example.c`입니다.
