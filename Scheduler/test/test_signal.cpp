#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_signal_functionality() {
    std::cout << "=== Signal Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 시그널 생성
    uint32_t signal_id = scheduler.create_signal();
    assert(signal_id != 0);
    
    // 초기 시그널 상태 확인
    assert(!scheduler.signal_is_set(signal_id));
    std::cout << "Created signal with initial state: " << (scheduler.signal_is_set(signal_id) ? "SET" : "NOT SET") << std::endl;
    
    // 테스트용 태스크 생성
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // 시그널 대기 (타임아웃해야 함)
    assert(!scheduler.signal_wait(signal_id, 100)); // 100ms 타임아웃
    
    // 시그널 전송
    assert(scheduler.signal_send(signal_id));
    assert(scheduler.signal_is_set(signal_id));
    
    // 시그널 대기 (성공해야 함)
    assert(scheduler.signal_wait(signal_id, 1000));
    // 시그널은 wait 후에도 설정된 상태로 유지됨 (자동 리셋되지 않음)
    
    // 시그널 리셋
    scheduler.signal_send(signal_id);
    assert(scheduler.signal_is_set(signal_id));
    scheduler.signal_reset(signal_id);
    assert(!scheduler.signal_is_set(signal_id));
    
    // 시그널 삭제
    assert(scheduler.delete_signal(signal_id));
    assert(!scheduler.delete_signal(signal_id)); // 이미 삭제된 시그널
    
    std::cout << "Signal functionality test passed!" << std::endl << std::endl;
}

