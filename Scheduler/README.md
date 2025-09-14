# RTOS Priority Scheduler with Synchronization Mechanisms

이 프로젝트는 128개의 우선순위를 지원하는 RTOS 스케줄러와 완전한 동기화 메커니즘을 구현합니다. 비트맵을 이용하여 가장 높은 우선순위의 Task를 O(1) 시간에 찾을 수 있도록 최적화되었으며, Semaphore, Event, Signal, Message Queue를 통한 태스크 간 동기화를 지원합니다.

## 주요 특징

### 스케줄러 기능
- **128개 우선순위 지원**: 0-127 범위의 우선순위 (0이 가장 높음)
- **비트맵 최적화**: 가장 높은 우선순위 Task를 O(1) 시간에 찾기
- **동일 우선순위 지원**: 각 우선순위에 여러 Task 존재 가능
- **효율적인 메모리 사용**: 16바이트 비트맵으로 128개 우선순위 관리
- **FIFO 스케줄링**: 동일 우선순위 내에서는 선입선출 방식

### 동기화 메커니즘
- **Semaphore**: 리소스 공유 및 카운팅 세마포어 지원
- **Event**: 32비트 이벤트 플래그를 통한 태스크 간 통신
- **Signal**: 간단한 알림 메커니즘
- **Message Queue**: 태스크 간 메시지 전달을 위한 FIFO 큐
- **타임아웃 지원**: 모든 대기 함수에서 타임아웃 설정 가능
- **스레드 안전성**: `std::mutex`와 `std::condition_variable` 사용

## 프로젝트 구조

```
├── include/
│   ├── scheduler.h         # 메인 스케줄러 헤더
│   ├── semaphore.h         # 세마포어 헤더
│   ├── event.h             # 이벤트 헤더
│   ├── signal.h            # 시그널 헤더
│   └── message_queue.h     # 메시지 큐 헤더
├── source/
│   ├── scheduler.cpp       # 메인 스케줄러 구현
│   ├── semaphore.cpp       # 세마포어 구현
│   ├── event.cpp           # 이벤트 구현
│   ├── signal.cpp          # 시그널 구현
│   └── message_queue.cpp   # 메시지 큐 구현
├── test/
│   ├── test_runner.cpp     # 통합 테스트 러너
│   ├── test_basic.cpp      # 기본 기능 테스트
│   ├── test_semaphore.cpp  # 세마포어 테스트
│   ├── test_event.cpp      # 이벤트 테스트
│   ├── test_signal.cpp     # 시그널 테스트
│   ├── test_message_queue.cpp # 메시지 큐 테스트
│   ├── test_sync_management.cpp # 동기화 관리 테스트
│   ├── main_basic.cpp      # 기본 기능 테스트 메인
│   ├── main_semaphore.cpp  # 세마포어 테스트 메인
│   ├── main_event.cpp      # 이벤트 테스트 메인
│   ├── main_signal.cpp     # 시그널 테스트 메인
│   ├── main_message_queue.cpp # 메시지 큐 테스트 메인
│   └── main_sync_management.cpp # 동기화 관리 테스트 메인
├── main.cpp                # 예제 프로그램
├── CMakeLists.txt          # 빌드 설정
└── README.md              # 이 파일
```

## 아키텍처

### 비트맵 구조
```
우선순위: 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
비트맵:   [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11] [12] [13] [14] [15]

각 바이트는 8개 우선순위를 관리 (16바이트 × 8 = 128개 우선순위)
```

### 핵심 알고리즘

1. **우선순위 검색**: 비트맵에서 첫 번째 설정된 비트를 찾아 가장 높은 우선순위 결정
2. **Task 큐 관리**: 각 우선순위별로 별도의 FIFO 큐 유지
3. **비트맵 업데이트**: Task 추가/제거 시 해당 우선순위 비트 설정/해제

## 빌드 및 실행

### 요구사항
- C++14 이상 지원 컴파일러
- CMake 3.10 이상

### 빌드
```bash
mkdir build
cd build
cmake ..
cmake --build . --config Debug
```

### 테스트 실행

#### 전체 테스트 실행
```bash
./test_scheduler
```

#### 개별 테스트 실행
```bash
./test_basic              # 기본 기능 테스트
./test_semaphore          # 세마포어 테스트
./test_event              # 이벤트 테스트
./test_signal             # 시그널 테스트
./test_message_queue      # 메시지 큐 테스트
./test_sync_management    # 동기화 관리 테스트
```

#### CMake 테스트 실행
```bash
ctest --verbose
```

### 예제 실행
```bash
./main
```

## API 사용법

### 기본 스케줄러 사용법

