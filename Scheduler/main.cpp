#include "scheduler.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cassert>

using namespace RTOS;

// 시뮬레이션용 Task 데이터
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
        
        // 시뮬레이션: 실행 시간만큼 대기
        std::this_thread::sleep_for(std::chrono::milliseconds(data->execution_time_ms));
        
        std::cout << "Task " << task->id << " (" << data->name << ") completed" << std::endl;
    }
}

int main() {
    std::cout << "RTOS Scheduler Example" << std::endl;
    std::cout << "======================" << std::endl << std::endl;
    
    PriorityScheduler scheduler;
    
    // 다양한 우선순위의 Task들 생성
    std::cout << "Creating tasks..." << std::endl;
    
    // 높은 우선순위 Task들 (긴급한 작업)
    auto emergency_data = new TaskData("Emergency Handler", 100);
    scheduler.create_task(0, emergency_data);
    
    auto critical_data = new TaskData("Critical System", 150);
    scheduler.create_task(1, critical_data);
    
    // 중간 우선순위 Task들
    auto user_input_data = new TaskData("User Input Handler", 200);
    scheduler.create_task(5, user_input_data);
    
    auto network_data = new TaskData("Network Handler", 180);
    scheduler.create_task(6, network_data);
    
    // 낮은 우선순위 Task들 (백그라운드 작업)
    auto background_data = new TaskData("Background Process", 300);
    scheduler.create_task(10, background_data);
    
    auto logging_data = new TaskData("Logging System", 250);
    scheduler.create_task(15, logging_data);
    
    // 동일한 우선순위의 여러 Task들
    auto data1 = new TaskData("Data Processor 1", 120);
    auto data2 = new TaskData("Data Processor 2", 130);
    auto data3 = new TaskData("Data Processor 3", 140);
    
    scheduler.create_task(3, data1);
    scheduler.create_task(3, data2);
    scheduler.create_task(3, data3);
    
    std::cout << "Created " << scheduler.get_total_task_count() << " tasks" << std::endl;
    std::cout << "Highest priority: " << static_cast<int>(scheduler.get_highest_ready_priority()) << std::endl << std::endl;
    
    // 비트맵 상태 출력
    std::cout << "Priority bitmap status:" << std::endl;
    scheduler.print_priority_bitmap();
    std::cout << std::endl;
    
    // Task 큐 상태 출력
    scheduler.print_task_queues();
    std::cout << std::endl;
    
    // 스케줄러 실행 시뮬레이션
    std::cout << "Starting scheduler simulation..." << std::endl;
    std::cout << "=================================" << std::endl;
    
    int task_count = 0;
    while (scheduler.has_ready_tasks()) {
        // 다음 실행할 Task 가져오기 (O(1) 연산으로 가장 높은 우선순위)
        auto next_task = scheduler.get_next_task();
        
        if (next_task) {
            task_count++;
            std::cout << "\n--- Round " << task_count << " ---" << std::endl;
            
            // 현재 Task 설정
            scheduler.set_current_task(next_task);
            
            // Task 실행 시뮬레이션 (실제로는 더 복잡한 로직)
            simulate_task_execution(next_task);
            
            // 실행 후 Task 데이터 정리
            if (next_task->data) {
                delete static_cast<TaskData*>(next_task->data);
            }
            
            // 현재 Task 해제
            scheduler.set_current_task(nullptr);
            
            // 남은 Task 수 출력
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
    
    // 동적 할당된 메모리 정리 확인
    std::cout << "\nMemory cleanup completed." << std::endl;
    
    // 동기화 메커니즘 예제
    std::cout << "\n\n==========================================" << std::endl;
    std::cout << "Synchronization Mechanisms Example" << std::endl;
    std::cout << "==========================================" << std::endl;
    
    PriorityScheduler sync_scheduler;
    
    // 1. Semaphore 예제 - 리소스 공유
    std::cout << "\n1. Semaphore Example - Resource Sharing" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t resource_sem = sync_scheduler.create_semaphore(2); // 2개의 리소스
    std::cout << "Created resource semaphore with count: " << sync_scheduler.semaphore_get_count(resource_sem) << std::endl;
    
    // 리소스 사용 시뮬레이션
    sync_scheduler.create_task(3);
    auto task1 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task1);
    
    std::cout << "Task " << task1->id << " requesting resource..." << std::endl;
    if (sync_scheduler.semaphore_wait(resource_sem, 1000)) {
        std::cout << "Task " << task1->id << " acquired resource. Remaining: " 
                  << sync_scheduler.semaphore_get_count(resource_sem) << std::endl;
        
        // 리소스 사용 시뮬레이션
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        
        sync_scheduler.semaphore_post(resource_sem);
        std::cout << "Task " << task1->id << " released resource. Available: " 
                  << sync_scheduler.semaphore_get_count(resource_sem) << std::endl;
    }
    
    // 2. Event 예제 - 태스크 간 통신
    std::cout << "\n2. Event Example - Task Communication" << std::endl;
    std::cout << "--------------------------------------" << std::endl;
    
    uint32_t comm_event = sync_scheduler.create_event();
    std::cout << "Created communication event" << std::endl;
    
    // 이벤트 비트 정의
    const uint32_t DATA_READY = 0x01;
    const uint32_t PROCESSING_DONE = 0x02;
    
    // 데이터 준비 이벤트 설정
    sync_scheduler.event_set(comm_event, DATA_READY);
    std::cout << "Data ready event set. Event bits: 0x" << std::hex 
              << sync_scheduler.event_get_bits(comm_event) << std::dec << std::endl;
    
    sync_scheduler.create_task(4);
    auto task2 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task2);
    
    std::cout << "Task " << task2->id << " waiting for data ready event..." << std::endl;
    if (sync_scheduler.event_wait(comm_event, DATA_READY, true, 1000)) {
        std::cout << "Task " << task2->id << " received data ready event" << std::endl;
        std::cout << "Processing data..." << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        
        // 처리 완료 이벤트 설정
        sync_scheduler.event_set(comm_event, PROCESSING_DONE);
        std::cout << "Processing done event set. Event bits: 0x" << std::hex 
                  << sync_scheduler.event_get_bits(comm_event) << std::dec << std::endl;
    }
    
    // 3. Signal 예제 - 간단한 알림
    std::cout << "\n3. Signal Example - Simple Notification" << std::endl;
    std::cout << "----------------------------------------" << std::endl;
    
    uint32_t notification_signal = sync_scheduler.create_signal();
    std::cout << "Created notification signal" << std::endl;
    
    sync_scheduler.create_task(6);
    auto task3 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task3);
    
    std::cout << "Task " << task3->id << " waiting for notification..." << std::endl;
    
    // 별도 스레드에서 시그널 전송 시뮬레이션
    std::thread signal_sender([&]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        std::cout << "Sending notification signal..." << std::endl;
        sync_scheduler.signal_send(notification_signal);
    });
    
    if (sync_scheduler.signal_wait(notification_signal, 2000)) {
        std::cout << "Task " << task3->id << " received notification signal!" << std::endl;
    }
    
    signal_sender.join();
    
    // 4. Message Queue 예제 - 태스크 간 메시지 전달
    std::cout << "\n4. Message Queue Example - Task Communication" << std::endl;
    std::cout << "-----------------------------------------------" << std::endl;
    
    uint32_t msg_queue = sync_scheduler.create_message_queue(10); // 최대 10개 메시지
    std::cout << "Created message queue with max size: " << sync_scheduler.message_queue_get_max_size(msg_queue) << std::endl;
    
    sync_scheduler.create_task(7);
    auto task4 = sync_scheduler.get_next_task();
    sync_scheduler.set_current_task(task4);
    
    // 메시지 전송
    std::cout << "Sending messages..." << std::endl;
    assert(sync_scheduler.message_queue_send(msg_queue, 1, "Hello from Task", 1000));
    assert(sync_scheduler.message_queue_send(msg_queue, 2, "Message Queue Test", 1000));
    assert(sync_scheduler.message_queue_send(msg_queue, 3, "RTOS Communication", 1000));
    
    std::cout << "Sent 3 messages. Queue count: " << sync_scheduler.message_queue_get_count(msg_queue) << std::endl;
    
    // 메시지 수신
    std::cout << "Receiving messages..." << std::endl;
    uint32_t msg_type;
    std::string msg_data;
    
    if (sync_scheduler.message_queue_receive(msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    if (sync_scheduler.message_queue_receive(msg_queue, msg_type, msg_data, 1000)) {
        std::cout << "Received message type " << msg_type << ": " << msg_data << std::endl;
    }
    
    std::cout << "Remaining messages: " << sync_scheduler.message_queue_get_count(msg_queue) << std::endl;
    
    // Message 객체를 사용한 전송/수신
    Message custom_msg(0, 100, "Custom Message Object", 54321);
    assert(sync_scheduler.message_queue_send(msg_queue, custom_msg, 1000));
    
    Message received_custom_msg;
    if (sync_scheduler.message_queue_receive(msg_queue, received_custom_msg, 1000)) {
        std::cout << "Received custom message - Type: " << received_custom_msg.type 
                  << ", Data: " << received_custom_msg.data 
                  << ", ID: " << received_custom_msg.id << std::endl;
    }
    
    // 동기화 객체 상태 출력
    std::cout << "\nSynchronization Objects Status:" << std::endl;
    sync_scheduler.print_sync_objects();
    
    // 정리
    sync_scheduler.delete_semaphore(resource_sem);
    sync_scheduler.delete_event(comm_event);
    sync_scheduler.delete_signal(notification_signal);
    sync_scheduler.delete_message_queue(msg_queue);
    
    std::cout << "\nSynchronization mechanisms example completed!" << std::endl;
    
    return 0;
}
