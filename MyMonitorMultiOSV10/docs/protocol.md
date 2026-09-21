# MMON v1 Protocol

MyMonitor uses a framed binary protocol that works over Ethernet (TCP) and Serial (UART).
The same codec runs in the Electron app, POSIX/Windows agents, and RTOS ports.

## Frame

Little-endian. Maximum frame size: 1024 bytes.

```
offset  size  field
0       2     magic      'M' 'N'  (0x4D 0x4E)
2       1     version    1
3       1     type
4       2     seq
6       2     length     payload bytes
8       N     payload
8+N     2     crc16      CCITT-FALSE over header+payload
```

CRC-16/CCITT-FALSE: poly `0x1021`, init `0xFFFF`, no xorout.

## Message types

| type | name        | direction        |
|------|-------------|------------------|
| 0x01 | HELLO       | either           |
| 0x02 | HELLO_ACK   | reply            |
| 0x03 | HEARTBEAT   | either           |
| 0x04 | METRICS     | agent → monitor  |
| 0x05 | LOG         | agent → monitor  |
| 0x06 | SUBSCRIBE   | monitor → agent  |
| 0x07 | ERROR       | either           |
| 0x08 | DISCONNECT  | either           |

## HELLO / HELLO_ACK payload (48 bytes)

```
0   16  agent_id raw bytes
16   1  os_type   1=linux 2=windows 3=macos 4=rtos 5=electron-local
17   1  caps      bit0 cpu  bit1 ram  bit2 disk  bit3 load
                  bit4 net  bit5 temp bit6 rtos-heap/tasks
18   2  interval_ms
20  32  hostname  UTF-8, NUL padded
```

## SUBSCRIBE payload (4 bytes)

```
0  2  interval_ms   0 = keep current
2  1  enable        1 start / 0 stop
3  1  reserved
```

## METRICS payload

```
0   8  timestamp_ms  uint64
8   1  count
9   3  reserved
12     metrics[count]
         0  1  id
         1  1  vtype     1=f32  2=u64
         2  2  reserved
         4  8  value     f32 in first 4 bytes, or u64
```

### Metric IDs

| id | name         | type | notes              |
|----|--------------|------|--------------------|
| 1  | CPU_PCT      | f32  | 0–100              |
| 2  | RAM_USED     | u64  | bytes              |
| 3  | RAM_TOTAL    | u64  | bytes              |
| 4  | DISK_USED    | u64  | bytes              |
| 5  | DISK_TOTAL   | u64  | bytes              |
| 6  | LOAD1        | f32  | POSIX loadavg      |
| 7  | LOAD5        | f32  |                    |
| 8  | LOAD15       | f32  |                    |
| 9  | NET_RX       | u64  | bytes total        |
| 10 | NET_TX       | u64  | bytes total        |
| 11 | NET_RX_RATE  | f32  | bytes/sec          |
| 12 | NET_TX_RATE  | f32  | bytes/sec          |
| 13 | UPTIME       | u64  | seconds            |
| 14 | PROCS        | u64  | process/task count |
| 15 | TEMP         | f32  | celsius            |
| 16 | HEAP_USED    | u64  | RTOS heap          |
| 17 | HEAP_TOTAL   | u64  | RTOS heap          |
| 18 | TASKS        | u64  | RTOS tasks         |

Unused metrics are omitted. RTOS agents typically send CPU, HEAP, TASKS, NET, TEMP.

## LOG payload

```
0  1  level   0 debug  1 info  2 warn  3 error
1  3  reserved
4  8  timestamp_ms
12    message UTF-8, not necessarily NUL terminated
```

## Text fallbacks

The Electron monitor also accepts line-oriented text on the same transports.

JSON Lines:

```
{"t":"metrics","cpu":12.5,"ram_used":123,"ram_total":456,"disk_used":1,"disk_total":2,"load1":0.2,"net_rx_rate":100,"net_tx_rate":50}
{"t":"log","level":"info","msg":"boot"}
```

Key-value:

```
cpu=12.5 ram_used=123 ram_total=456
```

## Ports

Default TCP port: `9510`.
Default HTTP port: `9511` (`GET /` or `GET /metrics`, JSON).
Default serial: 115200 8N1.

HTTP JSON uses the same field names as the JSON Lines fallback (`cpu`, `ram_used`, `ram_total`, …). Nested `{ "hello": ..., "metrics": ... }` is also accepted. The C agent `--http` mode serves this JSON and sends `Access-Control-Allow-Origin: *`.
