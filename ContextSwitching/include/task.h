#pragma once

#include <cstdint>
#include <memory>
#include <string>

namespace RTOS {

// Forward declarations
class Semaphore;
class Event;
class Signal;
class MessageQueue;

// Task state definition
enum class TaskState {
    READY,
    RUNNING,
    BLOCKED,
    SUSPENDED
};

// Task class for RTOS scheduler
class Task {
private:
    uint32_t id_;
    uint8_t priority_;
    TaskState state_;
    void* data_;
    
    // Synchronization related fields
    std::shared_ptr<Semaphore> waiting_semaphore_;
    std::shared_ptr<Event> waiting_event_;
    std::shared_ptr<Signal> waiting_signal_;
    std::shared_ptr<MessageQueue> waiting_message_queue_;
    uint32_t event_mask_;
    bool clear_on_exit_;

public:
    #if defined(__aarch64__) || defined(_M_ARM64)
        struct arm64_context* context_ = nullptr;
    #endif
    // Constructor
    Task(uint32_t task_id, uint8_t task_priority, void* task_data = nullptr);
    
    // Destructor
    ~Task() = default;
    
    // Copy constructor (disabled)
    Task(const Task&) = delete;
    
    // Assignment operator (disabled)
    Task& operator=(const Task&) = delete;
    
    // Move constructor
    Task(Task&& other) noexcept;
    
    // Move assignment operator
    #if defined(__aarch64__) || defined(_M_ARM64)
        uint8_t* stack_ = nullptr;
        struct arm64_context* context_ = nullptr;
    #endif
    Task& operator=(Task&& other) noexcept;
    
    // Getters
    uint32_t get_id() const { return id_; }
    uint8_t get_priority() const { return priority_; }
    TaskState get_state() const { return state_; }
    void* get_data() const { return data_; }
    
    // Synchronization getters
    std::shared_ptr<Semaphore> get_waiting_semaphore() const { return waiting_semaphore_; }
    std::shared_ptr<Event> get_waiting_event() const { return waiting_event_; }
    std::shared_ptr<Signal> get_waiting_signal() const { return waiting_signal_; }
    std::shared_ptr<MessageQueue> get_waiting_message_queue() const { return waiting_message_queue_; }
    uint32_t get_event_mask() const { return event_mask_; }
    bool get_clear_on_exit() const { return clear_on_exit_; }
    
    // Setters
    void set_state(TaskState new_state) { state_ = new_state; }
    void set_data(void* new_data) { data_ = new_data; }
    
    // Synchronization setters
    void set_waiting_semaphore(std::shared_ptr<Semaphore> semaphore) { waiting_semaphore_ = semaphore; }
    void set_waiting_event(std::shared_ptr<Event> event) { waiting_event_ = event; }
    void set_waiting_signal(std::shared_ptr<Signal> signal) { waiting_signal_ = signal; }
    void set_waiting_message_queue(std::shared_ptr<MessageQueue> mq) { waiting_message_queue_ = mq; }
    void set_event_mask(uint32_t mask) { event_mask_ = mask; }
    void set_clear_on_exit(bool clear) { clear_on_exit_ = clear; }
    
    // Utility methods
    bool is_ready() const { return state_ == TaskState::READY; }
    bool is_running() const { return state_ == TaskState::RUNNING; }
    bool is_blocked() const { return state_ == TaskState::BLOCKED; }
    bool is_suspended() const { return state_ == TaskState::SUSPENDED; }
    
    // State transition methods
    void transition_to_ready();
    void transition_to_running();
    void transition_to_blocked();
    void transition_to_suspended();
    
    // Clear all synchronization wait states
    void clear_wait_states();
    #if defined(__aarch64__) || defined(_M_ARM64)
        struct arm64_context* get_context() const { return context_; }
        void set_context(struct arm64_context* ctx) { context_ = ctx; }
    #endif
    
    // Task execution
    virtual void execute();
    
    // String representation
    std::string to_string() const;
    std::string state_to_string() const;
    
    // Comparison operators for priority-based sorting
    bool operator<(const Task& other) const;
    bool operator>(const Task& other) const;
    bool operator==(const Task& other) const;
    bool operator!=(const Task& other) const;
};

} // namespace RTOS
    #if defined(__aarch64__) || defined(_M_ARM64)
        ~Task();
        struct arm64_context* get_context() const { return context_; }
        void set_context(struct arm64_context* ctx) { context_ = ctx; }
        uint8_t* get_stack() const { return stack_; }
    #endif
