#include "scheduler.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cassert>

using namespace RTOS;

// Task data for simulation
struct TaskData {
    std::string name;
    int execution_time_ms;
    int remaining_time_ms;
    
    TaskData(const std::string& n, int exec_time) 
        : name(n), execution_time_ms(exec_time), remaining_time_ms(exec_time) {}
};

void simulate_task_execution(std::shared_ptr<Task> task) {
    if (task && task->data) {
        TaskData* data = static_cast<TaskData*>(task->data);
        std::cout << "Executing task " << task->id 
                  << " (" << data->name << ") with priority " 
                  << static_cast<int>(task->priority) << std::endl;
        
        // Simulation: sleep for execution time
        std::this_thread::sleep_for(std::chrono::milliseconds(data->execution_time_ms));
        
        std::cout << "Task " << task->id << " (" << data->name << ") completed" << std::endl;
    }
}

int main() {
    std::cout << "RTOS Scheduler Example" << std::endl;
    std::cout << "======================" << std::endl << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create tasks with different priorities
    std::cout << "Creating tasks..." << std::endl;
    
    // High priority tasks (critical work)
    auto emergency_data = new TaskData("Emergency Handler", 100);
    scheduler.create_task(0, emergency_data);
    
    auto critical_data = new TaskData("Critical System", 150);
    scheduler.create_task(1, critical_data);
    
    // Medium priority tasks
    auto user_input_data = new TaskData("User Input Handler", 200);
    scheduler.create_task(5, user_input_data);
    
    auto network_data = new TaskData("Network Handler", 180);
    scheduler.create_task(6, network_data);
    
    // Low priority tasks (background work)
    auto background_data = new TaskData("Background Process", 300);
    scheduler.create_task(10, background_data);
    
    auto logging_data = new TaskData("Logging System", 250);
    scheduler.create_task(15, logging_data);
    
    // Multiple tasks with same priority
    auto data1 = new TaskData("Data Processor 1", 120);
    auto data2 = new TaskData("Data Processor 2", 130);
    auto data3 = new TaskData("Data Processor 3", 140);
    
    scheduler.create_task(3, data1);
    scheduler.create_task(3, data2);
    scheduler.create_task(3, data3);
    
    std::cout << "Created " << scheduler.get_total_task_count() << " tasks" << std::endl;
    std::cout << "Highest priority: " << static_cast<int>(scheduler.get_highest_ready_priority()) << std::endl << std::endl;
    
    // Priority bitmap status
    std::cout << "Priority bitmap status:" << std::endl;
    scheduler.print_priority_bitmap();
    std::cout << std::endl;
    
    // Task queue status
    scheduler.print_task_queues();
    std::cout << std::endl;
    
    // Scheduler simulation
    std::cout << "Starting scheduler simulation..." << std::endl;
    std::cout << "=================================" << std::endl;
    
    int task_count = 0;
    while (scheduler.has_ready_tasks()) {
        // Get next highest priority task (O(1) complexity using bitmap)
        auto next_task = scheduler.get_next_task();
        
        if (next_task) {
            task_count++;
            std::cout << "\n--- Round " << task_count << " ---" << std::endl;
            
            // Set current task
            scheduler.set_current_task(next_task);
            
            // Task execution simulation (in real system, this would be actual work)
            simulate_task_execution(next_task);
            
            // Clean up task data
            if (next_task->data) {
                delete static_cast<TaskData*>(next_task->data);
            }
            
            // Clear current task
            scheduler.set_current_task(nullptr);
            
            // Show remaining tasks
            std::cout << "Remaining tasks: " << scheduler.get_total_task_count() << std::endl;
            if (scheduler.has_ready_tasks()) {
                std::cout << "Next highest priority: " 
                          << static_cast<int>(scheduler.get_highest_ready_priority()) << std::endl;
            }
        }
    }
    
    std::cout << "\n=================================" << std::endl;
    std::cout << "Scheduler simulation completed!" << std::endl;
    std::cout << "Total tasks executed: " << task_count << std::endl;
    
    // Memory cleanup verification
    std::cout << "\nMemory cleanup completed." << std::endl;
    
    // Synchronization mechanisms example
    std::cout << "\n\n==========================================" << std::endl;
    std::cout << "Synchronization Mechanisms Example" << std::endl;
    std::cout << "==========================================" << std::endl;
    
    PriorityScheduler sync_scheduler;
    
    // 1. Semaphore example - resource sharing
    std::cout << "\n1. Semaphore Example - Resource Sharing" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t resource_sem = SemaphoreManager::create_semaphore(&sync_scheduler, 2); // 2 resources available
    std::cout << "Created resource semaphore with count: " << SemaphoreManager::semaphore_get_count(&sync_scheduler, resource_sem) << std::endl;
    
    // Resource acquisition simulation
    sync_scheduler.create_task(3);
    auto task1 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task1);
    
    std::cout << "Task " << task1->id << " requesting resource..." << std::endl;
    if (SemaphoreManager::semaphore_wait(&sync_scheduler, resource_sem, 1000)) {
        std::cout << "Task " << task1->id << " acquired resource. Remaining: " 
                  << SemaphoreManager::semaphore_get_count(&sync_scheduler, resource_sem) << std::endl;
        
        // Resource usage simulation
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        
        SemaphoreManager::semaphore_post(&sync_scheduler, resource_sem);
        std::cout << "Task " << task1->id << " released resource. Available: " 
                  << SemaphoreManager::semaphore_get_count(&sync_scheduler, resource_sem) << std::endl;
    }
    
    // 2. Event example - task communication
    std::cout << "\n2. Event Example - Task Communication" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    
    uint32_t comm_event = EventManager::create_event(&sync_scheduler);
    std::cout << "Created communication event" << std::endl;
    
    // Event bit definitions
    const uint32_t DATA_READY = 0x01;
    const uint32_t PROCESSING_DONE = 0x02;
    
    // Set data ready event
    EventManager::event_set(&sync_scheduler, comm_event, DATA_READY);
    std::cout << "Data ready event set. Event bits: 0x" << std::hex 
              << EventManager::event_get_bits(&sync_scheduler, comm_event) << std::dec << std::endl;
    
    sync_scheduler.create_task(4);
    auto task2 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task2);
    
    std::cout << "Task " << task2->id << " waiting for data ready event..." << std::endl;
    if (EventManager::event_wait(&sync_scheduler, comm_event, DATA_READY, true, 1000)) {
        std::cout << "Task " << task2->id << " received data ready event" << std::endl;
        std::cout << "Processing data..." << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        
        // Set processing done event
        EventManager::event_set(&sync_scheduler, comm_event, PROCESSING_DONE);
        std::cout << "Processing done event set. Event bits: 0x" << std::hex 
                  << EventManager::event_get_bits(&sync_scheduler, comm_event) << std::dec << std::endl;
    }
    
    // 3. Signal example - simple notification
    std::cout << "\n3. Signal Example - Simple Notification" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t notification_signal = SignalManager::create_signal(&sync_scheduler);
    std::cout << "Created notification signal" << std::endl;
    
    sync_scheduler.create_task(6);
    auto task3 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task3);
    
    std::cout << "Task " << task3->id << " waiting for notification..." << std::endl;
    
    // Send signal from separate thread
    std::thread signal_sender([&]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        std::cout << "Sending notification signal..." << std::endl;
        SignalManager::signal_send(&sync_scheduler, notification_signal);
    });
    
    if (SignalManager::signal_wait(&sync_scheduler, notification_signal, 2000)) {
        std::cout << "Task " << task3->id << " received notification signal!" << std::endl;
    }
    
    signal_sender.join();
    
    // 4. Message Queue example - task communication
    std::cout << "\n4. Message Queue Example - Task Communication" << std::endl;
    std::cout << "-----------------------------------------------" << std::endl;
    
    uint32_t msg_queue = MessageQueueManager::create_message_queue(&sync_scheduler, 10); // max 10 messages
    std::cout << "Created message queue with max size: " << MessageQueueManager::message_queue_get_max_size(&sync_scheduler, msg_queue) << std::endl;
    
    sync_scheduler.create_task(7);
    auto task4 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task4);
    
    // Send messages
    std::cout << "Sending messages..." << std::endl;
    assert(MessageQueueManager::message_queue_send(&sync_scheduler, msg_queue, 1, "Hello from Task", 1000));
    assert(MessageQueueManager::message_queue_send(&sync_scheduler, msg_queue, 2, "Message Queue Test", 1000));
    assert(MessageQueueManager::message_queue_send(&sync_scheduler, msg_queue, 3, "RTOS Communication", 1000));
    
    std::cout << "Sent 3 messages. Queue count: " << MessageQueueManager::message_queue_get_count(&sync_scheduler, msg_queue) << std::endl;
    
    // Receive messages
    std::cout << "Receiving messages..." << std::endl;
    uint32_t msg_type;
    std::string msg_data;
    
    if (MessageQueueManager::message_queue_receive(&sync_scheduler, msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    if (MessageQueueManager::message_queue_receive(&sync_scheduler, msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    std::cout << "Remaining messages: " << MessageQueueManager::message_queue_get_count(&sync_scheduler, msg_queue) << std::endl;
    
    // Message object send/receive
    Message custom_msg(0, 100, "Custom Message Object", 54321);
    assert(MessageQueueManager::message_queue_send(&sync_scheduler, msg_queue, custom_msg, 1000));
    
    Message received_custom_msg;
    if (MessageQueueManager::message_queue_receive(&sync_scheduler, msg_queue, received_custom_msg, 1000)) {
        std::cout << "Received custom message - Type: " << received_custom_msg.type 
                  << ", Data: " << received_custom_msg.data 
                  << ", ID: " << received_custom_msg.id << std::endl;
    }
    
    // Synchronization objects status
    std::cout << "\nSynchronization Objects Status:" << std::endl;
    sync_scheduler.print_sync_objects();
    
    // Cleanup
    SemaphoreManager::delete_semaphore(&sync_scheduler, resource_sem);
    EventManager::delete_event(&sync_scheduler, comm_event);
    SignalManager::delete_signal(&sync_scheduler, notification_signal);
    MessageQueueManager::delete_message_queue(&sync_scheduler, msg_queue);
    
    std::cout << "\nSynchronization mechanisms example completed!" << std::endl;
    
    return 0;
}