```cpp
#include "scheduler.h"

using namespace RTOS;

// 스케줄러 생성
PriorityScheduler scheduler;

// Task 생성 (우선순위 0이 가장 높음)
uint32_t task1 = scheduler.create_task(0);   // 높은 우선순위
uint32_t task2 = scheduler.create_task(5);   // 중간 우선순위
uint32_t task3 = scheduler.create_task(10);  // 낮은 우선순위

// 다음 실행할 Task 가져오기
auto next_task = scheduler.get_next_task();
if (next_task) {
    // Task 실행
    std::cout << "Executing task " << next_task->id 
              << " with priority " << static_cast<int>(next_task->priority) << std::endl;
}
```

### Semaphore 사용법

```cpp
// 세마포어 생성 (초기값 2)
uint32_t sem_id = scheduler.create_semaphore(2);

// 리소스 획득 (타임아웃 1초)
if (scheduler.semaphore_wait(sem_id, 1000)) {
    // 리소스 사용
    std::cout << "Resource acquired. Remaining: " 
              << scheduler.semaphore_get_count(sem_id) << std::endl;
    
    // 리소스 해제
    scheduler.semaphore_post(sem_id);
}

// 세마포어 삭제
scheduler.delete_semaphore(sem_id);
```

### Event 사용법

```cpp
// 이벤트 생성
uint32_t event_id = scheduler.create_event();

// 이벤트 비트 정의
const uint32_t DATA_READY = 0x01;
const uint32_t PROCESSING_DONE = 0x02;

// 이벤트 설정
scheduler.event_set(event_id, DATA_READY);

// 이벤트 대기 (자동 클리어, 타임아웃 1초)
if (scheduler.event_wait(event_id, DATA_READY, true, 1000)) {
    std::cout << "Data ready event received" << std::endl;
    
    // 처리 완료 이벤트 설정
    scheduler.event_set(event_id, PROCESSING_DONE);
}

// 이벤트 삭제
scheduler.delete_event(event_id);
```

### Signal 사용법

```cpp
// 시그널 생성
uint32_t signal_id = scheduler.create_signal();

// 시그널 전송
scheduler.signal_send(signal_id);

// 시그널 대기 (타임아웃 1초)
if (scheduler.signal_wait(signal_id, 1000)) {
    std::cout << "Signal received!" << std::endl;
}

// 시그널 리셋
scheduler.signal_reset(signal_id);

// 시그널 삭제
scheduler.delete_signal(signal_id);
```

### Message Queue 사용법

```cpp
// 메시지 큐 생성 (최대 10개 메시지)
uint32_t mq_id = scheduler.create_message_queue(10);

// 메시지 전송
scheduler.message_queue_send(mq_id, 1, "Hello World", 1000);
scheduler.message_queue_send(mq_id, 2, "Message Queue Test", 1000);

// 메시지 수신
uint32_t type;
std::string data;
if (scheduler.message_queue_receive(mq_id, type, data, 1000)) {
    std::cout << "Received message type " << type << ": " << data << std::endl;
}

// Message 객체를 사용한 전송/수신
Message msg(0, 100, "Custom Message", 12345);
scheduler.message_queue_send(mq_id, msg, 1000);

Message received_msg;
if (scheduler.message_queue_receive(mq_id, received_msg, 1000)) {
    std::cout << "Received custom message - Type: " << received_msg.type 
              << ", Data: " << received_msg.data 
              << ", ID: " << received_msg.id << std::endl;
}

// 큐 상태 확인
size_t count = scheduler.message_queue_get_count(mq_id);
bool empty = scheduler.message_queue_is_empty(mq_id);
bool full = scheduler.message_queue_is_full(mq_id);

// 큐 클리어
scheduler.message_queue_clear(mq_id);

// 메시지 큐 삭제
scheduler.delete_message_queue(mq_id);
```

### 고급 기능

```cpp
// 특정 Task 제거
bool removed = scheduler.remove_task(task_id);

// 현재 상태 확인
bool has_tasks = scheduler.has_ready_tasks();
uint8_t highest_priority = scheduler.get_highest_ready_priority();
size_t task_count = scheduler.get_total_task_count();

// 특정 우선순위의 Task 수 확인
size_t priority_count = scheduler.get_task_count(5);

// 디버깅 정보 출력
scheduler.print_priority_bitmap();
scheduler.print_task_queues();
scheduler.print_sync_objects();
```

## 성능 특성

### 스케줄러 성능
- **우선순위 검색**: O(1) - 비트맵 사용으로 상수 시간
- **Task 추가**: O(1) - 큐에 추가 및 비트맵 업데이트
- **Task 제거**: O(k) - k는 해당 우선순위의 Task 수
- **메모리 사용량**: 16바이트 비트맵 + Task 큐들

