#include "scheduler.h"
#include <iostream>
#include <cassert>
#include <vector>

using namespace RTOS;

void test_basic_functionality() {
    std::cout << "=== Basic Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Task 생성 테스트
    uint32_t task1 = scheduler.create_task(0);   // 가장 높은 우선순위
    uint32_t task2 = scheduler.create_task(5);
    uint32_t task3 = scheduler.create_task(10);
    uint32_t task4 = scheduler.create_task(0);   // 같은 우선순위
    
    assert(task1 != 0);
    assert(task2 != 0);
    assert(task3 != 0);
    assert(task4 != 0);
    
    std::cout << "Created tasks: " << task1 << ", " << task2 << ", " << task3 << ", " << task4 << std::endl;
    
    // 가장 높은 우선순위 확인
    uint8_t highest = scheduler.get_highest_ready_priority();
    assert(highest == 0);
    std::cout << "Highest priority: " << static_cast<int>(highest) << std::endl;
    
    // Task 개수 확인
    assert(scheduler.get_task_count(0) == 2);
    assert(scheduler.get_task_count(5) == 1);
    assert(scheduler.get_task_count(10) == 1);
    assert(scheduler.get_total_task_count() == 4);
    
    std::cout << "Task counts - Priority 0: " << scheduler.get_task_count(0)
              << ", Priority 5: " << scheduler.get_task_count(5)
              << ", Priority 10: " << scheduler.get_task_count(10)
              << ", Total: " << scheduler.get_total_task_count() << std::endl;
    
    std::cout << "Basic functionality test passed!" << std::endl << std::endl;
}

void test_priority_ordering() {
    std::cout << "=== Priority Ordering Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 다양한 우선순위로 Task 생성
    std::vector<uint32_t> tasks;
    std::vector<uint8_t> priorities = {15, 3, 7, 1, 12, 0, 8, 2};
    
    for (uint8_t priority : priorities) {
        uint32_t task_id = scheduler.create_task(priority);
        tasks.push_back(task_id);
        std::cout << "Created task " << task_id << " with priority " << static_cast<int>(priority) << std::endl;
    }
    
    // 우선순위 순서대로 Task 가져오기 (0이 가장 높은 우선순위)
    std::vector<uint8_t> expected_priorities = {0, 1, 2, 3, 7, 8, 12, 15};
    
    for (uint8_t expected_priority : expected_priorities) {
        auto next_task = scheduler.get_next_task();
        assert(next_task != nullptr);
        assert(next_task->priority == expected_priority);
        std::cout << "Got task " << next_task->id << " with priority " << static_cast<int>(next_task->priority) << std::endl;
    }
    
    // 모든 Task가 소진되었는지 확인
    auto remaining_task = scheduler.get_next_task();
    assert(remaining_task == nullptr);
    assert(!scheduler.has_ready_tasks());
    
    std::cout << "Priority ordering test passed!" << std::endl << std::endl;
}

void test_bitmap_optimization() {
    std::cout << "=== Bitmap Optimization Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 비트맵 상태 확인
    scheduler.print_priority_bitmap();
    
    // Task 생성 후 비트맵 업데이트 확인
    scheduler.create_task(0);
    scheduler.create_task(7);
    scheduler.create_task(15);
    scheduler.create_task(31);
    scheduler.create_task(63);
    scheduler.create_task(127);
    
    std::cout << "After creating tasks at priorities 0, 7, 15, 31, 63, 127:" << std::endl;
    scheduler.print_priority_bitmap();
    
    // 가장 높은 우선순위 찾기 (O(1) 연산)
    uint8_t highest = scheduler.get_highest_ready_priority();
    assert(highest == 0);
    std::cout << "Highest priority found: " << static_cast<int>(highest) << std::endl;
    
    // Task 제거 후 비트맵 업데이트 확인
    auto task = scheduler.get_next_task();
    assert(task != nullptr);
    assert(task->priority == 0);
    
    std::cout << "After removing highest priority task:" << std::endl;
    scheduler.print_priority_bitmap();
    
    highest = scheduler.get_highest_ready_priority();
    assert(highest == 7);
    std::cout << "New highest priority: " << static_cast<int>(highest) << std::endl;
    
    std::cout << "Bitmap optimization test passed!" << std::endl << std::endl;
}

