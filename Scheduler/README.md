# RTOS Priority Scheduler with Bitmap Optimization

이 프로젝트는 128개의 우선순위를 지원하는 RTOS 스케줄러를 구현합니다. 비트맵을 이용하여 가장 높은 우선순위의 Task를 O(1) 시간에 찾을 수 있도록 최적화되었습니다.

## 주요 특징

- **128개 우선순위 지원**: 0-127 범위의 우선순위 (0이 가장 높음)
- **비트맵 최적화**: 가장 높은 우선순위 Task를 O(1) 시간에 찾기
- **동일 우선순위 지원**: 각 우선순위에 여러 Task 존재 가능
- **효율적인 메모리 사용**: 16바이트 비트맵으로 128개 우선순위 관리
- **FIFO 스케줄링**: 동일 우선순위 내에서는 선입선출 방식

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
make
```

### 테스트 실행
```bash
./test_scheduler
```

### 예제 실행
```bash
./example_scheduler
```

## API 사용법

### 기본 사용법

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
```

## 성능 특성

- **우선순위 검색**: O(1) - 비트맵 사용으로 상수 시간
- **Task 추가**: O(1) - 큐에 추가 및 비트맵 업데이트
- **Task 제거**: O(k) - k는 해당 우선순위의 Task 수
- **메모리 사용량**: 16바이트 비트맵 + Task 큐들

## 테스트 결과

테스트 스위트는 다음을 검증합니다:

1. **기본 기능**: Task 생성, 우선순위 검색, 큐 관리
2. **우선순위 순서**: 올바른 우선순위 순서로 Task 실행
3. **비트맵 최적화**: 효율적인 우선순위 검색
4. **Task 제거**: 특정 Task 제거 및 상태 업데이트
5. **경계 조건**: 유효하지 않은 우선순위, 빈 스케줄러 처리
6. **성능**: 1000개 Task로 성능 테스트

## 실제 RTOS에서의 활용

이 스케줄러는 다음과 같은 실제 RTOS 시나리오에서 사용할 수 있습니다:

- **임베디드 시스템**: 마이크로컨트롤러에서의 실시간 Task 스케줄링
- **게임 엔진**: 게임 오브젝트의 우선순위 기반 업데이트
- **IoT 디바이스**: 센서 데이터 처리 우선순위 관리
- **멀티미디어 시스템**: 오디오/비디오 스트림 처리 우선순위

## 확장 가능성

- **Round Robin 스케줄링**: 동일 우선순위 내에서 시간 할당량 기반 스케줄링
- **Preemptive 스케줄링**: 높은 우선순위 Task가 현재 실행 중인 Task를 선점
- **Task 상태 관리**: BLOCKED, SUSPENDED 상태 추가 지원
- **동적 우선순위**: 실행 중 우선순위 변경 지원

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
