// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
#include "task.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

// Test data structure
typedef struct TestTaskData {
    char name[32];
    int value;
    bool executed;
} TestTaskData;

// Test results tracking
typedef struct TestResults {
    int tests_run;
    int tests_passed;
    int tests_failed;
} TestResults;

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

void test_scheduler_creation_destruction(TestResults* results) {
    printf("\n=== Scheduler Creation/Destruction Tests ===\n");
    
    // Test 1: Basic creation and destruction
    PriorityScheduler* scheduler = priority_scheduler_create();
    bool test1 = (scheduler != NULL);
    print_test_result(results, "Scheduler creation", test1);
    
    if (scheduler) {
        priority_scheduler_destroy(scheduler);
        print_test_result(results, "Scheduler destruction", true);
    }
    
    // Test 2: Multiple scheduler creation
    PriorityScheduler* scheduler1 = priority_scheduler_create();
    PriorityScheduler* scheduler2 = priority_scheduler_create();
    bool test2 = (scheduler1 != NULL && scheduler2 != NULL && scheduler1 != scheduler2);
    print_test_result(results, "Multiple scheduler creation", test2);
    
    if (scheduler1) priority_scheduler_destroy(scheduler1);
    if (scheduler2) priority_scheduler_destroy(scheduler2);
}

void test_task_management(TestResults* results) {
    printf("\n=== Task Management Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Task management setup", false);
        return;
    }
    
    // Test 1: Task creation with different priorities
    uint32_t task1 = priority_scheduler_create_task(scheduler, 0, NULL);   // High priority
    uint32_t task2 = priority_scheduler_create_task(scheduler, 5, NULL);   // Medium priority
    uint32_t task3 = priority_scheduler_create_task(scheduler, 10, NULL);  // Low priority
    
    bool test1 = (task1 != 0 && task2 != 0 && task3 != 0);
    print_test_result(results, "Task creation with different priorities", test1);
    
    // Test 2: Task count verification
    size_t task_count = priority_scheduler_get_total_task_count(scheduler);
    bool test2 = (task_count == 3);
    print_test_result(results, "Task count verification", test2);
    
    // Test 3: Task creation with data
    TestTaskData* data = (TestTaskData*)malloc(sizeof(TestTaskData));
    strncpy(data->name, "TestTask", sizeof(data->name) - 1);
    data->name[sizeof(data->name) - 1] = '\0';
    data->value = 42;
    data->executed = false;
    
    uint32_t task4 = priority_scheduler_create_task(scheduler, 7, data);
    bool test3 = (task4 != 0);
    print_test_result(results, "Task creation with data", test3);
    
    // Test 4: Invalid priority handling
    uint32_t invalid_task = priority_scheduler_create_task(scheduler, 200, NULL); // Invalid priority
    bool test4 = (invalid_task == 0);
    print_test_result(results, "Invalid priority handling", test4);
    
    // Cleanup
    free(data);
    priority_scheduler_destroy(scheduler);
}

