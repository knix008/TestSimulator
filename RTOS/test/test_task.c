#include "../include/task.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <stdint.h>

// Test function declarations
void test_task_basic_operations(void);
void test_task_state_management(void);
void test_task_priority_handling(void);
void test_task_edge_cases(void);

// Task execution counters for testing
static int task1_executed = 0;
static int task2_executed = 0;
static int task3_executed = 0;

// Simple task functions for testing
void test_task1_function(void* data) {
    (void)data; // Suppress unused parameter warning
    task1_executed++;
    printf("  Task 1 executed (count: %d)\n", task1_executed);
}

void test_task2_function(void* data) {
    (void)data; // Suppress unused parameter warning
    task2_executed++;
    printf("  Task 2 executed (count: %d)\n", task2_executed);
}

void test_task3_function(void* data) {
    (void)data; // Suppress unused parameter warning
    task3_executed++;
    printf("  Task 3 executed (count: %d)\n", task3_executed);
}

int main() {
    printf("====================================================\n");
    printf("              Task Component Tests                \n");
    printf("====================================================\n");
    
    test_task_basic_operations();
    test_task_state_management();
    test_task_priority_handling();
    test_task_edge_cases();
    
    printf("\n====================================================\n");
    printf("            All Task Tests PASSED!                \n");
    printf("====================================================\n");
    
    return 0;
}

void test_task_basic_operations(void) {
    printf("\n--- Testing Basic Task Operations ---\n");
    
    Task task;
    void* test_data = (void*)0x12345678;
    
    // Test task initialization
    task_init(&task, 1, 5, test_task1_function, test_data);
    
    assert(task_get_id(&task) == 1);
    assert(task_get_priority(&task) == 5);
    assert(task_get_state(&task) == TASK_READY);
    assert(task_get_function(&task) == test_task1_function);
    assert(task_get_data(&task) == test_data);
    printf("✓ Task initialization correct\n");
    
    // Test task execution
    task1_executed = 0;
    task_execute(&task);
    assert(task1_executed == 1);
    printf("✓ Task execution works correctly\n");
    
    // Test setters
    task_set_priority(&task, 10);
    assert(task_get_priority(&task) == 10);
    
    void* new_data = (void*)(uintptr_t)0x87654321;
    task_set_data(&task, new_data);
    assert(task_get_data(&task) == new_data);
    printf("✓ Task setters work correctly\n");
    
    printf("Basic operations test PASSED\n");
}

void test_task_state_management(void) {
    printf("\n--- Testing Task State Management ---\n");
    
    Task task;
    task_init(&task, 2, 3, test_task2_function, NULL);
    
    // Test initial state
    assert(task_get_state(&task) == TASK_READY);
    printf("✓ Initial state is READY\n");
    
    // Test state transitions
    task_set_state(&task, TASK_RUNNING);
    assert(task_get_state(&task) == TASK_RUNNING);
    printf("✓ State changed to RUNNING\n");
    
    task_set_state(&task, TASK_BLOCKED);
    assert(task_get_state(&task) == TASK_BLOCKED);
    printf("✓ State changed to BLOCKED\n");
    
    task_set_state(&task, TASK_SUSPENDED);
    assert(task_get_state(&task) == TASK_SUSPENDED);
    printf("✓ State changed to SUSPENDED\n");
    
    task_set_state(&task, TASK_READY);
    assert(task_get_state(&task) == TASK_READY);
    printf("✓ State changed back to READY\n");
    
    // Test execution in different states
    task2_executed = 0;
    
    // Execute in READY state (should work)
    task_execute(&task);
    assert(task2_executed == 1);
    printf("✓ Task execution in READY state works\n");
    
    // Set to BLOCKED and try to execute
    task_set_state(&task, TASK_BLOCKED);
    task_execute(&task); // Should still execute (our implementation doesn't check state)
    assert(task2_executed == 2);
    printf("✓ Task execution in BLOCKED state works\n");
    
    printf("State management test PASSED\n");
}

