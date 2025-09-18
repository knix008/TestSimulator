#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include "timer.h"
#include "timer_task.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cassert>
#include <atomic>

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
    if (task && task->get_data()) {
        TaskData* data = static_cast<TaskData*>(task->get_data());
        std::cout << "Executing task " << task->get_id() 
                  << " (" << data->name << ") with priority " 
                  << static_cast<int>(task->get_priority()) << std::endl;
        
        // Simulation: sleep for execution time
        std::this_thread::sleep_for(std::chrono::milliseconds(data->execution_time_ms));
        
        std::cout << "Task " << task->get_id() << " (" << data->name << ") completed" << std::endl;
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
            if (next_task->get_data()) {
                delete static_cast<TaskData*>(next_task->get_data());
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
    SemaphoreManager sem_manager;
    EventManager event_manager;
    SignalManager signal_manager;
    MessageQueueManager mq_manager;
    
    // 1. Semaphore example - resource sharing
    std::cout << "\n1. Semaphore Example - Resource Sharing" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t resource_sem = sem_manager.create_semaphore(2); // 2 resources available
    std::cout << "Created resource semaphore with count: " << sem_manager.semaphore_get_count(resource_sem) << std::endl;
    
    // Resource acquisition simulation
    sync_scheduler.create_task(3);
    auto task1 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task1);
    
    std::cout << "Task " << task1->get_id() << " requesting resource..." << std::endl;
    if (sem_manager.semaphore_wait(resource_sem, 1000)) {
        std::cout << "Task " << task1->get_id() << " acquired resource. Remaining: " 
                  << sem_manager.semaphore_get_count(resource_sem) << std::endl;
        
        // Resource usage simulation
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        
        sem_manager.semaphore_post(resource_sem);
        std::cout << "Task " << task1->get_id() << " released resource. Available: " 
                  << sem_manager.semaphore_get_count(resource_sem) << std::endl;
    }
    
    // 2. Event example - task communication
    std::cout << "\n2. Event Example - Task Communication" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    
    uint32_t comm_event = event_manager.create_event();
    std::cout << "Created communication event" << std::endl;
    
    // Event bit definitions
    const uint32_t DATA_READY = 0x01;
    const uint32_t PROCESSING_DONE = 0x02;
    
    // Set data ready event
    event_manager.event_set(comm_event, DATA_READY);
    std::cout << "Data ready event set. Event bits: 0x" << std::hex 
              << event_manager.event_get_bits(comm_event) << std::dec << std::endl;
    
    sync_scheduler.create_task(4);
    auto task2 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task2);
    
    std::cout << "Task " << task2->get_id() << " waiting for data ready event..." << std::endl;
    if (event_manager.event_wait(comm_event, DATA_READY, true, 1000)) {
        std::cout << "Task " << task2->get_id() << " received data ready event" << std::endl;
        std::cout << "Processing data..." << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        
        // Set processing done event
        event_manager.event_set(comm_event, PROCESSING_DONE);
        std::cout << "Processing done event set. Event bits: 0x" << std::hex 
                  << event_manager.event_get_bits(comm_event) << std::dec << std::endl;
    }
    
    // 3. Signal example - simple notification
    std::cout << "\n3. Signal Example - Simple Notification" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t notification_signal = signal_manager.create_signal();
    std::cout << "Created notification signal" << std::endl;
    
    sync_scheduler.create_task(6);
    auto task3 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task3);
    
    std::cout << "Task " << task3->get_id() << " waiting for notification..." << std::endl;
    
    // Send signal from separate thread
    std::thread signal_sender([&]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        std::cout << "Sending notification signal..." << std::endl;
        signal_manager.signal_send(notification_signal);
    });
    
    if (signal_manager.signal_wait(notification_signal, 2000)) {
        std::cout << "Task " << task3->get_id() << " received notification signal!" << std::endl;
    }
    
    signal_sender.join();
    
    // 4. Message Queue example - task communication
    std::cout << "\n4. Message Queue Example - Task Communication" << std::endl;
    std::cout << "-----------------------------------------------" << std::endl;
    
    uint32_t msg_queue = mq_manager.create_message_queue(10); // max 10 messages
    std::cout << "Created message queue with max size: " << mq_manager.message_queue_get_max_size(msg_queue) << std::endl;
    
    sync_scheduler.create_task(7);
    auto task4 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task4);
    
    // Send messages
    std::cout << "Sending messages..." << std::endl;
    assert(mq_manager.message_queue_send(msg_queue, 1, "Hello from Task", 1000));
    assert(mq_manager.message_queue_send(msg_queue, 2, "Message Queue Test", 1000));
    assert(mq_manager.message_queue_send(msg_queue, 3, "RTOS Communication", 1000));
    
    std::cout << "Sent 3 messages. Queue count: " << mq_manager.message_queue_get_count(msg_queue) << std::endl;
    
    // Receive messages
    std::cout << "Receiving messages..." << std::endl;
    uint32_t msg_type;
    std::string msg_data;
    
    if (mq_manager.message_queue_receive(msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    if (mq_manager.message_queue_receive(msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    std::cout << "Remaining messages: " << mq_manager.message_queue_get_count(msg_queue) << std::endl;
    
    // Message object send/receive
    Message custom_msg(0, 100, "Custom Message Object", 54321);
    assert(mq_manager.message_queue_send(msg_queue, custom_msg, 1000));
    
    Message received_custom_msg;
    if (mq_manager.message_queue_receive(msg_queue, received_custom_msg, 1000)) {
        std::cout << "Received custom message - Type: " << received_custom_msg.type 
                  << ", Data: " << received_custom_msg.data 
                  << ", ID: " << received_custom_msg.id << std::endl;
    }
    
    // Synchronization objects status
    std::cout << "\nSynchronization Objects Status:" << std::endl;
    std::cout << "Semaphores: " << sem_manager.get_semaphore_count() << std::endl;
    std::cout << "Events: " << event_manager.get_event_count() << std::endl;
    std::cout << "Signals: " << signal_manager.get_signal_count() << std::endl;
    std::cout << "Message Queues: " << mq_manager.get_message_queue_count() << std::endl;
    
    // Cleanup
    sem_manager.delete_semaphore(resource_sem);
    event_manager.delete_event(comm_event);
    signal_manager.delete_signal(notification_signal);
    mq_manager.delete_message_queue(msg_queue);
    
    std::cout << "\nSynchronization mechanisms example completed!" << std::endl;
    
    // Timer example
    std::cout << "\n\n==========================================" << std::endl;
    std::cout << "Timer Example" << std::endl;
    std::cout << "==========================================" << std::endl;
    
    // Create independent timer manager
    TimerManager timer_manager;
    timer_manager.start_manager();
    
    // Check if timer manager is running
    std::cout << "Timer manager running: " << (timer_manager.is_running() ? "Yes" : "No") << std::endl;
    
    // Timer callback data
    struct TimerCallbackData {
        std::atomic<int> one_shot_count{0};
        std::atomic<int> periodic_count{0};
        std::string task_name;
        
        TimerCallbackData(const std::string& name) : task_name(name) {}
    };
    
    TimerCallbackData timer_data("Timer Demo Task");
    
    // Timer callback functions
    auto one_shot_callback = [](uint32_t timer_id, void* user_data) {
        if (user_data) {
            TimerCallbackData* data = static_cast<TimerCallbackData*>(user_data);
            data->one_shot_count++;
            std::cout << "One-shot timer " << timer_id << " expired! Count: " 
                      << data->one_shot_count.load() << std::endl;
        }
    };
    
    auto periodic_callback = [](uint32_t timer_id, void* user_data) {
        if (user_data) {
            TimerCallbackData* data = static_cast<TimerCallbackData*>(user_data);
            data->periodic_count++;
            std::cout << "Periodic timer " << timer_id << " expired! Count: " 
                      << data->periodic_count.load() << std::endl;
            
            // Stop after 5 executions
            if (data->periodic_count.load() >= 5) {
                std::cout << "Stopping periodic timer after 5 executions" << std::endl;
            }
        }
    };
    
    // 1. One-shot timer example
    std::cout << "\n1. One-shot Timer Example" << std::endl;
    std::cout << "-------------------------" << std::endl;
    
    uint32_t one_shot_timer = timer_manager.create_timer("One-shot Demo", TimerType::ONE_SHOT, 
                                                          std::chrono::milliseconds(800), 
                                                          one_shot_callback, &timer_data);
    
    std::cout << "Created one-shot timer with ID: " << one_shot_timer << std::endl;
    std::cout << "Starting one-shot timer (800ms delay)..." << std::endl;
    
    if (!timer_manager.start_timer(one_shot_timer)) {
        std::cout << "Failed to start one-shot timer!" << std::endl;
    }
    
    // 2. Periodic timer example
    std::cout << "\n2. Periodic Timer Example" << std::endl;
    std::cout << "-------------------------" << std::endl;
    
    uint32_t periodic_timer = timer_manager.create_timer("Periodic Demo", TimerType::PERIODIC, 
                                                          std::chrono::milliseconds(400), 
                                                          periodic_callback, &timer_data);
    
    std::cout << "Created periodic timer with ID: " << periodic_timer << std::endl;
    std::cout << "Starting periodic timer (400ms interval)..." << std::endl;
    
    if (!timer_manager.start_timer(periodic_timer)) {
        std::cout << "Failed to start periodic timer!" << std::endl;
    }
    
    // 3. Timer control demonstration
    std::cout << "\n3. Timer Control Demonstration" << std::endl;
    std::cout << "-------------------------------" << std::endl;
    
    uint32_t control_timer = timer_manager.create_timer("Control Demo", TimerType::ONE_SHOT, 
                                                         std::chrono::milliseconds(1000), 
                                                         one_shot_callback, &timer_data);
    
    std::cout << "Created control timer with ID: " << control_timer << std::endl;
    std::cout << "Starting control timer..." << std::endl;
    
    if (!timer_manager.start_timer(control_timer)) {
        std::cout << "Failed to start control timer!" << std::endl;
    }
    
    // Wait a bit, then stop and restart
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    std::cout << "Stopping control timer after 300ms..." << std::endl;
    if (!timer_manager.stop_timer(control_timer)) {
        std::cout << "Failed to stop control timer!" << std::endl;
    }
    
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    std::cout << "Restarting control timer..." << std::endl;
    if (!timer_manager.restart_timer(control_timer)) {
        std::cout << "Failed to restart control timer!" << std::endl;
    }
    
    // 4. Multiple timers with different intervals
    std::cout << "\n4. Multiple Timers Example" << std::endl;
    std::cout << "--------------------------" << std::endl;
    
    struct MultiTimerData {
        std::atomic<int> fast_count{0};
        std::atomic<int> medium_count{0};
        std::atomic<int> slow_count{0};
    };
    
    MultiTimerData multi_data;
    
    auto fast_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            MultiTimerData* data = static_cast<MultiTimerData*>(user_data);
            data->fast_count++;
            std::cout << "Fast timer expired! Count: " << data->fast_count.load() << std::endl;
        }
    };
    
    auto medium_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            MultiTimerData* data = static_cast<MultiTimerData*>(user_data);
            data->medium_count++;
            std::cout << "Medium timer expired! Count: " << data->medium_count.load() << std::endl;
        }
    };
    
    auto slow_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            MultiTimerData* data = static_cast<MultiTimerData*>(user_data);
            data->slow_count++;
            std::cout << "Slow timer expired! Count: " << data->slow_count.load() << std::endl;
        }
    };
    
    uint32_t fast_timer = timer_manager.create_timer("Fast Timer", TimerType::ONE_SHOT, 
                                                      std::chrono::milliseconds(200), 
                                                      fast_callback, &multi_data);
    uint32_t medium_timer = timer_manager.create_timer("Medium Timer", TimerType::ONE_SHOT, 
                                                        std::chrono::milliseconds(500), 
                                                        medium_callback, &multi_data);
    uint32_t slow_timer = timer_manager.create_timer("Slow Timer", TimerType::ONE_SHOT, 
                                                      std::chrono::milliseconds(800), 
                                                      slow_callback, &multi_data);
    
    std::cout << "Created multiple timers with different intervals:" << std::endl;
    std::cout << "  Fast timer (200ms): " << fast_timer << std::endl;
    std::cout << "  Medium timer (500ms): " << medium_timer << std::endl;
    std::cout << "  Slow timer (800ms): " << slow_timer << std::endl;
    
    if (!timer_manager.start_timer(fast_timer)) {
        std::cout << "Failed to start fast timer!" << std::endl;
    }
    if (!timer_manager.start_timer(medium_timer)) {
        std::cout << "Failed to start medium timer!" << std::endl;
    }
    if (!timer_manager.start_timer(slow_timer)) {
        std::cout << "Failed to start slow timer!" << std::endl;
    }
    
    std::cout << "Started all multiple timers" << std::endl;
    
    // Wait for all timers to execute
    std::cout << "\nWaiting for timers to execute..." << std::endl;
    std::this_thread::sleep_for(std::chrono::milliseconds(3000));
    
    // Print timer status
    std::cout << "\nTimer Status:" << std::endl;
    timer_manager.print_timer_status();
    
    // Print final results
    std::cout << "\nFinal Results:" << std::endl;
    std::cout << "One-shot timer executions: " << timer_data.one_shot_count.load() << std::endl;
    std::cout << "Periodic timer executions: " << timer_data.periodic_count.load() << std::endl;
    std::cout << "Fast timer executions: " << multi_data.fast_count.load() << std::endl;
    std::cout << "Medium timer executions: " << multi_data.medium_count.load() << std::endl;
    std::cout << "Slow timer executions: " << multi_data.slow_count.load() << std::endl;
    
    // Cleanup timers
    std::cout << "\nCleaning up timers..." << std::endl;
    timer_manager.delete_timer(one_shot_timer);
    timer_manager.delete_timer(periodic_timer);
    timer_manager.delete_timer(control_timer);
    timer_manager.delete_timer(fast_timer);
    timer_manager.delete_timer(medium_timer);
    timer_manager.delete_timer(slow_timer);
    
    // Stop timer manager
    timer_manager.stop_manager();
    
    std::cout << "\nTimer example completed!" << std::endl;
    
    // Timing System Example
    std::cout << "\n\n==========================================" << std::endl;
    std::cout << "Timing System Example" << std::endl;
    std::cout << "==========================================" << std::endl;
    
    // 1. Realtime Timing Example
    std::cout << "\n1. Realtime Timing Example" << std::endl;
    std::cout << "--------------------------" << std::endl;
    
    TimerManager realtime_manager;
    // Uses RealtimeTimingProvider by default
    
    struct TimingCallbackData {
        std::atomic<int> realtime_count{0};
        std::atomic<int> tick_count{0};
    };
    
    TimingCallbackData timing_data;
    
    auto realtime_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            TimingCallbackData* data = static_cast<TimingCallbackData*>(user_data);
            data->realtime_count++;
            std::cout << "Realtime timer expired! Count: " << data->realtime_count.load() << std::endl;
        }
    };
    
    uint32_t realtime_timer = realtime_manager.create_timer("Realtime Demo", TimerType::ONE_SHOT, 
                                                           std::chrono::milliseconds(300), 
                                                           realtime_callback, &timing_data);
    
    std::cout << "Created realtime timer with ID: " << realtime_timer << std::endl;
    std::cout << "Timing type: " << (realtime_manager.is_tick_based() ? "Tick-based" : "Realtime") << std::endl;
    
    realtime_manager.start_manager();
    realtime_manager.start_timer(realtime_timer);
    
    // 2. Tick-based Timing Example
    std::cout << "\n2. Tick-based Timing Example" << std::endl;
    std::cout << "-----------------------------" << std::endl;
    
    TimerManager tick_manager;
    
    // Set tick-based clock (10ms per tick)
    auto tick_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(10));
    tick_manager.set_clock(std::move(tick_clock));
    
    auto tick_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            TimingCallbackData* data = static_cast<TimingCallbackData*>(user_data);
            data->tick_count++;
            std::cout << "Tick-based timer expired! Count: " << data->tick_count.load() << std::endl;
        }
    };
    
    uint32_t tick_timer = tick_manager.create_timer("Tick Demo", TimerType::ONE_SHOT, 
                                                   std::chrono::milliseconds(50), // 5 ticks
                                                   tick_callback, &timing_data);
    
    std::cout << "Created tick-based timer with ID: " << tick_timer << std::endl;
    std::cout << "Timing type: " << (tick_manager.is_tick_based() ? "Tick-based" : "Realtime") << std::endl;
    std::cout << "Tick interval: " << tick_manager.get_tick_interval().count() << "ms" << std::endl;
    
    tick_manager.start_manager();
    tick_manager.start_timer(tick_timer);
    
    // 3. Timing Provider Switching Example
    std::cout << "\n3. Timing Provider Switching Example" << std::endl;
    std::cout << "-------------------------------------" << std::endl;
    
    TimerManager switch_manager;
    
    // Start with realtime
    std::cout << "Initial timing type: " << (switch_manager.is_tick_based() ? "Tick-based" : "Realtime") << std::endl;
    
    // Switch to tick-based
    auto switch_tick_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(5));
    switch_manager.set_clock(std::move(switch_tick_clock));
    
    std::cout << "After switch timing type: " << (switch_manager.is_tick_based() ? "Tick-based" : "Realtime") << std::endl;
    std::cout << "Tick interval: " << switch_manager.get_tick_interval().count() << "ms" << std::endl;
    
    // Wait for timers to execute
    std::cout << "\nWaiting for timers to execute..." << std::endl;
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    
    // Print results
    std::cout << "\nFinal Results:" << std::endl;
    std::cout << "Realtime timer executions: " << timing_data.realtime_count.load() << std::endl;
    std::cout << "Tick-based timer executions: " << timing_data.tick_count.load() << std::endl;
    
    // Cleanup
    std::cout << "\nCleaning up timing systems..." << std::endl;
    realtime_manager.delete_timer(realtime_timer);
    realtime_manager.stop_manager();
    
    tick_manager.delete_timer(tick_timer);
    tick_manager.stop_manager();
    
    std::cout << "\nTiming system example completed!" << std::endl;
    
    // Task-based Timer Example
    std::cout << "\n\n==========================================" << std::endl;
    std::cout << "Task-based Timer Example" << std::endl;
    std::cout << "==========================================" << std::endl;
    
    // 1. Task-based Timer with Scheduler
    std::cout << "\n1. Task-based Timer with Scheduler" << std::endl;
    std::cout << "-----------------------------------" << std::endl;
    
    auto task_scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager task_timer_manager(task_scheduler, 0); // High priority timer task
    
    struct TaskTimerCallbackData {
        std::atomic<int> task_timer_count{0};
        std::atomic<int> other_task_count{0};
    };
    
    TaskTimerCallbackData task_timer_data;
    
    auto task_timer_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            TaskTimerCallbackData* data = static_cast<TaskTimerCallbackData*>(user_data);
            data->task_timer_count++;
            std::cout << "Task-based timer expired! Count: " << data->task_timer_count.load() << std::endl;
        }
    };
    
    // Create timer
    uint32_t task_timer = task_timer_manager.create_timer("Task Timer", TimerType::ONE_SHOT, 
                                                         std::chrono::milliseconds(400), 
                                                         task_timer_callback, &task_timer_data);
    
    std::cout << "Created task-based timer with ID: " << task_timer << std::endl;
    
    // Create other tasks to demonstrate scheduling
    uint32_t other_task1 = task_scheduler->create_task(1); // Medium priority
    uint32_t other_task2 = task_scheduler->create_task(2); // Low priority
    
    std::cout << "Created other tasks with IDs: " << other_task1 << ", " << other_task2 << std::endl;
    
    // Start timer manager (adds timer task to scheduler)
    task_timer_manager.start_manager();
    assert(task_timer_manager.start_timer(task_timer));
    
    // 2. Run Scheduler with Timer Task
    std::cout << "\n2. Running Scheduler with Timer Task" << std::endl;
    std::cout << "------------------------------------" << std::endl;
    
    std::cout << "Starting scheduler simulation..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (task_timer_data.task_timer_count.load() == 0 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 1000) {
        
        auto task = task_scheduler->get_next_task();
        if (task) {
            std::cout << "Executing task " << task->get_id() << " with priority " 
                      << (int)task->get_priority() << std::endl;
            
            // Execute the task
            task->execute();
            
            // Count other tasks
            if (task->get_id() != task_timer_manager.get_timer_task()->get_id()) {
                task_timer_data.other_task_count++;
            }
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // 3. Task-based Timer with Tick Timing
    std::cout << "\n3. Task-based Timer with Tick Timing" << std::endl;
    std::cout << "-------------------------------------" << std::endl;
    
    auto tick_scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager tick_task_timer_manager(tick_scheduler, 0);
    
    // Set tick-based clock
    auto tick_task_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(20));
    tick_task_timer_manager.set_clock(std::move(tick_task_clock));
    
    struct TickTaskTimerData {
        std::atomic<int> tick_timer_count{0};
    };
    
    TickTaskTimerData tick_timer_data;
    
    auto tick_task_callback = [](uint32_t /*timer_id*/, void* user_data) {
        if (user_data) {
            TickTaskTimerData* data = static_cast<TickTaskTimerData*>(user_data);
            data->tick_timer_count++;
            std::cout << "Tick-based task timer expired! Count: " << data->tick_timer_count.load() << std::endl;
        }
    };
    
    uint32_t tick_task_timer = tick_task_timer_manager.create_timer("Tick Task Timer", TimerType::ONE_SHOT, 
                                                                   std::chrono::milliseconds(100), // 5 ticks
                                                                   tick_task_callback, &tick_timer_data);
    
    std::cout << "Created tick-based task timer with ID: " << tick_task_timer << std::endl;
    std::cout << "Tick interval: " << tick_task_timer_manager.get_tick_interval().count() << "ms" << std::endl;
    
    tick_task_timer_manager.start_manager();
    assert(tick_task_timer_manager.start_timer(tick_task_timer));
    
    // Run tick-based scheduler
    std::cout << "Running tick-based scheduler..." << std::endl;
    start_time = std::chrono::steady_clock::now();
    
    while (tick_timer_data.tick_timer_count.load() == 0 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 500) {
        
        auto task = tick_scheduler->get_next_task();
        if (task) {
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // Print results
    std::cout << "\nFinal Results:" << std::endl;
    std::cout << "Task-based timer executions: " << task_timer_data.task_timer_count.load() << std::endl;
    std::cout << "Other task executions: " << task_timer_data.other_task_count.load() << std::endl;
    std::cout << "Tick-based task timer executions: " << tick_timer_data.tick_timer_count.load() << std::endl;
    std::cout << "Total ticks: " << tick_task_timer_manager.get_tick_count() << std::endl;
    
    // Cleanup
    std::cout << "\nCleaning up task-based timers..." << std::endl;
    task_timer_manager.delete_timer(task_timer);
    task_timer_manager.stop_manager();
    
    tick_task_timer_manager.delete_timer(tick_task_timer);
    tick_task_timer_manager.stop_manager();
    
    std::cout << "\nTask-based timer example completed!" << std::endl;
    
    return 0;
}