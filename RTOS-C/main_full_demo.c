// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
#include "task.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include "timer.h"
#include "clock.h"
#include "mutex.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Task data for simulation
typedef struct {
    char name[64];
    int execution_time_ms;
    int task_number;
} TaskData;

// Timer callback for demo
static int timer_callback_count = 0;
void demo_timer_callback(uint32_t timer_id, void* user_data) {
    timer_callback_count++;
    printf("    *** Timer %u callback executed (count: %d)\n", timer_id, timer_callback_count);
    if (user_data) {
        const char* name = (const char*)user_data;
        printf("    *** Timer data: %s\n", name);
    }
}

TaskData* task_data_create(const char* name, int exec_time, int task_num) {
    TaskData* data = (TaskData*)malloc(sizeof(TaskData));
    if (data) {
        strncpy(data->name, name, sizeof(data->name) - 1);
        data->name[sizeof(data->name) - 1] = '\0';
        data->execution_time_ms = exec_time;
        data->task_number = task_num;
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

void demonstrate_scheduler_with_priorities() {
    printf("=== Priority Scheduler Demonstration ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        printf("Failed to create scheduler\n");
        return;
    }
    
    // Create tasks with different priorities
    printf("Creating tasks with different priorities...\n");
    
    TaskData* emergency = task_data_create("Emergency Handler", 50, 1);
    TaskData* critical = task_data_create("Critical System", 75, 2);
    TaskData* normal = task_data_create("Normal Process", 100, 3);
    TaskData* background = task_data_create("Background Task", 150, 4);
    
    priority_scheduler_create_task(scheduler, 0, emergency);   // Highest priority
    priority_scheduler_create_task(scheduler, 5, normal);      // Medium priority
    priority_scheduler_create_task(scheduler, 1, critical);    // High priority
    priority_scheduler_create_task(scheduler, 10, background); // Low priority
    
    printf("Created %zu tasks\n", priority_scheduler_get_total_task_count(scheduler));
    printf("Highest priority: %u\n", priority_scheduler_get_highest_ready_priority(scheduler));
    
    // Execute tasks in priority order
    printf("\nExecuting tasks in priority order:\n");
    int task_count = 0;
    while (priority_scheduler_has_ready_tasks(scheduler)) {
        Task* next_task = priority_scheduler_get_next_task(scheduler);
        if (next_task) {
            task_count++;
            printf("\n--- Task %d ---\n", task_count);
            simulate_task_execution(next_task);
            
            // Cleanup task data
            if (task_get_data(next_task)) {
                free(task_get_data(next_task));
            }
            task_destroy(next_task);
        }
    }
    
    printf("\nScheduler demonstration completed!\n");
    priority_scheduler_destroy(scheduler);
}

void demonstrate_semaphore_resource_sharing() {
    printf("\n=== Semaphore Resource Sharing Demonstration ===\n");
    
    SemaphoreManager* sem_mgr = semaphore_manager_create();
    if (!sem_mgr) {
        printf("Failed to create semaphore manager\n");
        return;
    }
    
    // Create a resource semaphore (2 resources available)
    uint32_t resource_sem = semaphore_manager_create_semaphore(sem_mgr, 2);
    printf("Created resource semaphore with %d resources\n", 
           semaphore_manager_get_count(sem_mgr, resource_sem));
    
    // Simulate multiple tasks competing for resources
    printf("\nSimulating 5 tasks competing for 2 resources:\n");
    
    for (int i = 1; i <= 5; i++) {
        printf("Task %d requesting resource...\n", i);
        
        if (semaphore_manager_wait(sem_mgr, resource_sem, 50)) {
            printf("  Task %d: *** Acquired resource (remaining: %d)\n", 
                   i, semaphore_manager_get_count(sem_mgr, resource_sem));
            
            // Simulate resource usage
            printf("  Task %d: Using resource...\n", i);
            platform_sleep_ms(100);
            
            // Release resource
            semaphore_manager_post(sem_mgr, resource_sem);
            printf("  Task %d: Released resource (available: %d)\n", 
                   i, semaphore_manager_get_count(sem_mgr, resource_sem));
        } else {
            printf("  Task %d: *** Timeout waiting for resource\n", i);
        }
    }
    
    printf("\nSemaphore demonstration completed!\n");
    semaphore_manager_destroy(sem_mgr);
}

void demonstrate_event_communication() {
    printf("\n=== Event Communication Demonstration ===\n");
    
    EventManager* event_mgr = event_manager_create();
    if (!event_mgr) {
        printf("Failed to create event manager\n");
        return;
    }
    
    uint32_t comm_event = event_manager_create_event(event_mgr);
    printf("Created communication event\n");
    
    // Define event flags
    const uint32_t DATA_READY = 0x01;
    const uint32_t PROCESSING_DONE = 0x02;
    const uint32_t ERROR_OCCURRED = 0x04;
    
    printf("\nSimulating producer-consumer communication with events:\n");
    
    // Producer sets data ready
    printf("Producer: Data is ready\n");
    event_manager_set(event_mgr, comm_event, DATA_READY);
    printf("Event bits: 0x%08X\n", event_manager_get_bits(event_mgr, comm_event));
    
    // Consumer waits for data ready
    printf("Consumer: Waiting for data...\n");
    if (event_manager_wait(event_mgr, comm_event, DATA_READY, true, 100)) {
        printf("Consumer: *** Received data ready signal\n");
        printf("Consumer: Processing data...\n");
        platform_sleep_ms(150);
        
        // Consumer sets processing done
        event_manager_set(event_mgr, comm_event, PROCESSING_DONE);
        printf("Consumer: Processing completed\n");
        printf("Event bits: 0x%08X\n", event_manager_get_bits(event_mgr, comm_event));
    }
    
    // Producer waits for completion
    printf("Producer: Waiting for completion...\n");
    if (event_manager_wait(event_mgr, comm_event, PROCESSING_DONE, false, 100)) {
        printf("Producer: *** Received completion signal\n");
    }
    
    // Demonstrate multiple event bits
    printf("\nTesting multiple event bits:\n");
    event_manager_set(event_mgr, comm_event, DATA_READY | ERROR_OCCURRED);
    printf("Set multiple bits: 0x%08X\n", event_manager_get_bits(event_mgr, comm_event));
    
    if (event_manager_wait(event_mgr, comm_event, ERROR_OCCURRED, true, 100)) {
        printf("*** Successfully waited for error flag\n");
    }
    
    printf("Final event bits: 0x%08X\n", event_manager_get_bits(event_mgr, comm_event));
    
    printf("\nEvent demonstration completed!\n");
    event_manager_destroy(event_mgr);
}

void demonstrate_signal_notifications() {
    printf("\n=== Signal Notification Demonstration ===\n");
    
    SignalManager* signal_mgr = signal_manager_create();
    if (!signal_mgr) {
        printf("Failed to create signal manager\n");
        return;
    }
    
    uint32_t completion_signal = signal_manager_create_signal(signal_mgr);
    uint32_t error_signal = signal_manager_create_signal(signal_mgr);
    
    printf("Created completion and error signals\n");
    
    printf("\nSimulating task notification workflow:\n");
    
    // Simulate background task completion
    printf("Background task: Starting work...\n");
    platform_sleep_ms(200);
    printf("Background task: Work completed, sending signal\n");
    signal_manager_send(signal_mgr, completion_signal);
    
    // Main task waits for completion
    printf("Main task: Waiting for completion signal...\n");
    if (signal_manager_wait(signal_mgr, completion_signal, 500)) {
        printf("Main task: *** Received completion signal\n");
    } else {
        printf("Main task: *** Timeout waiting for completion\n");
    }
    
    // Test error signaling
    printf("\nTesting error signaling:\n");
    printf("Simulating error condition...\n");
    signal_manager_send(signal_mgr, error_signal);
    
    if (signal_manager_is_signaled(signal_mgr, error_signal)) {
        printf("*** Error signal detected\n");
        
        // Handle error
        if (signal_manager_wait(signal_mgr, error_signal, 100)) {
            printf("*** Error signal consumed\n");
        }
    }
    
    printf("\nSignal demonstration completed!\n");
    signal_manager_destroy(signal_mgr);
}

void demonstrate_integrated_workflow() {
    printf("\n=== Integrated Multi-Component Workflow ===\n");
    
    // Create all managers
    PriorityScheduler* scheduler = priority_scheduler_create();
    SemaphoreManager* sem_mgr = semaphore_manager_create();
    EventManager* event_mgr = event_manager_create();
    SignalManager* signal_mgr = signal_manager_create();
    
    if (!scheduler || !sem_mgr || !event_mgr || !signal_mgr) {
        printf("Failed to create RTOS managers\n");
        return;
    }
    
    printf("All RTOS managers created successfully!\n");
    
    // Create synchronization objects
    uint32_t mutex_sem = semaphore_manager_create_semaphore(sem_mgr, 1);
    uint32_t status_event = event_manager_create_event(event_mgr);
    uint32_t done_signal = signal_manager_create_signal(signal_mgr);
    
    printf("Created synchronization objects\n");
    
    // Create tasks with different priorities
    TaskData* coord_data = task_data_create("Coordinator", 100, 1);
    TaskData* worker1_data = task_data_create("Worker-1", 150, 2);
    TaskData* worker2_data = task_data_create("Worker-2", 120, 3);
    
    priority_scheduler_create_task(scheduler, 1, coord_data);
    priority_scheduler_create_task(scheduler, 5, worker1_data);
    priority_scheduler_create_task(scheduler, 5, worker2_data);
    
    printf("Created 3 tasks: 1 coordinator, 2 workers\n");
    
    printf("\nExecuting integrated workflow:\n");
    
    // Execute coordinator first (highest priority)
    Task* coordinator = priority_scheduler_get_next_task(scheduler);
    if (coordinator) {
        printf("\n1. Coordinator starting workflow...\n");
        simulate_task_execution(coordinator);
        
        // Coordinator sets up work
        printf("   Coordinator: Setting up work environment\n");
        event_manager_set(event_mgr, status_event, 0x01); // Work ready
        
        free(task_get_data(coordinator));
        task_destroy(coordinator);
    }
    
    // Execute workers
    int worker_count = 0;
    while (priority_scheduler_has_ready_tasks(scheduler)) {
        Task* worker = priority_scheduler_get_next_task(scheduler);
        if (worker) {
            worker_count++;
            printf("\n%d. Worker starting...\n", worker_count + 1);
            
            // Worker waits for work to be ready
            if (event_manager_wait(event_mgr, status_event, 0x01, false, 100)) {
                printf("   Worker: Work is ready, proceeding\n");
                
                // Acquire mutex for critical section
                if (semaphore_manager_wait(sem_mgr, mutex_sem, 100)) {
                    printf("   Worker: Acquired critical section\n");
                    simulate_task_execution(worker);
                    
                    // Release mutex
                    semaphore_manager_post(sem_mgr, mutex_sem);
                    printf("   Worker: Released critical section\n");
                    
                    // Signal completion
                    signal_manager_send(signal_mgr, done_signal);
                    printf("   Worker: Sent completion signal\n");
                }
            }
            
            free(task_get_data(worker));
            task_destroy(worker);
        }
    }
    
    // Check for completion signals
    printf("\nChecking for worker completion signals:\n");
    for (int i = 0; i < worker_count; i++) {
        if (signal_manager_wait(signal_mgr, done_signal, 50)) {
            printf("*** Received completion signal from worker\n");
        }
    }
    
    printf("\nFinal system state:\n");
    printf("- Scheduler tasks: %zu\n", priority_scheduler_get_total_task_count(scheduler));
    printf("- Semaphore count: %d\n", semaphore_manager_get_count(sem_mgr, mutex_sem));
    printf("- Event bits: 0x%08X\n", event_manager_get_bits(event_mgr, status_event));
    printf("- Signal state: %s\n", signal_manager_is_signaled(signal_mgr, done_signal) ? "Signaled" : "Not signaled");
    
    // Cleanup
    priority_scheduler_destroy(scheduler);
    semaphore_manager_destroy(sem_mgr);
    event_manager_destroy(event_mgr);
    signal_manager_destroy(signal_mgr);
    
    printf("\nIntegrated workflow demonstration completed!\n");
}

void demonstrate_message_queue_communication() {
    printf("\n*** === Message Queue Communication Demo ===\n");
    printf("Demonstrating FIFO message passing between tasks...\n");
    
    // Create message queue manager
    MessageQueueManager* mq_mgr = message_queue_manager_create();
    if (!mq_mgr) {
        printf("*** Failed to create message queue manager\n");
        return;
    }
    
    // Create message queue
    uint32_t queue_id = message_queue_manager_create_queue(mq_mgr, 5);
    printf("*** Message queue created (ID: %u, capacity: 5)\n", queue_id);
    
    // Simulate producer sending messages
    printf("\n*** Producer sending messages...\n");
    for (int i = 1; i <= 3; i++) {
        char data[32];
        snprintf(data, sizeof(data), "Message %d", i);
        Message msg = message_create(i, 100 + i, data, 12345);
        
        if (message_queue_manager_send_message(mq_mgr, queue_id, &msg, 1000)) {
            printf("  *** Sent: %s (ID: %u, Type: %u)\n", msg.data, msg.id, msg.type);
        } else {
            printf("  *** Failed to send message %d\n", i);
        }
    }
    
    // Check queue status
    size_t count = message_queue_manager_get_count(mq_mgr, queue_id);
    printf("*** Queue status: %zu messages pending\n", count);
    
    // Simulate consumer receiving messages
    printf("\n*** Consumer receiving messages...\n");
    for (int i = 0; i < 3; i++) {
        Message received_msg;
        if (message_queue_manager_receive_message(mq_mgr, queue_id, &received_msg, 1000)) {
            printf("  *** Received: %s (ID: %u, Type: %u, Sender: %u)\n", 
                   received_msg.data, received_msg.id, received_msg.type, received_msg.sender_id);
            message_destroy(&received_msg);
        } else {
            printf("  *** Failed to receive message\n");
            break;
        }
    }
    
    // Final queue status
    count = message_queue_manager_get_count(mq_mgr, queue_id);
    printf("*** Final queue status: %zu messages remaining\n", count);
    
    // Cleanup
    message_queue_manager_destroy(mq_mgr);
    printf("*** Message queue system cleaned up\n");
    
    printf("\nMessage queue communication demonstration completed!\n");
}

void demonstrate_timer_system() {
    printf("\n*** === Timer System Demo ===\n");
    printf("Demonstrating one-shot and periodic timers...\n");
    
    // Create timer manager
    TimerManager* timer_mgr = timer_manager_create();
    if (!timer_mgr) {
        printf("*** Failed to create timer manager\n");
        return;
    }
    
    // Start timer manager
    if (!timer_manager_start(timer_mgr)) {
        printf("*** Failed to start timer manager\n");
        timer_manager_destroy(timer_mgr);
        return;
    }
    printf("*** Timer manager started\n");
    
    // Create one-shot timer
    timer_callback_count = 0;
    char timer_data[] = "One-shot Timer";
    uint32_t oneshot_timer = timer_manager_create_timer(timer_mgr, "Demo One-shot", 
                                                       TIMER_ONE_SHOT, 100, 
                                                       demo_timer_callback, timer_data);
    printf("*** One-shot timer created (ID: %u)\n", oneshot_timer);
    
    // Create periodic timer
    char periodic_data[] = "Periodic Timer";
    uint32_t periodic_timer = timer_manager_create_timer(timer_mgr, "Demo Periodic", 
                                                        TIMER_PERIODIC, 75, 
                                                        demo_timer_callback, periodic_data);
    printf("*** Periodic timer created (ID: %u)\n", periodic_timer);
    
    // Start both timers
    timer_manager_start_timer(timer_mgr, oneshot_timer);
    timer_manager_start_timer(timer_mgr, periodic_timer);
    printf("*** Both timers started\n");
    
    // Let timers run for a while
    printf("\n*** Letting timers run for 300ms...\n");
    platform_sleep_ms(300);
    
    printf("*** Timer callbacks executed: %d times\n", timer_callback_count);
    
    // Stop periodic timer
    timer_manager_stop_timer(timer_mgr, periodic_timer);
    printf("*** Periodic timer stopped\n");
    
    // Print timer status
    printf("\n*** Timer Manager Status:\n");
    printf("  Total timers: %zu\n", timer_manager_get_timer_count(timer_mgr));
    printf("  Manager running: %s\n", timer_manager_is_running(timer_mgr) ? "Yes" : "No");
    
    // Cleanup
    timer_manager_delete_timer(timer_mgr, oneshot_timer);
    timer_manager_delete_timer(timer_mgr, periodic_timer);
    timer_manager_stop(timer_mgr);
    timer_manager_destroy(timer_mgr);
    printf("*** Timer system cleaned up\n");
    
    printf("\nTimer system demonstration completed!\n");
}

void demonstrate_mutex_system() {
    printf("\n*** === Mutex System Demo ===\n");
    printf("Demonstrating normal and recursive mutexes...\n");
    
    // Create mutex manager
    MutexManager* mutex_mgr = mutex_manager_create();
    if (!mutex_mgr) {
        printf("*** Failed to create mutex manager\n");
        return;
    }
    
    // Create normal mutex
    uint32_t normal_mutex = mutex_manager_create_mutex(mutex_mgr, "Normal Mutex", MUTEX_NORMAL);
    printf("*** Normal mutex created (ID: %u)\n", normal_mutex);
    
    // Create recursive mutex  
    uint32_t recursive_mutex = mutex_manager_create_mutex(mutex_mgr, "Recursive Mutex", MUTEX_RECURSIVE);
    printf("*** Recursive mutex created (ID: %u)\n", recursive_mutex);
    
    // Demonstrate normal mutex
    printf("\n*** Normal Mutex Operations:\n");
    if (mutex_manager_lock(mutex_mgr, normal_mutex, 1000)) {
        printf("  *** Task acquired normal mutex\n");
        printf("  *** Mutex is locked, owner: %u\n", 
               mutex_manager_get_owner(mutex_mgr, normal_mutex));
        
        // Try to lock again (should fail for normal mutex)
        if (!mutex_manager_try_lock(mutex_mgr, normal_mutex)) {
            printf("  *** Second lock attempt failed (expected for normal mutex)\n");
        }
        
        mutex_manager_unlock(mutex_mgr, normal_mutex);
        printf("  *** Task released normal mutex\n");
    }
    
    // Demonstrate recursive mutex
    printf("\n*** Recursive Mutex Operations:\n");
    if (mutex_manager_lock(mutex_mgr, recursive_mutex, 1000)) {
        printf("  *** Task acquired recursive mutex (count: %u)\n",
               mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
        
        // Lock again (should succeed for recursive mutex)
        if (mutex_manager_lock(mutex_mgr, recursive_mutex, 1000)) {
            printf("  *** Task acquired recursive mutex again (count: %u)\n",
                   mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
            
            // Lock third time
            if (mutex_manager_lock(mutex_mgr, recursive_mutex, 1000)) {
                printf("  *** Task acquired recursive mutex third time (count: %u)\n",
                       mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
            }
        }
        
        // Unlock sequence
        printf("  *** Unlocking recursive mutex...\n");
        mutex_manager_unlock(mutex_mgr, recursive_mutex);
        printf("    Lock count after first unlock: %u\n",
               mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
        
        mutex_manager_unlock(mutex_mgr, recursive_mutex);
        printf("    Lock count after second unlock: %u\n",
               mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
        
        mutex_manager_unlock(mutex_mgr, recursive_mutex);
        printf("    Lock count after third unlock: %u\n",
               mutex_manager_get_lock_count(mutex_mgr, recursive_mutex));
        
        printf("  *** Recursive mutex fully released\n");
    }
    
    // Print mutex manager status
    printf("\n*** Mutex Manager Status:\n");
    printf("  Total mutexes: %zu\n", mutex_manager_get_count(mutex_mgr));
    mutex_manager_print_statistics(mutex_mgr);
    
    // Cleanup
    mutex_manager_destroy(mutex_mgr);
    printf("*** Mutex system cleaned up\n");
    
    printf("\nMutex system demonstration completed!\n");
}

int main() {
    printf("================================================================================\n");
    printf("|                    RTOS C Implementation - Full Demo                        |\n");
    printf("|                 Demonstrating All Components Working Together               |\n");
    printf("================================================================================\n\n");
    
    printf("This demo showcases the complete RTOS C implementation with:\n");
    printf("- Priority Scheduler (128 levels, O(1) optimization)\n");
    printf("- Semaphore Manager (Resource sharing & mutual exclusion)\n");
    printf("- Event Manager (32-bit flags for task communication)\n");
    printf("- Signal Manager (Simple notification mechanism)\n");
    printf("- Message Queue Manager (FIFO message passing)\n");
    printf("- Timer Manager (One-shot & periodic timers)\n");
    printf("- Mutex Manager (Normal & recursive mutual exclusion)\n");
    printf("- Cross-platform threading abstraction\n\n");
    
    demonstrate_scheduler_with_priorities();
    demonstrate_semaphore_resource_sharing();
    demonstrate_event_communication();
    demonstrate_signal_notifications();
    demonstrate_message_queue_communication();
    demonstrate_timer_system();
    demonstrate_mutex_system();
    demonstrate_integrated_workflow();
    
    printf("\n================================================================================\n");
    printf("|                           DEMO COMPLETED SUCCESSFULLY!                      |\n");
    printf("|                                                                              |\n");
    printf("|  Your RTOS C implementation is working with all core components!            |\n");
    printf("|                                                                              |\n");
    printf("|  Available Components:                                                       |\n");
    printf("|  *** Priority Scheduler    *** Semaphore Manager    *** Message Queue      |\n");
    printf("|  *** Event Manager         *** Signal Manager       *** Timer Manager      |\n");
    printf("|  *** Mutex Manager         *** Platform Abstraction *** Comprehensive Test |\n");
    printf("|                                                                              |\n");
    printf("|  Run test suites: test_semaphore_c.exe, test_event_c.exe, etc.             |\n");
    printf("================================================================================\n");
    
    return 0;
}