void test_priority_scheduling(TestResults* results) {
    printf("\n=== Priority Scheduling Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Priority scheduling setup", false);
        return;
    }
    
    // Create tasks with different priorities (0 = highest, 127 = lowest)
    TestTaskData data1 = {"HighPriority", 1, false};
    TestTaskData data2 = {"MediumPriority", 2, false};
    TestTaskData data3 = {"LowPriority", 3, false};
    
    priority_scheduler_create_task(scheduler, 10, &data3);  // Low priority
    priority_scheduler_create_task(scheduler, 0, &data1);   // High priority  
    priority_scheduler_create_task(scheduler, 5, &data2);   // Medium priority
    
    // Test 1: Highest priority task should be retrieved first
    Task* next_task = priority_scheduler_get_next_task(scheduler);
    bool test1 = (next_task != NULL && task_get_priority(next_task) == 0);
    print_test_result(results, "Highest priority task retrieved first", test1);
    
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        bool test1b = (task_data && strcmp(task_data->name, "HighPriority") == 0);
        print_test_result(results, "Correct high priority task data", test1b);
        task_destroy(next_task);
    }
    
    // Test 2: Next highest priority task
    next_task = priority_scheduler_get_next_task(scheduler);
    bool test2 = (next_task != NULL && task_get_priority(next_task) == 5);
    print_test_result(results, "Second highest priority task retrieved", test2);
    
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        bool test2b = (task_data && strcmp(task_data->name, "MediumPriority") == 0);
        print_test_result(results, "Correct medium priority task data", test2b);
        task_destroy(next_task);
    }
    
    // Test 3: Lowest priority task last
    next_task = priority_scheduler_get_next_task(scheduler);
    bool test3 = (next_task != NULL && task_get_priority(next_task) == 10);
    print_test_result(results, "Lowest priority task retrieved last", test3);
    
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        bool test3b = (task_data && strcmp(task_data->name, "LowPriority") == 0);
        print_test_result(results, "Correct low priority task data", test3b);
        task_destroy(next_task);
    }
    
    // Test 4: No more tasks
    next_task = priority_scheduler_get_next_task(scheduler);
    bool test4 = (next_task == NULL);
    print_test_result(results, "No more tasks available", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_same_priority_fifo(TestResults* results) {
    printf("\n=== Same Priority FIFO Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "FIFO test setup", false);
        return;
    }
    
    // Create multiple tasks with same priority
    TestTaskData data1 = {"First", 1, false};
    TestTaskData data2 = {"Second", 2, false};
    TestTaskData data3 = {"Third", 3, false};
    
    priority_scheduler_create_task(scheduler, 5, &data1);
    priority_scheduler_create_task(scheduler, 5, &data2);
    priority_scheduler_create_task(scheduler, 5, &data3);
    
    // Test FIFO order for same priority
    Task* next_task = priority_scheduler_get_next_task(scheduler);
    bool test1 = false;
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        test1 = (task_data && strcmp(task_data->name, "First") == 0);
        task_destroy(next_task);
    }
    print_test_result(results, "First task in FIFO order", test1);
    
    next_task = priority_scheduler_get_next_task(scheduler);
    bool test2 = false;
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        test2 = (task_data && strcmp(task_data->name, "Second") == 0);
        task_destroy(next_task);
    }
    print_test_result(results, "Second task in FIFO order", test2);
    
    next_task = priority_scheduler_get_next_task(scheduler);
    bool test3 = false;
    if (next_task) {
        TestTaskData* task_data = (TestTaskData*)task_get_data(next_task);
        test3 = (task_data && strcmp(task_data->name, "Third") == 0);
        task_destroy(next_task);
    }
    print_test_result(results, "Third task in FIFO order", test3);
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_optimization(TestResults* results) {
    printf("\n=== Bitmap Optimization Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Bitmap test setup", false);
        return;
    }
    
    // Test 1: Empty scheduler
    bool test1 = !priority_scheduler_has_ready_tasks(scheduler);
    print_test_result(results, "Empty scheduler has no ready tasks", test1);
    
    // Test 2: Add tasks at various priorities
    priority_scheduler_create_task(scheduler, 0, NULL);   // Highest
    priority_scheduler_create_task(scheduler, 63, NULL);  // Middle
    priority_scheduler_create_task(scheduler, 127, NULL); // Lowest
    
    bool test2 = priority_scheduler_has_ready_tasks(scheduler);
    print_test_result(results, "Scheduler has ready tasks after adding", test2);
    
    // Test 3: Highest priority detection
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test3 = (highest == 0);
    print_test_result(results, "Correct highest priority detection", test3);
    
    // Test 4: Remove highest priority task and check next
    Task* task = priority_scheduler_get_next_task(scheduler);
    if (task) {
        task_destroy(task);
    }
    
    highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test4 = (highest == 63);
    print_test_result(results, "Correct next highest priority after removal", test4);
    
    // Test 5: Task count at specific priority
    size_t count_63 = priority_scheduler_get_task_count(scheduler, 63);
    bool test5 = (count_63 == 1);
    print_test_result(results, "Correct task count at priority 63", test5);
    
    priority_scheduler_destroy(scheduler);
}

void test_edge_cases(TestResults* results) {
    printf("\n=== Edge Case Tests ===\n");
    
    // Test 1: NULL scheduler operations
    bool test1 = (priority_scheduler_create_task(NULL, 0, NULL) == 0);
    print_test_result(results, "NULL scheduler task creation", test1);
    
    bool test1b = (priority_scheduler_get_next_task(NULL) == NULL);
    print_test_result(results, "NULL scheduler get next task", test1b);
    
    // Test 2: Boundary priority values
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (scheduler) {
        uint32_t task_min = priority_scheduler_create_task(scheduler, 0, NULL);   // Min priority (highest)
        uint32_t task_max = priority_scheduler_create_task(scheduler, 127, NULL); // Max priority (lowest)
        
        bool test2 = (task_min != 0 && task_max != 0);
        print_test_result(results, "Boundary priority values", test2);
        
        priority_scheduler_destroy(scheduler);
    }
    
    // Test 3: Task operations on NULL task
    bool test3 = (task_get_id(NULL) == 0);
    print_test_result(results, "NULL task get_id", test3);
    
    bool test3b = (task_get_priority(NULL) == 0);
    print_test_result(results, "NULL task get_priority", test3b);
    
    // Test 4: Task state transitions
    Task* task = task_create(1, 5, NULL);
    if (task) {
        bool test4 = task_is_ready(task);
        print_test_result(results, "New task is ready", test4);
        
        task_transition_to_running(task);
        bool test4b = task_is_running(task);
        print_test_result(results, "Task transition to running", test4b);
        
        task_transition_to_blocked(task);
        bool test4c = task_is_blocked(task);
        print_test_result(results, "Task transition to blocked", test4c);
        
        task_transition_to_suspended(task);
        bool test4d = task_is_suspended(task);
        print_test_result(results, "Task transition to suspended", test4d);
        
        task_destroy(task);
    }
}

int main() {
    printf("=== RTOS C Implementation - Scheduler Test Suite ===\n");
    printf("Testing core scheduler and task management functionality...\n");
    
    TestResults results = {0, 0, 0};
    
    test_scheduler_creation_destruction(&results);
    test_task_management(&results);
    test_priority_scheduling(&results);
    test_same_priority_fifo(&results);
    test_bitmap_optimization(&results);
    test_edge_cases(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL TESTS PASSED! 🎉\n");
        printf("The RTOS C scheduler implementation is working correctly!\n");
        return 0;
    } else {
        printf("\n❌ Some tests failed. Please check the implementation.\n");
        return 1;
    }
}
