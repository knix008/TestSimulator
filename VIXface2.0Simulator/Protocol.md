# VIXface 시뮬레이터 프로토콜

이 문서는 `VIXfaceSimulator`에 현재 구현된 통신 프로토콜을 설명합니다.

## 1) 전송 계층

- 프로토콜: TLS 1.3 전용
- 포트: `8443`
- 인증서: 실행 시 자체 서명(Self-signed) 서버 인증서 생성
- 연결 모델: 하나의 TCP/TLS 연결에서 요청을 연속 처리

## 2) 세션 규칙

- 연결 후 첫 요청은 반드시 `AT`로 시작하는 AT 명령이어야 합니다.
- 첫 요청이 AT 명령이 아니면 서버는 아래를 반환합니다.
  - `ERROR: First connection must start with an 'AT' command.\r\n`
- JSON 요청은 테스트 모드 활성화 이후에만 허용됩니다.
- 테스트 모드 활성화 전 JSON을 내면 서버는 아래를 반환합니다.
  - `ERROR: Test mode is not enabled. Send 'AT+TEST=BEGIN' first.\r\n`

## 3) 메시지 타입

- AT 명령 텍스트(Plain text)
- JSON 요청 텍스트(UTF-8)

## 4) AT 명령

### 기본 연결 / 모드

- `AT` -> `OK\r\n`
- `AT+TEST=BEGIN` -> `OK\r\nTEST MODE ENABLED\r\n`
- `AT+TEST=END` -> `OK\r\nTEST MODE DISABLED\r\n`

### 펌웨어 버전 (Firmware Version)

- `AT+TEST=VERSION` -> 연결 + 테스트 모드 활성화 시 펌웨어 버전(현재 `VER1.0.1\r\n`), 아니면 `FAIL\r\n`
- `AT+VER?` -> `AT+TEST=VERSION`과 동일 동작

### 시리얼 (Serial)

- `AT+SERIAL?` -> 연결 + 테스트 모드 활성화 시 시리얼 번호 + `\r\n`, 아니면 `FAIL\r\n`
- `AT+SERIAL=<value>` -> 성공 시 `OK\r\n`, 검증/상태 실패 시 `FAIL\r\n`
- 시리얼 검증 규칙:
  - 정규식: `^[A-Za-z0-9\-]{1,20}$`
  - 허용 문자: 영문/숫자/하이픈, 길이 1~20

### 테스트 API

연결 + 테스트 모드 활성화 상태에서:

| API | AT 명령 | 성공 응답 |
|-----|---------|-----------|
| Default | `AT+TEST=DEFAULT` | `OK\r\n` |
| BIST | `AT+TEST=BIST` | `OK\r\n` |
| Camera | `AT+TEST=CAMERA` | `OK\r\n` |
| Wifi | `AT+TEST=WIFI` | `OK\r\n` |
| BLE | `AT+TEST=BLE` | `OK\r\n` |
| Wiegand | `AT+TEST=WIEGAND` | `OK\r\n` |
| NFC | `AT+TEST=NFC` | `OK\r\n` |
| Lock | `AT+TEST=LOCK` | `OK\r\n` |
| Tamper | `AT+TEST=TAMPER` | `OK\r\n` |
| Network | `AT+TEST=NETWORK` | `UP\r\n` |

연결 상태 또는 테스트 모드 선행 조건을 만족하지 못하면 `FAIL\r\n`을 반환합니다.

### 미지원 AT 명령

- `AT+`로 시작하지만 지원하지 않는 명령이면:
  - `ERROR: <message>\r\n`

## 5) JSON 액션

JSON 요청에는 반드시 `action` 필드가 있어야 합니다.

공통 오류 응답:

- JSON 형식 오류: `{"status":"FAIL","error":"Invalid JSON format",...}`
- action 누락: `{"status":"FAIL","error":"Missing action field",...}`
- 미지원 action: `{"status":"FAIL","error":"Unknown action",...}`

지원 액션:

| API | action | 설명 |
|-----|--------|------|
| Serial (조회) | `getSerialNumber` | 시리얼/장치 정보 반환 |
| Serial (설정) | `setSerialNumber` | `serialNumber` / `serial_number` / `SerialNumber` 필드 사용 |
| Network | `getMacAddress` | MAC 및 네트워크 인터페이스 정보 반환 |

- 시리얼 검증 정규식: `^[A-Za-z0-9\-]{1,20}$`
- 성공 응답: `{"status":"OK","data":{...},"timestamp":"..."}`
- 실패 응답: `{"status":"FAIL","error":"<reason>","timestamp":"..."}`

## 6) 응답 규칙

- AT 응답은 `\r\n`이 포함된 Plain text입니다.
- JSON 응답은 아래 래퍼 구조를 사용합니다.
  - 성공: `status = "OK"`, `data`, `timestamp`
  - 실패: `status = "FAIL"`, `error`, `timestamp`
