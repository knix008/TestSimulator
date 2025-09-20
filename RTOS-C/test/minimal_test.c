#include "scheduler.h"
#include "task.h"
#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("=== Minimal RTOS C Test ===\n");
    
    // Test scheduler creation
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        printf("FAILED: Could not create scheduler\n");
        return 1;
    }
    printf("SUCCESS: Scheduler created\n");
    
    // Test task creation
    uint32_t task1 = priority_scheduler_create_task(scheduler, 0, NULL);
    uint32_t task2 = priority_scheduler_create_task(scheduler, 5, NULL);
    
    if (task1 == 0 || task2 == 0) {
        printf("FAILED: Could not create tasks\n");
        priority_scheduler_destroy(scheduler);
        return 1;
    }
    printf("SUCCESS: Created tasks %u and %u\n", task1, task2);
    
    // Test task retrieval
    Task* next_task = priority_scheduler_get_next_task(scheduler);
    if (!next_task) {
        printf("FAILED: Could not get next task\n");
        priority_scheduler_destroy(scheduler);
        return 1;
    }
    
    printf("SUCCESS: Retrieved task %u with priority %u\n", 
           task_get_id(next_task), task_get_priority(next_task));
    
    // Cleanup
    task_destroy(next_task);
    priority_scheduler_destroy(scheduler);
    
    printf("SUCCESS: All tests passed!\n");
    return 0;
}
