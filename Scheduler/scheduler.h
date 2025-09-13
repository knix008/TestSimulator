#pragma once

#include <cstdint>
#include <queue>
#include <vector>
#include <memory>

namespace RTOS {

// 우선순위는 0-127 (128개), 0이 가장 높은 우선순위
constexpr uint8_t MAX_PRIORITY_LEVELS = 128;

// Task 상태 정의
enum class TaskState {
    READY,
    RUNNING,
    BLOCKED,
    SUSPENDED
};

// Task 구조체
struct Task {
    uint32_t id;
    uint8_t priority;
    TaskState state;
    void* data;
    
    Task(uint32_t task_id, uint8_t task_priority, void* task_data = nullptr)
        : id(task_id), priority(task_priority), state(TaskState::READY), data(task_data) {}
};

// 비트맵 기반 우선순위 스케줄러
class PriorityScheduler {
private:
    // 128개 우선순위를 위한 비트맵 (16개 uint8_t = 128비트)
    uint8_t priority_bitmap_[16];
    
    // 각 우선순위별 Task 큐
    std::queue<std::shared_ptr<Task>> task_queues_[MAX_PRIORITY_LEVELS];
    
    // 현재 실행 중인 Task
    std::shared_ptr<Task> current_task_;
    
    // Task ID 카운터
    uint32_t next_task_id_;

    // 비트맵에서 가장 높은 우선순위 찾기 (O(1) 연산)
    uint8_t find_highest_priority() const;
    
    // 우선순위 비트맵 업데이트
    void update_priority_bitmap(uint8_t priority, bool add);
    
    // 우선순위 유효성 검사
    bool is_valid_priority(uint8_t priority) const;

public:
    PriorityScheduler();
    ~PriorityScheduler() = default;
    
    // Task 관리 함수들
    uint32_t create_task(uint8_t priority, void* data = nullptr);
    bool add_task(uint32_t task_id, uint8_t priority, void* data = nullptr);
    bool remove_task(uint32_t task_id);
    
    // 스케줄링 함수들
    std::shared_ptr<Task> get_next_task();
    std::shared_ptr<Task> get_current_task() const { return current_task_; }
    void set_current_task(std::shared_ptr<Task> task) { current_task_ = task; }
    
    // 상태 조회 함수들
    bool has_ready_tasks() const;
    uint8_t get_highest_ready_priority() const;
    size_t get_task_count(uint8_t priority) const;
    size_t get_total_task_count() const;
    
    // 디버깅용 함수들
    void print_priority_bitmap() const;
    void print_task_queues() const;
};

} // namespace RTOS
