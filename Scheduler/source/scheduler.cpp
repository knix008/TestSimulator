#include "scheduler.h"
#include <iostream>
#include <algorithm>
#include <cstring>

namespace RTOS {

PriorityScheduler::PriorityScheduler() 
    : current_task_(nullptr), next_task_id_(1), next_sync_id_(1) {
    std::memset(priority_bitmap_, 0, sizeof(priority_bitmap_));
}

uint8_t PriorityScheduler::find_highest_priority() const {
    for (int i = 0; i < 16; ++i) {
        if (priority_bitmap_[i] != 0) {
            uint8_t byte_value = priority_bitmap_[i];
            int bit_position = 0;
            
            while ((byte_value & 0x01) == 0) {
                byte_value >>= 1;
                bit_position++;
            }
            
            return static_cast<uint8_t>(i * 8 + bit_position);
        }
    }
    
    return MAX_PRIORITY_LEVELS; 
}

void PriorityScheduler::update_priority_bitmap(uint8_t priority, bool add) {
    if (!is_valid_priority(priority)) {
        return;
    }
    
    int byte_index = priority / 8;
    int bit_index = priority % 8;
    uint8_t bit_mask = 1 << bit_index;
    
    if (add) {
        priority_bitmap_[byte_index] |= bit_mask;
    } else {
        priority_bitmap_[byte_index] &= ~bit_mask;
    }
}

bool PriorityScheduler::is_valid_priority(uint8_t priority) const {
    return priority < MAX_PRIORITY_LEVELS;
}

uint32_t PriorityScheduler::create_task(uint8_t priority, void* data) {
    if (!is_valid_priority(priority)) {
        return 0; 
    }
    
    auto task = std::make_shared<Task>(next_task_id_++, priority, data);
    task_queues_[priority].push(task);
    
    update_priority_bitmap(priority, true);
    
    return task->id;
}

bool PriorityScheduler::add_task(uint32_t task_id, uint8_t priority, void* data) {
    if (!is_valid_priority(priority)) {
        return false;
    }
    
    auto task = std::make_shared<Task>(task_id, priority, data);
    task_queues_[priority].push(task);
    
    update_priority_bitmap(priority, true);
    
    return true;
}

bool PriorityScheduler::remove_task(uint32_t task_id) {
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        std::queue<std::shared_ptr<Task>> temp_queue;
        bool found = false;
        
        while (!task_queues_[priority].empty()) {
            auto task = task_queues_[priority].front();
            task_queues_[priority].pop();
            
            if (task->id == task_id) {
                found = true;
                break;
            } else {
                temp_queue.push(task);
            }
        }
        
        while (!temp_queue.empty()) {
            task_queues_[priority].push(temp_queue.front());
            temp_queue.pop();
        }
        
        if (found) {
            if (task_queues_[priority].empty()) {
                update_priority_bitmap(priority, false);
            }
            return true;
        }
    }
    
    return false;
}

std::shared_ptr<Task> PriorityScheduler::get_next_task() {
    uint8_t highest_priority = find_highest_priority();
    
    if (highest_priority >= MAX_PRIORITY_LEVELS) {
        return nullptr; 
    }
    
    if (task_queues_[highest_priority].empty()) {
        return nullptr;
    }
    
    auto next_task = task_queues_[highest_priority].front();
    task_queues_[highest_priority].pop();
    
    if (task_queues_[highest_priority].empty()) {
        update_priority_bitmap(highest_priority, false);
    }
    
    return next_task;
}

bool PriorityScheduler::has_ready_tasks() const {
    for (int i = 0; i < 16; ++i) {
        if (priority_bitmap_[i] != 0) {
            return true;
        }
    }
    return false;
}

uint8_t PriorityScheduler::get_highest_ready_priority() const {
    return find_highest_priority();
}

size_t PriorityScheduler::get_task_count(uint8_t priority) const {
    if (!is_valid_priority(priority)) {
        return 0;
    }
    
    return task_queues_[priority].size();
}

size_t PriorityScheduler::get_total_task_count() const {
    size_t total = 0;
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        total += task_queues_[priority].size();
    }
    return total;
}

void PriorityScheduler::unblock_task(std::shared_ptr<Task> task) {
    if (task && task->state == TaskState::BLOCKED) {
        task->state = TaskState::READY;
        task_queues_[task->priority].push(task);
        update_priority_bitmap(task->priority, true);
        
        auto it = std::find(blocked_tasks_.begin(), blocked_tasks_.end(), task);
        if (it != blocked_tasks_.end()) {
            blocked_tasks_.erase(it);
        }
    }
}

void PriorityScheduler::print_priority_bitmap() const {
    std::cout << "Priority Bitmap: ";
    for (int i = 0; i < 16; ++i) {
        std::cout << std::hex << static_cast<int>(priority_bitmap_[i]) << " ";
    }
    std::cout << std::dec << std::endl;
}

void PriorityScheduler::print_task_queues() const {
    std::cout << "Task Queues:\n";
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        if (!task_queues_[priority].empty()) {
            std::cout << "  Priority " << static_cast<int>(priority) 
                      << ": " << task_queues_[priority].size() << " tasks\n";
        }
    }
}

void PriorityScheduler::print_sync_objects() const {
    std::cout << "Synchronization Objects:\n";
    std::cout << "  Semaphores: " << semaphores_.size() << "\n";
    std::cout << "  Events: " << events_.size() << "\n";
    std::cout << "  Signals: " << signals_.size() << "\n";
    std::cout << "  Message Queues: " << message_queues_.size() << "\n";
    std::cout << "  Blocked Tasks: " << blocked_tasks_.size() << "\n";
}

} // namespace RTOS
