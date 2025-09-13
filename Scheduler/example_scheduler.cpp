#include "scheduler.h"
#include <iostream>
#include <thread>
#include <chrono>

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
    
    return 0;
}
