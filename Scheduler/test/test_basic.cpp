#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_basic_functionality() {
    std::cout << "=== Basic Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 태스크 생성
    uint32_t task1 = scheduler.create_task(0);
    uint32_t task2 = scheduler.create_task(0);
    uint32_t task3 = scheduler.create_task(5);
    uint32_t task4 = scheduler.create_task(10);
    
    std::cout << "Created tasks: " << task1 << ", " << task2 << ", " << task3 << ", " << task4 << std::endl;
    
    // 가장 높은 우선순위 확인
    uint8_t highest_priority = scheduler.get_highest_ready_priority();
    std::cout << "Highest priority: " << (int)highest_priority << std::endl;
    assert(highest_priority == 0);
    
    // 우선순위별 태스크 수 확인
    size_t priority_0_count = scheduler.get_task_count(0);
    size_t priority_5_count = scheduler.get_task_count(5);
    size_t priority_10_count = scheduler.get_task_count(10);
    size_t total_tasks = scheduler.get_total_task_count();
    
    std::cout << "Task counts - Priority 0: " << priority_0_count 
              << ", Priority 5: " << priority_5_count 
              << ", Priority 10: " << priority_10_count 
              << ", Total: " << total_tasks << std::endl;
    
    assert(priority_0_count == 2);
    assert(priority_5_count == 1);
    assert(priority_10_count == 1);
    assert(total_tasks == 4);
    
    std::cout << "Basic functionality test passed!" << std::endl << std::endl;
}

void test_priority_ordering() {
    std::cout << "=== Priority Ordering Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 다양한 우선순위로 태스크 생성
    uint32_t task1 = scheduler.create_task(15);
    uint32_t task2 = scheduler.create_task(3);
    uint32_t task3 = scheduler.create_task(7);
    uint32_t task4 = scheduler.create_task(1);
    uint32_t task5 = scheduler.create_task(12);
    uint32_t task6 = scheduler.create_task(0);
    uint32_t task7 = scheduler.create_task(8);
    uint32_t task8 = scheduler.create_task(2);
    
    std::cout << "Created task " << task1 << " with priority 15" << std::endl;
    std::cout << "Created task " << task2 << " with priority 3" << std::endl;
    std::cout << "Created task " << task3 << " with priority 7" << std::endl;
    std::cout << "Created task " << task4 << " with priority 1" << std::endl;
    std::cout << "Created task " << task5 << " with priority 12" << std::endl;
    std::cout << "Created task " << task6 << " with priority 0" << std::endl;
    std::cout << "Created task " << task7 << " with priority 8" << std::endl;
    std::cout << "Created task " << task8 << " with priority 2" << std::endl;
    
    // 우선순위 순서대로 태스크 가져오기
    uint8_t expected_priorities[] = {0, 1, 2, 3, 7, 8, 12, 15};
    for (int i = 0; i < 8; i++) {
        auto task = scheduler.get_next_task();
        assert(task != nullptr);
        std::cout << "Got task " << task->id << " with priority " << (int)task->priority << std::endl;
        assert(task->priority == expected_priorities[i]);
    }
    
    std::cout << "Priority ordering test passed!" << std::endl << std::endl;
}

void test_bitmap_optimization() {
    std::cout << "=== Bitmap Optimization Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 비트맵 초기 상태 확인
    scheduler.print_priority_bitmap();
    
    // 특정 우선순위에 태스크 생성
    scheduler.create_task(0);
    scheduler.create_task(7);
    scheduler.create_task(15);
    scheduler.create_task(31);
    scheduler.create_task(63);
    scheduler.create_task(127);
    
    std::cout << "After creating tasks at priorities 0, 7, 15, 31, 63, 127:" << std::endl;
    scheduler.print_priority_bitmap();
    
    // 가장 높은 우선순위 확인
    uint8_t highest = scheduler.get_highest_ready_priority();
    std::cout << "Highest priority found: " << (int)highest << std::endl;
    assert(highest == 0);
    
    // 가장 높은 우선순위 태스크 제거
    auto task = scheduler.get_next_task();
    assert(task != nullptr);
    assert(task->priority == 0);
    scheduler.remove_task(task->id);
    
    std::cout << "After removing highest priority task:" << std::endl;
    scheduler.print_priority_bitmap();
    
    // 새로운 가장 높은 우선순위 확인
    uint8_t new_highest = scheduler.get_highest_ready_priority();
    std::cout << "New highest priority: " << (int)new_highest << std::endl;
    assert(new_highest == 7);
    
    std::cout << "Bitmap optimization test passed!" << std::endl << std::endl;
}

void test_task_removal() {
    std::cout << "=== Task Removal Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 태스크 생성
    scheduler.create_task(5);
    uint32_t task2 = scheduler.create_task(5);
    scheduler.create_task(5);
    scheduler.create_task(10);
    
    std::cout << "Created 4 tasks" << std::endl;
    
    // 태스크 2 제거
    bool removed = scheduler.remove_task(task2);
    assert(removed);
    std::cout << "Removed task " << task2 << std::endl;
    
    // 남은 태스크들 실행
    std::cout << "Executing remaining tasks:" << std::endl;
    while (auto task = scheduler.get_next_task()) {
        std::cout << "Executing task " << task->id << " with priority " << (int)task->priority << std::endl;
    }
    
    std::cout << "Task removal test passed!" << std::endl << std::endl;
}

void test_edge_cases() {
    std::cout << "=== Edge Cases Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 잘못된 우선순위로 태스크 생성 시도
    uint32_t invalid_task = scheduler.create_task(255); // 잘못된 우선순위
    assert(invalid_task == 0);
    std::cout << "Invalid priority tests passed" << std::endl;
    
    // 빈 스케줄러에서 태스크 가져오기
    auto no_task = scheduler.get_next_task();
    assert(no_task == nullptr);
    std::cout << "Empty scheduler tests passed" << std::endl;
    
    // 최대 우선순위 테스트
    uint32_t max_priority_task = scheduler.create_task(127);
    assert(max_priority_task != 0);
    auto task = scheduler.get_next_task();
    assert(task->priority == 127);
    std::cout << "Maximum priority test passed" << std::endl;
    
    std::cout << "Edge cases test passed!" << std::endl << std::endl;
}

void performance_test() {
    std::cout << "=== Performance Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 1000개 태스크 생성
    for (int i = 0; i < 1000; i++) {
        uint8_t priority = i % 128;
        scheduler.create_task(priority);
    }
    
    std::cout << "Created 1000 tasks" << std::endl;
    
    // 모든 태스크를 우선순위 순서대로 실행
    int executed_count = 0;
    while (auto task = scheduler.get_next_task()) {
        executed_count++;
    }
    
    std::cout << "Executed " << executed_count << " tasks in priority order" << std::endl;
    assert(executed_count == 1000);
    
    std::cout << "Performance test passed!" << std::endl << std::endl;
}

