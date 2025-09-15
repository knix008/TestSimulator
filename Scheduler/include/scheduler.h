#pragma once

#include <cstdint>
#include <queue>
#include <vector>
#include <memory>
#include <map>
#include "task.h"

namespace RTOS {

// Priority levels 0-127 (128 levels), 0 is the highest priority
constexpr uint8_t MAX_PRIORITY_LEVELS = 128;

// Priority-based scheduler class
class PriorityScheduler {
private:
    // Bitmap for 128 priority levels (16 uint8_t = 128 bits)
    uint8_t priority_bitmap_[16];
    
    // Task queue for each priority level
    std::queue<std::shared_ptr<Task>> task_queues_[MAX_PRIORITY_LEVELS];
    
    // Currently running task
    std::shared_ptr<Task> current_task_;
    
    // Task ID counter
    uint32_t next_task_id_;
    
    // Blocked tasks
    std::vector<std::shared_ptr<Task>> blocked_tasks_;

    // Find highest priority from bitmap (O(1) complexity)
    uint8_t find_highest_priority() const;
    
    // Update priority bitmap
    void update_priority_bitmap(uint8_t priority, bool add);
    
    // Priority validity check
    bool is_valid_priority(uint8_t priority) const;
    
    // Change blocked task to Ready state
    void unblock_task(std::shared_ptr<Task> task);

public:
    PriorityScheduler();
    ~PriorityScheduler() = default;
    
    // Task management functions
    uint32_t create_task(uint8_t priority, void* data = nullptr);
    bool add_task(uint32_t task_id, uint8_t priority, void* data = nullptr);
    bool remove_task(uint32_t task_id);
    
    // Scheduling functions
    std::shared_ptr<Task> get_next_task();
    std::shared_ptr<Task> get_current_task() const { return current_task_; }
    void set_current_task(std::shared_ptr<Task> task) { current_task_ = task; }
    
    // Status query functions
    bool has_ready_tasks() const;
    uint8_t get_highest_ready_priority() const;
    size_t get_task_count(uint8_t priority) const;
    size_t get_total_task_count() const;
    
    // Debugging functions
    void print_priority_bitmap() const;
    void print_task_queues() const;
    void print_blocked_tasks() const;
};

} // namespace RTOS