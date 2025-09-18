#pragma once

#include <cstdint>
#include <memory>
#include <vector>
#include <map>
#include <chrono>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include "task.h"
#include "timer.h"
#include "clock.h"
#include "scheduler.h"

namespace RTOS {

// Timer task that runs as a scheduler task instead of a separate thread
class TimerTask : public Task {
private:
    // Timer management
    std::map<uint32_t, std::shared_ptr<Timer>> timers_;
    uint32_t next_timer_id_;
    
    // Clock
    std::unique_ptr<IClock> clock_;
    
    // Task state
    std::atomic<bool> should_stop_;
    std::atomic<bool> is_running_;
    
    // Thread safety
    mutable std::mutex timers_mutex_;
    std::condition_variable cv_;
    
    // Timer execution
    void execute_expired_timers();
    std::shared_ptr<Timer> find_next_expiring_timer();
    std::chrono::milliseconds wait_for_next_timer();
    
    // Task execution override
    void execute() override;

public:
    TimerTask(uint32_t task_id, uint8_t priority, void* data = nullptr);
    ~TimerTask();
    
    // Timer management
    uint32_t create_timer(const std::string& name, TimerType type, 
                         std::chrono::milliseconds interval, 
                         TimerCallback callback, void* user_data = nullptr);
    
    bool delete_timer(uint32_t timer_id);
    bool start_timer(uint32_t timer_id);
    bool stop_timer(uint32_t timer_id);
    bool restart_timer(uint32_t timer_id);
    bool reset_timer(uint32_t timer_id);
    
    // Timer query
    std::shared_ptr<Timer> get_timer(uint32_t timer_id) const;
    std::vector<std::shared_ptr<Timer>> get_all_timers() const;
    std::vector<std::shared_ptr<Timer>> get_running_timers() const;
    size_t get_timer_count() const;
    size_t get_running_timer_count() const;
    
    // Task control
    bool start_task();
    bool stop_task();
    bool is_task_running() const { return is_running_.load(); }
    
    // Clock management
    void set_clock(std::unique_ptr<IClock> clock);
    IClock* get_clock() const { return clock_.get(); }
    bool is_tick_based() const;
    uint64_t get_tick_count() const;
    std::chrono::milliseconds get_tick_interval() const;
    
    // Debugging functions
    void print_timer_status() const;
    void print_running_timers() const;
    
    // Utility functions
    std::chrono::milliseconds get_system_time() const;
    void sleep_until(std::chrono::steady_clock::time_point target_time);
};

// Task-based Timer Manager that integrates with scheduler
class TaskBasedTimerManager {
private:
    std::shared_ptr<TimerTask> timer_task_;
    std::shared_ptr<PriorityScheduler> scheduler_;
    bool owns_scheduler_;
    
public:
    // Constructor with existing scheduler
    explicit TaskBasedTimerManager(std::shared_ptr<PriorityScheduler> scheduler, 
                                  uint8_t timer_priority = 0);
    
    // Constructor with new scheduler
    explicit TaskBasedTimerManager(uint8_t timer_priority = 0);
    
    ~TaskBasedTimerManager();
    
    // Timer management (delegates to TimerTask)
    uint32_t create_timer(const std::string& name, TimerType type, 
                         std::chrono::milliseconds interval, 
                         TimerCallback callback, void* user_data = nullptr);
    
    bool delete_timer(uint32_t timer_id);
    bool start_timer(uint32_t timer_id);
    bool stop_timer(uint32_t timer_id);
    bool restart_timer(uint32_t timer_id);
    bool reset_timer(uint32_t timer_id);
    
    // Timer query
    std::shared_ptr<Timer> get_timer(uint32_t timer_id) const;
    std::vector<std::shared_ptr<Timer>> get_all_timers() const;
    std::vector<std::shared_ptr<Timer>> get_running_timers() const;
    size_t get_timer_count() const;
    size_t get_running_timer_count() const;
    
    // Manager control
    bool start_manager();
    bool stop_manager();
    bool is_running() const;
    
    // Clock management
    void set_clock(std::unique_ptr<IClock> clock);
    IClock* get_clock() const;
    bool is_tick_based() const;
    uint64_t get_tick_count() const;
    std::chrono::milliseconds get_tick_interval() const;
    
    // Scheduler access
    std::shared_ptr<PriorityScheduler> get_scheduler() const { return scheduler_; }
    std::shared_ptr<TimerTask> get_timer_task() const { return timer_task_; }
    
    // Debugging functions
    void print_timer_status() const;
    void print_running_timers() const;
    
    // Utility functions
    std::chrono::milliseconds get_system_time() const;
    void sleep_until(std::chrono::steady_clock::time_point target_time);
};

} // namespace RTOS