void test_task_priority_handling(void) {
    printf("\n--- Testing Task Priority Handling ---\n");
    
    Task tasks[5];
    
    // Create tasks with different priorities
    for (int i = 0; i < 5; i++) {
        task_init(&tasks[i], i + 1, (uint8_t)(i * 2), test_task1_function, NULL);
    }
    
    // Test priority values
    assert(task_get_priority(&tasks[0]) == 0); // Highest priority
    assert(task_get_priority(&tasks[1]) == 2);
    assert(task_get_priority(&tasks[2]) == 4);
    assert(task_get_priority(&tasks[3]) == 6);
    assert(task_get_priority(&tasks[4]) == 8); // Lowest priority
    printf("✓ Tasks created with correct priorities\n");
    
    // Test priority comparison (lower number = higher priority)
    assert(task_get_priority(&tasks[0]) < task_get_priority(&tasks[1]));
    assert(task_get_priority(&tasks[1]) < task_get_priority(&tasks[2]));
    printf("✓ Priority ordering correct\n");
    
    // Test priority modification
    task_set_priority(&tasks[0], 15);
    assert(task_get_priority(&tasks[0]) == 15);
    printf("✓ Priority modification works\n");
    
    // Test edge case priorities
    task_set_priority(&tasks[0], 0);   // Highest priority
    task_set_priority(&tasks[1], 255); // Lowest priority
    assert(task_get_priority(&tasks[0]) == 0);
    assert(task_get_priority(&tasks[1]) == 255);
    printf("✓ Edge case priorities handled\n");
    
    printf("Priority handling test PASSED\n");
}

void test_task_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Task task;
    task_init(&task, 999, 0, test_task3_function, NULL);
    
    // Test NULL parameters
    task_init(NULL, 1, 1, test_task1_function, NULL); // Should handle NULL gracefully
    assert(task_get_id(NULL) == 0);
    assert(task_get_priority(NULL) == 0);
    assert(task_get_state(NULL) == TASK_READY);
    assert(task_get_function(NULL) == NULL);
    assert(task_get_data(NULL) == NULL);
    printf("✓ NULL task parameter handling correct\n");
    
    // Test task with NULL function
    Task null_func_task;
    task_init(&null_func_task, 100, 5, NULL, NULL);
    assert(task_get_function(&null_func_task) == NULL);
    
    // Execute task with NULL function (should not crash)
    task_execute(&null_func_task);
    printf("✓ Task with NULL function handling\n");
    
    // Test task with NULL data
    Task null_data_task;
    task_init(&null_data_task, 101, 5, test_task1_function, NULL);
    assert(task_get_data(&null_data_task) == NULL);
    
    task1_executed = 0;
    task_execute(&null_data_task);
    assert(task1_executed == 1);
    printf("✓ Task with NULL data handling\n");
    
    // Test task with invalid ID
    Task invalid_id_task;
    task_init(&invalid_id_task, 0, 5, test_task1_function, NULL); // ID 0
    assert(task_get_id(&invalid_id_task) == 0);
    printf("✓ Task with ID 0 handling\n");
    
    // Test task with maximum ID
    task_init(&invalid_id_task, 0xFFFFFFFF, 5, test_task1_function, NULL);
    assert(task_get_id(&invalid_id_task) == 0xFFFFFFFF);
    printf("✓ Task with maximum ID handling\n");
    
    // Test task with invalid priority
    task_set_priority(&task, 0xFF); // Maximum uint8_t value
    assert(task_get_priority(&task) == 0xFF);
    printf("✓ Task with maximum priority handling\n");
    
    // Test task with invalid state
    task_set_state(&task, (TaskState)999); // Invalid state
    assert(task_get_state(&task) == (TaskState)999);
    printf("✓ Task with invalid state handling\n");
    
    // Test task execution multiple times
    task3_executed = 0;
    for (int i = 0; i < 10; i++) {
        task_execute(&task);
    }
    assert(task3_executed == 10);
    printf("✓ Multiple task executions work\n");
    
    // Test task with large data pointer
    void* large_data = (void*)(uintptr_t)0xFFFFFFFF;
    task_set_data(&task, large_data);
    assert(task_get_data(&task) == large_data);
    printf("✓ Task with large data pointer handling\n");
    
    printf("Edge cases test PASSED\n");
}
