#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_event_functionality() {
    std::cout << "=== Event Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 이벤트 생성
    uint32_t event_id = scheduler.create_event();
    assert(event_id != 0);
    
    // 초기 이벤트 비트 확인
    assert(scheduler.event_get_bits(event_id) == 0);
    std::cout << "Created event with initial bits: " << scheduler.event_get_bits(event_id) << std::endl;
    
    // 이벤트 비트 설정
    assert(scheduler.event_set(event_id, 0x01 | 0x04)); // 비트 0과 2 설정
    assert(scheduler.event_get_bits(event_id) == 0x05);
    
    // 테스트용 태스크 생성
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // 이벤트 대기 (성공해야 함)
    assert(scheduler.event_wait(event_id, 0x01, true, 1000)); // 비트 0 대기
    assert(scheduler.event_get_bits(event_id) == 0x04); // 비트 0이 클리어됨
    
    // 이벤트 대기 (타임아웃해야 함)
    assert(!scheduler.event_wait(event_id, 0x02, true, 100)); // 비트 1 대기 (설정되지 않음)
    
    // 이벤트 비트 클리어
    scheduler.event_clear(event_id, 0x04);
    assert(scheduler.event_get_bits(event_id) == 0x00);
    
    // 이벤트 삭제
    assert(scheduler.delete_event(event_id));
    assert(!scheduler.delete_event(event_id)); // 이미 삭제된 이벤트
    
    std::cout << "Event functionality test passed!" << std::endl << std::endl;
}

