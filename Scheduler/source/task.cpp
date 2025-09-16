#include "task.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include <sstream>
#include <algorithm>
#include <iostream>

namespace RTOS {

// Constructor
Task::Task(uint32_t task_id, uint8_t task_priority, void* task_data)
    : id_(task_id), priority_(task_priority), state_(TaskState::READY), data_(task_data),
      waiting_semaphore_(nullptr), waiting_event_(nullptr), waiting_signal_(nullptr),
      waiting_message_queue_(nullptr), event_mask_(0), clear_on_exit_(true) {
}

// Move constructor
Task::Task(Task&& other) noexcept
    : id_(other.id_), priority_(other.priority_), state_(other.state_), data_(other.data_),
      waiting_semaphore_(std::move(other.waiting_semaphore_)),
      waiting_event_(std::move(other.waiting_event_)),
      waiting_signal_(std::move(other.waiting_signal_)),
      waiting_message_queue_(std::move(other.waiting_message_queue_)),
      event_mask_(other.event_mask_), clear_on_exit_(other.clear_on_exit_) {
    
    // Reset the moved-from object
    other.id_ = 0;
    other.priority_ = 0;
    other.state_ = TaskState::READY;
    other.data_ = nullptr;
    other.event_mask_ = 0;
    other.clear_on_exit_ = true;
}

// Move assignment operator
Task& Task::operator=(Task&& other) noexcept {
    if (this != &other) {
        id_ = other.id_;
        priority_ = other.priority_;
        state_ = other.state_;
        data_ = other.data_;
        waiting_semaphore_ = std::move(other.waiting_semaphore_);
        waiting_event_ = std::move(other.waiting_event_);
        waiting_signal_ = std::move(other.waiting_signal_);
        waiting_message_queue_ = std::move(other.waiting_message_queue_);
        event_mask_ = other.event_mask_;
        clear_on_exit_ = other.clear_on_exit_;
        
        // Reset the moved-from object
        other.id_ = 0;
        other.priority_ = 0;
        other.state_ = TaskState::READY;
        other.data_ = nullptr;
        other.event_mask_ = 0;
        other.clear_on_exit_ = true;
    }
    return *this;
}

// State transition methods
void Task::transition_to_ready() {
    state_ = TaskState::READY;
    clear_wait_states();
}

void Task::transition_to_running() {
    state_ = TaskState::RUNNING;
}

void Task::transition_to_blocked() {
    state_ = TaskState::BLOCKED;
}

void Task::transition_to_suspended() {
    state_ = TaskState::SUSPENDED;
    clear_wait_states();
}

// Clear all synchronization wait states
void Task::clear_wait_states() {
    waiting_semaphore_.reset();
    waiting_event_.reset();
    waiting_signal_.reset();
    waiting_message_queue_.reset();
    event_mask_ = 0;
    clear_on_exit_ = true;
}

// String representation
std::string Task::to_string() const {
    std::ostringstream oss;
    oss << "Task{id=" << id_ 
        << ", priority=" << static_cast<int>(priority_)
        << ", state=" << state_to_string()
        << ", data=" << (data_ ? "present" : "null") << "}";
    return oss.str();
}

std::string Task::state_to_string() const {
    switch (state_) {
        case TaskState::READY:
            return "READY";
        case TaskState::RUNNING:
            return "RUNNING";
        case TaskState::BLOCKED:
            return "BLOCKED";
        case TaskState::SUSPENDED:
            return "SUSPENDED";
        default:
            return "UNKNOWN";
    }
}

// Comparison operators for priority-based sorting
bool Task::operator<(const Task& other) const {
    // Lower priority number means higher priority (0 is highest)
    return priority_ > other.priority_;
}

bool Task::operator>(const Task& other) const {
    // Higher priority number means lower priority
    return priority_ < other.priority_;
}

bool Task::operator==(const Task& other) const {
    return id_ == other.id_;
}

bool Task::operator!=(const Task& other) const {
    return id_ != other.id_;
}

void Task::execute() {
    // Default implementation - derived classes should override this
    // This is a placeholder for task execution logic
    std::cout << "Executing task " << id_ << " with priority " << (int)priority_ << std::endl;
}

} // namespace RTOS