### 동기화 메커니즘 성능
- **Semaphore**: O(1) 대기/포스트 연산
- **Event**: O(1) 설정/대기 연산
- **Signal**: O(1) 전송/대기 연산
- **Message Queue**: O(1) 전송/수신 연산 (FIFO 큐)
- **스레드 안전성**: 모든 연산이 스레드 안전

## 테스트 결과

테스트 스위트는 다음을 검증합니다:

### 스케줄러 테스트
1. **기본 기능**: Task 생성, 우선순위 검색, 큐 관리
2. **우선순위 순서**: 올바른 우선순위 순서로 Task 실행
3. **비트맵 최적화**: 효율적인 우선순위 검색
4. **Task 제거**: 특정 Task 제거 및 상태 업데이트
5. **경계 조건**: 유효하지 않은 우선순위, 빈 스케줄러 처리
6. **성능**: 1000개 Task로 성능 테스트

### 동기화 메커니즘 테스트
1. **Semaphore 기능**: 카운팅, 대기/포스트, 타임아웃
2. **Event 기능**: 비트 설정/클리어, 조건부 대기
3. **Signal 기능**: 전송/수신, 리셋, 상태 확인
4. **Message Queue 기능**: 메시지 전송/수신, 큐 상태 관리, 타임아웃
5. **객체 관리**: 생성/삭제, 다중 객체 관리

### 모듈화된 테스트 구조
테스트는 기능별로 분리되어 독립적으로 실행 가능합니다:

- **`test_scheduler.exe`**: 모든 테스트를 통합 실행
- **`test_basic.exe`**: 기본 기능 테스트만 실행
- **`test_semaphore.exe`**: 세마포어 테스트만 실행
- **`test_event.exe`**: 이벤트 테스트만 실행
- **`test_signal.exe`**: 시그널 테스트만 실행
- **`test_message_queue.exe`**: 메시지 큐 테스트만 실행
- **`test_sync_management.exe`**: 동기화 관리 테스트만 실행

## 실제 RTOS에서의 활용

이 스케줄러는 다음과 같은 실제 RTOS 시나리오에서 사용할 수 있습니다:

### 임베디드 시스템
- **마이크로컨트롤러**: 실시간 Task 스케줄링
- **IoT 디바이스**: 센서 데이터 처리 우선순위 관리
- **자동차 시스템**: 안전 크리티컬 태스크 우선순위 관리

### 멀티미디어 시스템
- **게임 엔진**: 게임 오브젝트의 우선순위 기반 업데이트
- **오디오/비디오**: 스트림 처리 우선순위
- **실시간 통신**: 네트워크 패킷 처리 우선순위

### 동기화 시나리오
- **리소스 공유**: Semaphore를 통한 하드웨어 리소스 관리
- **태스크 통신**: Event를 통한 데이터 준비 알림
- **간단한 알림**: Signal을 통한 상태 변경 알림
- **메시지 전달**: Message Queue를 통한 태스크 간 데이터 전송

## 확장 가능성

### 스케줄러 확장
- **Round Robin 스케줄링**: 동일 우선순위 내에서 시간 할당량 기반 스케줄링
- **Preemptive 스케줄링**: 높은 우선순위 Task가 현재 실행 중인 Task를 선점
- **Task 상태 관리**: BLOCKED, SUSPENDED 상태 추가 지원
- **동적 우선순위**: 실행 중 우선순위 변경 지원

### 동기화 메커니즘 확장
- **Mutex**: 상호 배제를 위한 뮤텍스
- **Barrier**: 여러 태스크의 동기화 지점
- **Reader-Writer Lock**: 읽기/쓰기 최적화 락
- **Condition Variable**: 조건부 대기를 위한 조건 변수
- **Priority Inheritance**: 우선순위 상속을 통한 우선순위 역전 방지

## 모듈성

### 코드 모듈성
각 동기화 메커니즘은 독립적인 파일로 분리되어 있어:

- **선택적 사용**: 필요한 메커니즘만 포함 가능
- **독립적 수정**: 한 메커니즘 수정이 다른 것에 영향 없음
- **재사용성**: 다른 프로젝트에서 개별 메커니즘 사용 가능
- **테스트 용이성**: 각 메커니즘을 독립적으로 테스트 가능

### 테스트 모듈성
테스트도 기능별로 분리되어 있어:

- **독립적 테스트**: 각 기능을 독립적으로 테스트 가능
- **선택적 테스트**: 특정 기능만 테스트하여 개발 시간 단축
- **디버깅 효율성**: 문제가 있는 특정 기능만 집중적으로 테스트
- **CI/CD 친화적**: 병렬 테스트 실행 및 선택적 테스트 가능

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.