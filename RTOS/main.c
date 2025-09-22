// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
#include "task.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Simple platform sleep implementation for bare-metal
void platform_sleep_ms(uint32_t ms) {
    // Simple delay loop - in real hardware this would use hardware timer
    for (uint32_t i = 0; i < ms * 1000; i++) {
        volatile int dummy = 0;
        dummy++;
    }
}

// Task data for simulation
typedef struct {
    char name[64];
    int execution_time_ms;
    int remaining_time_ms;
} TaskData;

void task_data_init(TaskData* data, const char* name, int exec_time) {
    if (data) {
        strncpy(data->name, name, sizeof(data->name) - 1);
        data->name[sizeof(data->name) - 1] = '\0';
        data->execution_time_ms = exec_time;
        data->remaining_time_ms = exec_time;
    }
}

void simulate_task_execution(Task* task) {
    if (task && task_get_data(task)) {
        TaskData* data = (TaskData*)task_get_data(task);
        printf("Executing task %u (%s) with priority %u\n", 
               task_get_id(task), data->name, task_get_priority(task));
        
        // Simulation: sleep for execution time
        platform_sleep_ms(data->execution_time_ms);
        
        printf("Task %u (%s) completed\n", task_get_id(task), data->name);
    }
}

int main() {
    printf("RTOS Scheduler Example (C Version)\n");
    printf("===================================\n\n");
    
    PriorityScheduler scheduler;
    priority_scheduler_init(&scheduler);
    
    // Create tasks with different priorities
    printf("Creating tasks...\n");
    
    // High priority tasks (critical work)
    Task emergency_task, critical_task;
    task_init(&emergency_task, 1, 0, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &emergency_task, 0, NULL);
    
    task_init(&critical_task, 2, 1, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &critical_task, 1, NULL);
    
    // Medium priority tasks
    Task user_input_task, network_task;
    task_init(&user_input_task, 3, 5, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &user_input_task, 5, NULL);
    
    task_init(&network_task, 4, 6, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &network_task, 6, NULL);
    
    // Low priority tasks (background work)
    Task background_task, logging_task;
    task_init(&background_task, 5, 10, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &background_task, 10, NULL);
    
    task_init(&logging_task, 6, 15, NULL, NULL);
    priority_scheduler_create_task(&scheduler, &logging_task, 15, NULL);
    
    // Multiple tasks with same priority
    Task data1_task, data2_task, data3_task;
    task_init(&data1_task, 7, 3, NULL, NULL);
    task_init(&data2_task, 8, 3, NULL, NULL);
    task_init(&data3_task, 9, 3, NULL, NULL);
    
    priority_scheduler_create_task(&scheduler, &data1_task, 3, NULL);
    priority_scheduler_create_task(&scheduler, &data2_task, 3, NULL);
    priority_scheduler_create_task(&scheduler, &data3_task, 3, NULL);
    
    printf("Created %zu tasks\n", priority_scheduler_get_total_task_count(&scheduler));
    printf("Highest priority: %u\n\n", priority_scheduler_get_highest_ready_priority(&scheduler));
    
    // Priority bitmap status
    printf("Priority bitmap status:\n");
    priority_scheduler_print_priority_bitmap(&scheduler);
    printf("\n");
    
    // Task queue status
    priority_scheduler_print_task_queues(&scheduler);
    printf("\n");
    
    // Scheduler simulation
    printf("Starting scheduler simulation...\n");
    printf("=================================\n");
    
    int task_count = 0;
    while (priority_scheduler_has_ready_tasks(&scheduler)) {
        // Get next highest priority task (O(1) complexity using bitmap)
        Task* next_task = priority_scheduler_get_next_task(&scheduler);
        
        if (next_task) {
            task_count++;
            printf("\n--- Round %d ---\n", task_count);
            
            // Set current task
            priority_scheduler_set_current_task(&scheduler, next_task);
            
            // Task execution simulation
            simulate_task_execution(next_task);
            
            // Clean up task data
            if (task_get_data(next_task)) {
                free(task_get_data(next_task));
            }
            
            // Destroy the task
            task_destroy(next_task);
            
            // Clear current task
            priority_scheduler_set_current_task(&scheduler, NULL);
            
            // Show remaining tasks
            printf("Remaining tasks: %zu\n", priority_scheduler_get_total_task_count(&scheduler));
            if (priority_scheduler_has_ready_tasks(&scheduler)) {
                printf("Next highest priority: %u\n", priority_scheduler_get_highest_ready_priority(&scheduler));
            }
        }
    }
    
    printf("\n=================================\n");
    printf("Scheduler simulation completed!\n");
    printf("Total tasks executed: %d\n", task_count);
    
    printf("\nMemory cleanup completed.\n");
    
    // Synchronization mechanisms example
    printf("\n\n==========================================\n");
    printf("Synchronization Mechanisms Example\n");
    printf("==========================================\n");
    
    PriorityScheduler sync_scheduler;
    priority_scheduler_init(&sync_scheduler);
    printf("Note: Synchronization components (semaphore, event, signal, message_queue)\n");
    printf("are available but not demonstrated in this simplified example.\n");
    
    // Simple demonstration with sync_scheduler
    printf("\nDemonstrating additional scheduler with different priorities:\n");
    
    // Create some tasks in the sync scheduler
    Task sync_task1, sync_task2, sync_task3;
    task_init(&sync_task1, 11, 2, NULL, NULL);
    task_init(&sync_task2, 12, 1, NULL, NULL);
    task_init(&sync_task3, 13, 3, NULL, NULL);
    
    priority_scheduler_create_task(&sync_scheduler, &sync_task1, 2, NULL);
    priority_scheduler_create_task(&sync_scheduler, &sync_task2, 1, NULL);
    priority_scheduler_create_task(&sync_scheduler, &sync_task3, 3, NULL);
    
    printf("Created 3 additional tasks in sync scheduler\n");
    printf("Total tasks in sync scheduler: %zu\n", 
           priority_scheduler_get_total_task_count(&sync_scheduler));
    
    // Execute them in priority order
    int task_num = 1;
    while (priority_scheduler_has_ready_tasks(&sync_scheduler)) {
        Task* task = priority_scheduler_get_next_task(&sync_scheduler);
        if (task) {
            printf("Executing sync task %d: ID %u, Priority %u\n", 
                   task_num++, task_get_id(task), task_get_priority(task));
            task_execute(task);
            task_destroy(task);
        }
    }
    
    printf("\nBasic scheduler demonstration completed!\n");
    
    printf("\nNote: Advanced components (semaphore, event, signal, message_queue, timer)\n");
    printf("are available but not demonstrated in this simplified example.\n");
    printf("Use the comprehensive test suites to verify full functionality:\n");
    printf("  - test_task_management.exe\n");
    printf("  - test_scheduler_c.exe\n");
    printf("  - test_priority_bitmap.exe\n");
    printf("  - test_platform_abstraction.exe\n");
    printf("  - test_integration.exe\n");
    printf("  - run_all_tests.exe\n");
    
    // Cleanup
    priority_scheduler_destroy(&scheduler);
    priority_scheduler_destroy(&sync_scheduler);
    
    printf("\n==========================================\n");
    printf("RTOS C Example completed successfully!\n");
    printf("==========================================\n");
    
    return 0;
}
