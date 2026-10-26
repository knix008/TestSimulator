# C++ 예제: 센서 로거 (cpp-sensor)

센서를 읽어 CSV로 기록하는 작은 C++17 프로그램입니다. 분석기가 무엇을 찾는지 보여 주려고 결함을 일부러 넣었습니다. 실제 코드에 쓰지 마세요.

## 여는 방법

- 프로그램: **파일 › 프로젝트 열기…**에서 `cpp-sensor.mccp`를 엽니다. 시작 화면의 **샘플·예제**에서 골라도 됩니다. 프로젝트 파일에 포함 경로(`include`)와 매크로(`SENSOR_VERSION=2`)가 들어 있습니다.
- 정밀 결함 분석의 CLI (`compile_commands.json`의 `directory`는 이 폴더 기준입니다):

  ```bash
  node scripts/defect-cli.mjs build --path samples/cpp-sensor --compile-commands samples/cpp-sensor/compile_commands.json
  node scripts/defect-cli.mjs analyze --path samples/cpp-sensor --coding-standard-config misra-cpp2023,autosar,cert-cpp --aggressiveness-level high
  node scripts/defect-cli.mjs format-errors --dir samples/cpp-sensor/.mcc
  ```

## 찾는 결함

| 위치 | 결함 | 검사기 / 규칙 |
| --- | --- | --- |
| `src/main.cpp:33` | 명령줄 인수로 셸 명령을 만들어 실행 | OS_CMD_INJECTION, CERT ENV33-C |
| `src/main.cpp:37` | `formatLabel` 결과를 해제하지 않음 | RESOURCE_LEAK |
| `src/device.cpp:21` | `strcat`로 16바이트 버퍼를 넘길 수 있음 | CERT STR31-C |
| `src/device.cpp:50` | 이후 쓰지 않는 지역 문자열을 복사해 넣음 | COPY_INSTEAD_OF_MOVE |
| `src/reading.cpp:11` | `new[]`로 만든 배열을 `delete`로 해제 | DELETE_ARRAY |
| `src/logger.cpp:21` | 오류 경로에서 파일을 닫지 않음 | RESOURCE_LEAK, CERT FIO51-CPP |
| `src/logger.cpp:31` | `malloc` 결과를 확인하지 않고 씀 | CERT MEM52-CPP, STR31-C |
| `src/logger.cpp:37` | 해제한 메모리를 읽음 | USE_AFTER_FREE, CERT MEM50-CPP |
| `src/logger.cpp:43` | 32비트 곱을 계산한 뒤 64비트로 넓힘 | OVERFLOW_BEFORE_WIDEN |
| `src/logger.cpp:51` | 초기화하지 않은 값으로 나눔, 정수 나눗셈 | UNINIT, UNINTENDED_INTEGER_DIVISION |
| `src/logger.cpp:58` | null 검사 뒤에도 역참조 | FORWARD_NULL |
| `src/logger.cpp:67` | 8바이트 버퍼에 16바이트 복사 | OVERRUN, CERT ARR38-C |
| `include/sensor/units.hpp` ↔ `reading.hpp` | 헤더끼리 서로 포함 | arch:cycle |

이 밖에 MISRA C++:2023, MISRA C++:2008, AUTOSAR C++14, CERT C++ 규칙 위반과 HIS 메트릭(주석 밀도, 반환 지점 수 등)이 함께 보고됩니다.

## 아직 찾지 못하는 결함

코드에 `not detected yet` 주석을 단 곳입니다. 멤버 변수 상태나 함수 사이로 전달되는 null을 따라가야 해서 현재 엔진이 놓칩니다.

- `src/main.cpp:20` — `makeDevice`가 돌려준 null을 그대로 사용
- `src/device.cpp:30` — null일 수 있는 멤버 `port_`를 사용
- `src/device.cpp:15` — 생성자 초기화 목록에서 할당한 버퍼를 해제하지 않음 (CTOR_DTOR_LEAK)
- `src/reading.cpp:34`, `src/logger.cpp:62` — 0일 수 있는 값으로 나눔 (DIVIDE_BY_ZERO)
- `include/sensor/device.hpp` — 가상 함수가 있는데 가상 소멸자가 없음 (VIRTUAL_DTOR, AUTOSAR A12-4-1)
