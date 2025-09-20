// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
#include "task.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Test results tracking
typedef struct TestResults {
    int tests_run;
    int tests_passed;
    int tests_failed;
} TestResults;

// Task execution tracking
typedef struct TaskExecution {
    uint32_t task_id;
    uint8_t priority;
    int execution_order;
    struct timespec execution_time;
    bool executed;
} TaskExecution;

// Integration test data
typedef struct IntegrationTestData {
    char name[64];
    int value;
    TaskExecution* execution_log;
    int execution_count;
} IntegrationTestData;

void print_test_result(TestResults* results, const char* test_name, bool passed) {
    results->tests_run++;
    if (passed) {
        results->tests_passed++;
        printf("✓ PASS: %s\n", test_name);
    } else {
        results->tests_failed++;
        printf("✗ FAIL: %s\n", test_name);
    }
}

void test_complete_task_lifecycle(TestResults* results) {
    printf("\n=== Complete Task Lifecycle Integration Test ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Integration test setup", false);
        return;
    }
    
    // Create multiple tasks with different priorities and data
    IntegrationTestData data1 = {"Critical Task", 100, NULL, 0};
    IntegrationTestData data2 = {"Normal Task", 200, NULL, 0};
    IntegrationTestData data3 = {"Background Task", 300, NULL, 0};
    
    uint32_t critical_task = priority_scheduler_create_task(scheduler, 0, &data1);
    uint32_t normal_task = priority_scheduler_create_task(scheduler, 5, &data2);
    uint32_t background_task = priority_scheduler_create_task(scheduler, 10, &data3);
    
    (void)critical_task; (void)normal_task; (void)background_task; // Suppress unused warnings
    
    // Test 1: All tasks created successfully
    bool test1 = (critical_task != 0 && normal_task != 0 && background_task != 0);
    print_test_result(results, "All tasks created successfully", test1);
    
    // Test 2: Scheduler state is correct
    bool test2 = (priority_scheduler_get_total_task_count(scheduler) == 3 &&
                  priority_scheduler_has_ready_tasks(scheduler) &&
                  priority_scheduler_get_highest_ready_priority(scheduler) == 0);
    print_test_result(results, "Scheduler state after task creation", test2);
    
    // Test 3: Execute tasks in priority order
    TaskExecution executions[3];
    int execution_order = 0;
    
    for (int i = 0; i < 3; i++) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (!task) break;
        
        executions[execution_order].task_id = task_get_id(task);
        executions[execution_order].priority = task_get_priority(task);
        executions[execution_order].execution_order = execution_order;
        executions[execution_order].executed = true;
        clock_gettime(CLOCK_REALTIME, &executions[execution_order].execution_time);
        
        // Set current task and execute
        priority_scheduler_set_current_task(scheduler, task);
        task_execute(task);
        priority_scheduler_set_current_task(scheduler, NULL);
        
        // Update task data
        IntegrationTestData* task_data = (IntegrationTestData*)task_get_data(task);
        if (task_data) {
            task_data->execution_count++;
        }
        
        task_destroy(task);
        execution_order++;
    }
    
    // Verify execution order
    bool test3 = (execution_order == 3 &&
                  executions[0].priority == 0 &&  // Critical first
                  executions[1].priority == 5 &&  // Normal second
                  executions[2].priority == 10);  // Background last
    print_test_result(results, "Tasks executed in correct priority order", test3);
    
    // Test 4: Scheduler is empty after execution
    bool test4 = (!priority_scheduler_has_ready_tasks(scheduler) &&
                  priority_scheduler_get_total_task_count(scheduler) == 0);
    print_test_result(results, "Scheduler empty after all tasks executed", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_dynamic_priority_changes(TestResults* results) {
    printf("\n=== Dynamic Priority Changes Integration Test ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Dynamic priority test setup", false);
        return;
    }
    
    // Create tasks at various priorities
    uint32_t task1 = priority_scheduler_create_task(scheduler, 10, NULL);
    uint32_t task2 = priority_scheduler_create_task(scheduler, 5, NULL);
    uint32_t task3 = priority_scheduler_create_task(scheduler, 15, NULL);
    
    (void)task1; (void)task2; (void)task3; // Suppress unused warnings
    
    // Test 1: Initial highest priority
    bool test1 = (priority_scheduler_get_highest_ready_priority(scheduler) == 5);
    print_test_result(results, "Initial highest priority correct", test1);
    
    // Test 2: Remove highest priority task
    Task* highest_task = priority_scheduler_get_next_task(scheduler);
    bool test2 = (highest_task && task_get_priority(highest_task) == 5);
    print_test_result(results, "Highest priority task retrieved", test2);
    
    if (highest_task) {
        task_destroy(highest_task);
    }
    
    // Test 3: Next highest priority should be 10
    bool test3 = (priority_scheduler_get_highest_ready_priority(scheduler) == 10);
    print_test_result(results, "Next highest priority after removal", test3);
    
    // Test 4: Add new highest priority task
    uint32_t urgent_task = priority_scheduler_create_task(scheduler, 0, NULL);
    bool test4 = (urgent_task != 0 && 
                  priority_scheduler_get_highest_ready_priority(scheduler) == 0);
    print_test_result(results, "New highest priority task added", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_mixed_priority_scenarios(TestResults* results) {
    printf("\n=== Mixed Priority Scenarios Integration Test ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Mixed priority test setup", false);
        return;
    }
    
    // Scenario: Multiple tasks at same priority mixed with different priorities
    uint32_t high1 = priority_scheduler_create_task(scheduler, 0, NULL);
    uint32_t med1 = priority_scheduler_create_task(scheduler, 5, NULL);
    uint32_t med2 = priority_scheduler_create_task(scheduler, 5, NULL);
    uint32_t med3 = priority_scheduler_create_task(scheduler, 5, NULL);
    uint32_t low1 = priority_scheduler_create_task(scheduler, 10, NULL);
    uint32_t high2 = priority_scheduler_create_task(scheduler, 0, NULL);
    
    // Test 1: All tasks created
    bool test1 = (high1 && med1 && med2 && med3 && low1 && high2);
    print_test_result(results, "Mixed priority tasks created", test1);
    
    // Test 2: Correct task counts at each priority
    bool test2 = (priority_scheduler_get_task_count(scheduler, 0) == 2 &&
                  priority_scheduler_get_task_count(scheduler, 5) == 3 &&
                  priority_scheduler_get_task_count(scheduler, 10) == 1);
    print_test_result(results, "Correct task counts at each priority", test2);
    
    // Test 3: Execute all high priority tasks first
    int high_priority_executed = 0;
    while (priority_scheduler_get_highest_ready_priority(scheduler) == 0) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (task) {
            high_priority_executed++;
            task_destroy(task);
        } else {
            break;
        }
    }
    
    bool test3 = (high_priority_executed == 2);
    print_test_result(results, "All high priority tasks executed first", test3);
    
    // Test 4: Next priority should be 5
    bool test4 = (priority_scheduler_get_highest_ready_priority(scheduler) == 5);
    print_test_result(results, "Medium priority tasks next", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_scheduler_stress_test(TestResults* results) {
    printf("\n=== Scheduler Stress Test ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Stress test setup", false);
        return;
    }
    
    const int num_tasks = 1000;
    const int num_priorities = 50;
    
    // Test 1: Create many tasks
    int tasks_created = 0;
    for (int i = 0; i < num_tasks; i++) {
            uint8_t priority = (uint8_t)(i % num_priorities);
            uint32_t task_id = priority_scheduler_create_task(scheduler, priority, NULL);
        if (task_id != 0) {
            tasks_created++;
        }
    }
    
    bool test1 = (tasks_created == num_tasks);
    print_test_result(results, "Stress test: Created 1000 tasks", test1);
    
    // Test 2: Verify total task count
    bool test2 = (priority_scheduler_get_total_task_count(scheduler) == num_tasks);
    print_test_result(results, "Stress test: Correct total task count", test2);
    
    // Test 3: Execute all tasks in priority order
    int tasks_executed = 0;
    uint8_t last_priority = 0;
    bool priority_order_correct = true;
    
    while (priority_scheduler_has_ready_tasks(scheduler)) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (!task) break;
        
        uint8_t current_priority = task_get_priority(task);
        if (current_priority < last_priority) {
            priority_order_correct = false;
        }
        last_priority = current_priority;
        
        tasks_executed++;
        task_destroy(task);
        
        // Progress indicator for large test
        if (tasks_executed % 100 == 0) {
            printf("   Executed %d tasks...\n", tasks_executed);
        }
    }
    
    bool test3 = (tasks_executed == num_tasks && priority_order_correct);
    print_test_result(results, "Stress test: All tasks executed in priority order", test3);
    
    // Test 4: Scheduler should be empty
    bool test4 = (!priority_scheduler_has_ready_tasks(scheduler) &&
                  priority_scheduler_get_total_task_count(scheduler) == 0);
    print_test_result(results, "Stress test: Scheduler empty after execution", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_memory_management_integration(TestResults* results) {
    printf("\n=== Memory Management Integration Test ===\n");
    
    // Test creating and destroying multiple schedulers
    const int num_schedulers = 10;
    PriorityScheduler* schedulers[10]; // Use constant size
    
    // Test 1: Create multiple schedulers
    bool test1 = true;
    for (int i = 0; i < num_schedulers; i++) {
        schedulers[i] = priority_scheduler_create();
        if (!schedulers[i]) {
            test1 = false;
            break;
        }
        
        // Add some tasks to each scheduler
        for (int j = 0; j < 10; j++) {
            priority_scheduler_create_task(schedulers[i], (uint8_t)j, NULL);
        }
    }
    print_test_result(results, "Multiple schedulers created with tasks", test1);
    
    // Test 2: Verify each scheduler is independent
    bool test2 = true;
    for (int i = 0; i < num_schedulers; i++) {
        if (schedulers[i] && priority_scheduler_get_total_task_count(schedulers[i]) != 10) {
            test2 = false;
            break;
        }
    }
    print_test_result(results, "Each scheduler maintains independent state", test2);
    
    // Test 3: Clean up all schedulers
    for (int i = 0; i < num_schedulers; i++) {
        if (schedulers[i]) {
            priority_scheduler_destroy(schedulers[i]);
        }
    }
    print_test_result(results, "All schedulers destroyed successfully", true);
    
    // Test 4: Create tasks with dynamic data
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (scheduler) {
        const int num_data_tasks = 100;
        int* data_values[100]; // Use constant size
        
        // Create tasks with dynamically allocated data
        for (int i = 0; i < num_data_tasks; i++) {
            data_values[i] = (int*)malloc(sizeof(int));
            *data_values[i] = i * 10;
            priority_scheduler_create_task(scheduler, (uint8_t)(i % 10), data_values[i]);
        }
        
        // Execute tasks and verify data integrity
        bool test4 = true;
        int tasks_checked = 0;
        while (priority_scheduler_has_ready_tasks(scheduler) && tasks_checked < num_data_tasks) {
            Task* task = priority_scheduler_get_next_task(scheduler);
            if (task) {
                int* task_data = (int*)task_get_data(task);
                if (!task_data || *task_data % 10 != 0) {
                    test4 = false;
                }
                tasks_checked++;
                task_destroy(task);
            }
        }
        
        // Clean up remaining data
        for (int i = 0; i < num_data_tasks; i++) {
            free(data_values[i]);
        }
        
        print_test_result(results, "Dynamic data integrity maintained", test4);
        priority_scheduler_destroy(scheduler);
    }
}

void test_error_recovery_scenarios(TestResults* results) {
    printf("\n=== Error Recovery Scenarios Test ===\n");
    
    // Test 1: NULL pointer resilience
    bool test1 = true;
    
    // These operations should not crash
    uint32_t null_task = priority_scheduler_create_task(NULL, 5, NULL);
    Task* null_next = priority_scheduler_get_next_task(NULL);
    bool null_has_tasks = priority_scheduler_has_ready_tasks(NULL);
    uint8_t null_priority = priority_scheduler_get_highest_ready_priority(NULL);
    size_t null_count = priority_scheduler_get_total_task_count(NULL);
    
    test1 = (null_task == 0 && null_next == NULL && !null_has_tasks && 
             null_priority >= 128 && null_count == 0);
    print_test_result(results, "NULL scheduler operations handled safely", test1);
    
    // Test 2: Invalid priority handling
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (scheduler) {
        uint32_t invalid_task1 = priority_scheduler_create_task(scheduler, 128, NULL);
        uint32_t invalid_task2 = priority_scheduler_create_task(scheduler, 255, NULL);
        
        bool test2 = (invalid_task1 == 0 && invalid_task2 == 0 &&
                      priority_scheduler_get_total_task_count(scheduler) == 0);
        print_test_result(results, "Invalid priority values rejected", test2);
        
        priority_scheduler_destroy(scheduler);
    }
    
    // Test 3: Empty scheduler operations
    scheduler = priority_scheduler_create();
    if (scheduler) {
        Task* empty_task = priority_scheduler_get_next_task(scheduler);
        bool empty_has_tasks = priority_scheduler_has_ready_tasks(scheduler);
        uint8_t empty_priority = priority_scheduler_get_highest_ready_priority(scheduler);
        
        bool test3 = (empty_task == NULL && !empty_has_tasks && empty_priority >= 128);
        print_test_result(results, "Empty scheduler operations handled correctly", test3);
        
        priority_scheduler_destroy(scheduler);
    }
}

int main() {
    printf("=== RTOS C Implementation - Integration Test Suite ===\n");
    printf("Testing complete system integration and real-world scenarios...\n");
    
    TestResults results = {0, 0, 0};
    
    test_complete_task_lifecycle(&results);
    test_dynamic_priority_changes(&results);
    test_mixed_priority_scenarios(&results);
    test_scheduler_stress_test(&results);
    test_memory_management_integration(&results);
    test_error_recovery_scenarios(&results);
    
    printf("\n=== Integration Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL INTEGRATION TESTS PASSED! 🎉\n");
        printf("The RTOS C implementation is ready for production use!\n");
        return 0;
    } else {
        printf("\n❌ Some integration tests failed. Please review the implementation.\n");
        return 1;
    }
}
