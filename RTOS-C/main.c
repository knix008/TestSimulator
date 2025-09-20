// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
#include "task.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Task data for simulation
typedef struct {
    char name[64];
    int execution_time_ms;
    int remaining_time_ms;
} TaskData;

TaskData* task_data_create(const char* name, int exec_time) {
    TaskData* data = (TaskData*)malloc(sizeof(TaskData));
    if (data) {
        strncpy(data->name, name, sizeof(data->name) - 1);
        data->name[sizeof(data->name) - 1] = '\0';
        data->execution_time_ms = exec_time;
        data->remaining_time_ms = exec_time;
    }
    return data;
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
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        printf("Failed to create scheduler\n");
        return 1;
    }
    
    // Create tasks with different priorities
    printf("Creating tasks...\n");
    
    // High priority tasks (critical work)
    TaskData* emergency_data = task_data_create("Emergency Handler", 100);
    priority_scheduler_create_task(scheduler, 0, emergency_data);
    
    TaskData* critical_data = task_data_create("Critical System", 150);
    priority_scheduler_create_task(scheduler, 1, critical_data);
    
    // Medium priority tasks
    TaskData* user_input_data = task_data_create("User Input Handler", 200);
    priority_scheduler_create_task(scheduler, 5, user_input_data);
    
    TaskData* network_data = task_data_create("Network Handler", 180);
    priority_scheduler_create_task(scheduler, 6, network_data);
    
    // Low priority tasks (background work)
    TaskData* background_data = task_data_create("Background Process", 300);
    priority_scheduler_create_task(scheduler, 10, background_data);
    
    TaskData* logging_data = task_data_create("Logging System", 250);
    priority_scheduler_create_task(scheduler, 15, logging_data);
    
    // Multiple tasks with same priority
    TaskData* data1 = task_data_create("Data Processor 1", 120);
    TaskData* data2 = task_data_create("Data Processor 2", 130);
    TaskData* data3 = task_data_create("Data Processor 3", 140);
    
    priority_scheduler_create_task(scheduler, 3, data1);
    priority_scheduler_create_task(scheduler, 3, data2);
    priority_scheduler_create_task(scheduler, 3, data3);
    
    printf("Created %zu tasks\n", priority_scheduler_get_total_task_count(scheduler));
    printf("Highest priority: %u\n\n", priority_scheduler_get_highest_ready_priority(scheduler));
    
    // Priority bitmap status
    printf("Priority bitmap status:\n");
    priority_scheduler_print_priority_bitmap(scheduler);
    printf("\n");
    
    // Task queue status
    priority_scheduler_print_task_queues(scheduler);
    printf("\n");
    
    // Scheduler simulation
    printf("Starting scheduler simulation...\n");
    printf("=================================\n");
    
    int task_count = 0;
    while (priority_scheduler_has_ready_tasks(scheduler)) {
        // Get next highest priority task (O(1) complexity using bitmap)
        Task* next_task = priority_scheduler_get_next_task(scheduler);
        
        if (next_task) {
            task_count++;
            printf("\n--- Round %d ---\n", task_count);
            
            // Set current task
            priority_scheduler_set_current_task(scheduler, next_task);
            
            // Task execution simulation
            simulate_task_execution(next_task);
            
            // Clean up task data
            if (task_get_data(next_task)) {
                free(task_get_data(next_task));
            }
            
            // Destroy the task
            task_destroy(next_task);
            
            // Clear current task
            priority_scheduler_set_current_task(scheduler, NULL);
            
            // Show remaining tasks
            printf("Remaining tasks: %zu\n", priority_scheduler_get_total_task_count(scheduler));
            if (priority_scheduler_has_ready_tasks(scheduler)) {
                printf("Next highest priority: %u\n", priority_scheduler_get_highest_ready_priority(scheduler));
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
    
    PriorityScheduler* sync_scheduler = priority_scheduler_create();
    printf("Note: Synchronization components (semaphore, event, signal, message_queue)\n");
    printf("are available but not demonstrated in this simplified example.\n");
    
    // Simple demonstration with sync_scheduler
    printf("\nDemonstrating additional scheduler with different priorities:\n");
    
    // Create some tasks in the sync scheduler
    priority_scheduler_create_task(sync_scheduler, 2, NULL);
    priority_scheduler_create_task(sync_scheduler, 1, NULL);
    priority_scheduler_create_task(sync_scheduler, 3, NULL);
    
    printf("Created 3 additional tasks in sync scheduler\n");
    printf("Total tasks in sync scheduler: %zu\n", 
           priority_scheduler_get_total_task_count(sync_scheduler));
    
    // Execute them in priority order
    int task_num = 1;
    while (priority_scheduler_has_ready_tasks(sync_scheduler)) {
        Task* task = priority_scheduler_get_next_task(sync_scheduler);
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
    priority_scheduler_destroy(scheduler);
    priority_scheduler_destroy(sync_scheduler);
    
    printf("\n==========================================\n");
    printf("RTOS C Example completed successfully!\n");
    printf("==========================================\n");
    
    return 0;
}
