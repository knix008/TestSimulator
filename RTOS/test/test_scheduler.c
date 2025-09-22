#include "../include/scheduler.h"
#include "../include/task.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_scheduler_basic_operations(void);
void test_scheduler_priority_ordering(void);
void test_scheduler_task_management(void);
void test_scheduler_edge_cases(void);

// Task execution counters for testing
static int task1_executed = 0;
static int task2_executed = 0;
static int task3_executed = 0;

// Simple task functions for testing
void test_task1(void* data) {
    (void)data; // Suppress unused parameter warning
    task1_executed++;
    printf("  Task 1 executed (count: %d)\n", task1_executed);
}

void test_task2(void* data) {
    (void)data; // Suppress unused parameter warning
    task2_executed++;
    printf("  Task 2 executed (count: %d)\n", task2_executed);
}

void test_task3(void* data) {
    (void)data; // Suppress unused parameter warning
    task3_executed++;
    printf("  Task 3 executed (count: %d)\n", task3_executed);
}

int main() {
    printf("====================================================\n");
    printf("           Scheduler Component Tests               \n");
    printf("====================================================\n");
    
    test_scheduler_basic_operations();
    test_scheduler_priority_ordering();
    test_scheduler_task_management();
    test_scheduler_edge_cases();
    
    printf("\n====================================================\n");
    printf("         All Scheduler Tests PASSED!               \n");
    printf("====================================================\n");
    
    return 0;
}

void test_scheduler_basic_operations(void) {
    printf("\n--- Testing Basic Scheduler Operations ---\n");
    
    PriorityScheduler scheduler;
    priority_scheduler_init(&scheduler);
    
    // Test initial state
    assert(priority_scheduler_get_total_task_count(&scheduler) == 0);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 128);
    printf("✓ Initial state correct\n");
    
    // Test adding tasks
    Task task1, task2, task3;
    task_init(&task1, 1, 1, test_task1, NULL);
    task_init(&task2, 2, 2, test_task2, NULL);
    task_init(&task3, 3, 0, test_task3, NULL);
    
    assert(priority_scheduler_add_task(&scheduler, &task1, 1, 1, NULL));
    assert(priority_scheduler_get_task_count(&scheduler, 1) == 1);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 1);
    printf("✓ Task 1 added successfully\n");
    
    assert(priority_scheduler_add_task(&scheduler, &task2, 2, 0, NULL));
    assert(priority_scheduler_get_task_count(&scheduler, 0) == 1);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 0); // Higher priority
    printf("✓ Task 2 added successfully\n");
    
    assert(priority_scheduler_add_task(&scheduler, &task3, 3, 2, NULL));
    assert(priority_scheduler_get_task_count(&scheduler, 2) == 1);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 0);
    printf("✓ Task 3 added successfully\n");
    
    // Test removing tasks
    assert(priority_scheduler_remove_task(&scheduler, 3));
    assert(priority_scheduler_get_total_task_count(&scheduler) == 2);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 0);
    printf("✓ Task 3 removed successfully\n");
    
    priority_scheduler_destroy(&scheduler);
    printf("Basic operations test PASSED\n");
}

void test_scheduler_priority_ordering(void) {
    printf("\n--- Testing Priority Ordering ---\n");
    
    PriorityScheduler scheduler;
    priority_scheduler_init(&scheduler);
    
    // Create tasks with different priorities
    Task tasks[5];
    for (int i = 0; i < 5; i++) {
        task_init(&tasks[i], i + 1, (uint8_t)(i * 2), test_task1, NULL);
        priority_scheduler_add_task(&scheduler, &tasks[i], i + 1, (uint8_t)(i * 2), NULL);
    }
    
    assert(priority_scheduler_get_total_task_count(&scheduler) == 5);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 0); // Highest priority
    printf("✓ All tasks added with correct priorities\n");
    
    // Test executing tasks in priority order
    printf("Executing tasks in priority order:\n");
    int execution_order[5];
    int order_index = 0;
    
    while (priority_scheduler_get_total_task_count(&scheduler) > 0) {
        Task* next_task = priority_scheduler_get_next_task(&scheduler);
        assert(next_task != NULL);
        
        execution_order[order_index] = next_task->priority;
        printf("  Executing task with priority %d\n", next_task->priority);
        
        priority_scheduler_remove_task(&scheduler, next_task->id);
        order_index++;
    }
    
    // Verify execution order (should be ascending priority numbers = higher priority first)
    assert(execution_order[0] == 0); // Highest priority
    assert(execution_order[1] == 2);
    assert(execution_order[2] == 4);
    assert(execution_order[3] == 6);
    assert(execution_order[4] == 8); // Lowest priority
    printf("✓ Tasks executed in correct priority order\n");
    
    priority_scheduler_destroy(&scheduler);
    printf("Priority ordering test PASSED\n");
}