void test_task_removal() {
    std::cout << "=== Task Removal Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Task 생성
    scheduler.create_task(5);
    uint32_t task2 = scheduler.create_task(5);
    scheduler.create_task(5);
    scheduler.create_task(10);
    
    std::cout << "Created 4 tasks" << std::endl;
    assert(scheduler.get_total_task_count() == 4);
    assert(scheduler.get_task_count(5) == 3);
    assert(scheduler.get_task_count(10) == 1);
    
    // 특정 Task 제거
    bool removed = scheduler.remove_task(task2);
    assert(removed);
    assert(scheduler.get_total_task_count() == 3);
    assert(scheduler.get_task_count(5) == 2);
    
    std::cout << "Removed task " << task2 << std::endl;
    
    // 존재하지 않는 Task 제거 시도
    bool not_removed = scheduler.remove_task(999);
    assert(!not_removed);
    
    // 모든 Task가 제거될 때까지 실행
    while (scheduler.has_ready_tasks()) {
        auto task = scheduler.get_next_task();
        std::cout << "Executing task " << task->id << " with priority " << static_cast<int>(task->priority) << std::endl;
    }
    
    assert(scheduler.get_total_task_count() == 0);
    assert(!scheduler.has_ready_tasks());
    
    std::cout << "Task removal test passed!" << std::endl << std::endl;
}

void test_edge_cases() {
    std::cout << "=== Edge Cases Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 유효하지 않은 우선순위 테스트
    uint32_t invalid_task = scheduler.create_task(128);
    assert(invalid_task == 0);
    
    bool invalid_add = scheduler.add_task(1, 200, nullptr);
    assert(!invalid_add);
    
    std::cout << "Invalid priority tests passed" << std::endl;
    
    // 빈 스케줄러에서 Task 가져오기
    auto no_task = scheduler.get_next_task();
    assert(no_task == nullptr);
    assert(!scheduler.has_ready_tasks());
    assert(scheduler.get_highest_ready_priority() == MAX_PRIORITY_LEVELS);
    
    std::cout << "Empty scheduler tests passed" << std::endl;
    
    // 최대 우선순위 테스트
    uint32_t max_priority_task = scheduler.create_task(127);
    assert(max_priority_task != 0);
    assert(scheduler.get_highest_ready_priority() == 127);
    
    std::cout << "Maximum priority test passed" << std::endl;
    
    std::cout << "Edge cases test passed!" << std::endl << std::endl;
}

void performance_test() {
    std::cout << "=== Performance Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 많은 Task 생성
    const int num_tasks = 1000;
    std::vector<uint32_t> task_ids;
    
    for (int i = 0; i < num_tasks; ++i) {
        uint8_t priority = i % MAX_PRIORITY_LEVELS;
        uint32_t task_id = scheduler.create_task(priority);
        task_ids.push_back(task_id);
    }
    
    std::cout << "Created " << num_tasks << " tasks" << std::endl;
    assert(scheduler.get_total_task_count() == num_tasks);
    
    // 모든 Task 실행 (우선순위 순서대로)
    int executed_count = 0;
    uint8_t last_priority = 0;
    
    while (scheduler.has_ready_tasks()) {
        auto task = scheduler.get_next_task();
        assert(task != nullptr);
        
        // 우선순위가 올바른지 확인 (같거나 더 낮은 우선순위여야 함)
        assert(task->priority >= last_priority);
        last_priority = task->priority;
        
        executed_count++;
    }
    
    std::cout << "Executed " << executed_count << " tasks in priority order" << std::endl;
    assert(executed_count == num_tasks);
    
    std::cout << "Performance test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "RTOS Priority Scheduler Test Suite" << std::endl;
    std::cout << "===================================" << std::endl << std::endl;
    
    try {
        test_basic_functionality();
        test_priority_ordering();
        test_bitmap_optimization();
        test_task_removal();
        test_edge_cases();
        performance_test();
        
        std::cout << "All tests passed successfully!" << std::endl;
        std::cout << "The RTOS scheduler with bitmap optimization is working correctly." << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
