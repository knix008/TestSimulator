#pragma once

#include <cstdint>
#include <queue>
#include <vector>
#include <memory>
#include <map>
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"

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
    
    // 동기화 관련 필드
    std::shared_ptr<Semaphore> waiting_semaphore;
    std::shared_ptr<Event> waiting_event;
    std::shared_ptr<Signal> waiting_signal;
    std::shared_ptr<MessageQueue> waiting_message_queue;
    uint32_t event_mask;
    bool clear_on_exit;
    
    Task(uint32_t task_id, uint8_t task_priority, void* task_data = nullptr)
        : id(task_id), priority(task_priority), state(TaskState::READY), data(task_data),
          waiting_semaphore(nullptr), waiting_event(nullptr), waiting_signal(nullptr),
          waiting_message_queue(nullptr), event_mask(0), clear_on_exit(true) {}
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
    
    // 동기화 메커니즘 관리
    std::map<uint32_t, std::shared_ptr<Semaphore>> semaphores_;
    std::map<uint32_t, std::shared_ptr<Event>> events_;
    std::map<uint32_t, std::shared_ptr<Signal>> signals_;
    std::map<uint32_t, std::shared_ptr<MessageQueue>> message_queues_;
    uint32_t next_sync_id_;
    
    // 대기 중인 Task들
    std::vector<std::shared_ptr<Task>> blocked_tasks_;

    // 비트맵에서 가장 높은 우선순위 찾기 (O(1) 연산)
    uint8_t find_highest_priority() const;
    
    // 우선순위 비트맵 업데이트
    void update_priority_bitmap(uint8_t priority, bool add);
    
    // 우선순위 유효성 검사
    bool is_valid_priority(uint8_t priority) const;
    
    // 대기 중인 Task를 Ready 상태로 복원
    void unblock_task(std::shared_ptr<Task> task);

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
    
    // 동기화 메커니즘 관리 함수들
    // Semaphore
    uint32_t create_semaphore(int initial_count = 0);
    bool delete_semaphore(uint32_t sem_id);
    bool semaphore_wait(uint32_t sem_id, uint32_t timeout_ms = 0);
    bool semaphore_post(uint32_t sem_id);
    int semaphore_get_count(uint32_t sem_id);
    
    // Event
    uint32_t create_event();
    bool delete_event(uint32_t event_id);
    bool event_wait(uint32_t event_id, uint32_t event_mask, bool clear_on_exit = true, uint32_t timeout_ms = 0);
    bool event_set(uint32_t event_id, uint32_t event_bits);
    bool event_clear(uint32_t event_id, uint32_t event_bits);
    uint32_t event_get_bits(uint32_t event_id);
    
    // Signal
    uint32_t create_signal();
    bool delete_signal(uint32_t signal_id);
    bool signal_wait(uint32_t signal_id, uint32_t timeout_ms = 0);
    bool signal_send(uint32_t signal_id);
    bool signal_reset(uint32_t signal_id);
    bool signal_is_set(uint32_t signal_id);
    
    // Message Queue
    uint32_t create_message_queue(size_t max_size = 100);
    bool delete_message_queue(uint32_t mq_id);
    bool message_queue_send(uint32_t mq_id, uint32_t type, const std::string& data, uint32_t timeout_ms = 0);
    bool message_queue_send(uint32_t mq_id, const Message& message, uint32_t timeout_ms = 0);
    bool message_queue_receive(uint32_t mq_id, uint32_t& type, std::string& data, uint32_t timeout_ms = 0);
    bool message_queue_receive(uint32_t mq_id, Message& message, uint32_t timeout_ms = 0);
    size_t message_queue_get_count(uint32_t mq_id);
    size_t message_queue_get_max_size(uint32_t mq_id);
    bool message_queue_is_empty(uint32_t mq_id);
    bool message_queue_is_full(uint32_t mq_id);
    void message_queue_clear(uint32_t mq_id);
    bool message_queue_peek(uint32_t mq_id, Message& message);
    
    // 디버깅용 함수들
    void print_priority_bitmap() const;
    void print_task_queues() const;
    void print_sync_objects() const;
};

} // namespace RTOS