void test_scheduler_task_management(void) {
    printf("\n--- Testing Task Management ---\n");
    
    PriorityScheduler scheduler;
    priority_scheduler_init(&scheduler);
    
    // Reset execution counters
    task1_executed = 0;
    task2_executed = 0;
    task3_executed = 0;
    
    // Create and add tasks
    Task task1, task2, task3;
    task_init(&task1, 1, 0, test_task1, NULL);
    task_init(&task2, 2, 1, test_task2, NULL);
    task_init(&task3, 3, 2, test_task3, NULL);
    
    priority_scheduler_add_task(&scheduler, &task1, 1, 1, NULL);
    priority_scheduler_add_task(&scheduler, &task2, 2, 0, NULL);
    priority_scheduler_add_task(&scheduler, &task3, 3, 2, NULL);
    
    // Test getting next task (this removes it from the queue)
    Task* next = priority_scheduler_get_next_task(&scheduler);
    assert(next != NULL);
    assert(next->id == 2); // Highest priority task (priority 0)
    assert(priority_scheduler_get_total_task_count(&scheduler) == 2); // Count decreased
    printf("✓ Get next task works (removes from queue)\n");
    
    // Test task execution
    next = priority_scheduler_get_next_task(&scheduler);
    assert(next != NULL);
    printf("  Next task ID: %u, priority: %u\n", next->id, next->priority);
    if (next->function) {
        next->function(next->data);
    }
    priority_scheduler_remove_task(&scheduler, next->id);
    printf("  Task1 executed: %d, Task2 executed: %d, Task3 executed: %d\n", 
           task1_executed, task2_executed, task3_executed);
    assert(task1_executed == 1);
    printf("✓ Task execution works correctly\n");
    
    // Test remaining tasks
    assert(priority_scheduler_get_total_task_count(&scheduler) == 1);
    next = priority_scheduler_get_next_task(&scheduler);
    assert(next->id == 3); // Next highest priority (Task 3, priority 2)
    printf("✓ Next task selection correct\n");
    
    priority_scheduler_destroy(&scheduler);
    printf("Task management test PASSED\n");
}

void test_scheduler_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    PriorityScheduler scheduler;
    priority_scheduler_init(&scheduler);
    
    // Test operations on empty scheduler
    assert(priority_scheduler_get_next_task(&scheduler) == NULL);
    assert(priority_scheduler_get_highest_priority(&scheduler) == 128);
    printf("✓ Empty scheduler handling correct\n");
    
    // Test adding duplicate task
    Task task1, task2;
    task_init(&task1, 1, 0, test_task1, NULL);
    task_init(&task2, 1, 1, test_task2, NULL); // Same ID
    
    assert(priority_scheduler_add_task(&scheduler, &task1, 1, 1, NULL));
    assert(!priority_scheduler_add_task(&scheduler, &task2, 1, 0, NULL)); // Should fail - same task_id
    assert(priority_scheduler_get_total_task_count(&scheduler) == 1);
    printf("✓ Duplicate task ID handling correct\n");
    
    // Test removing non-existent task
    Task non_existent;
    task_init(&non_existent, 999, 0, test_task1, NULL);
    assert(!priority_scheduler_remove_task(&scheduler, 999));
    assert(priority_scheduler_get_total_task_count(&scheduler) == 1);
    printf("✓ Non-existent task removal handling correct\n");
    
    // Test NULL parameters
    assert(!priority_scheduler_add_task(NULL, &task1, 1, 1, NULL));
    assert(!priority_scheduler_add_task(&scheduler, NULL, 1, 1, NULL));
    assert(!priority_scheduler_remove_task(NULL, 1));
    assert(!priority_scheduler_remove_task(&scheduler, 0));
    printf("✓ NULL parameter handling correct\n");
    
    priority_scheduler_destroy(&scheduler);
    printf("Edge cases test PASSED\n");
}
