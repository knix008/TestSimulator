#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_semaphore_functionality() {
    std::cout << "=== Semaphore Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 세마포어 생성
    uint32_t sem_id = scheduler.create_semaphore(2); // 초기값 2
    assert(sem_id != 0);
    
    // 초기 카운트 확인
    assert(scheduler.semaphore_get_count(sem_id) == 2);
    std::cout << "Created semaphore with initial count: " << scheduler.semaphore_get_count(sem_id) << std::endl;
    
    // 테스트용 태스크 생성
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // 세마포어 대기 (성공해야 함)
    assert(scheduler.semaphore_wait(sem_id, 1000)); // 1초 타임아웃
    assert(scheduler.semaphore_get_count(sem_id) == 1);
    
    // 세마포어 대기 (성공해야 함)
    assert(scheduler.semaphore_wait(sem_id, 1000));
    assert(scheduler.semaphore_get_count(sem_id) == 0);
    
    // 세마포어 대기 (타임아웃해야 함)
    assert(!scheduler.semaphore_wait(sem_id, 100)); // 100ms 타임아웃
    
    // 세마포어 포스트
    scheduler.semaphore_post(sem_id);
    assert(scheduler.semaphore_get_count(sem_id) == 1);
    
    // 다시 대기 (성공해야 함)
    assert(scheduler.semaphore_wait(sem_id, 1000));
    assert(scheduler.semaphore_get_count(sem_id) == 0);
    
    // 세마포어 삭제
    assert(scheduler.delete_semaphore(sem_id));
    assert(!scheduler.delete_semaphore(sem_id)); // 이미 삭제된 세마포어
    
    std::cout << "Semaphore functionality test passed!" << std::endl << std::endl;
}

