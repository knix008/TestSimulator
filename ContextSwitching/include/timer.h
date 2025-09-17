#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <vector>
#include <map>
#include <chrono>
#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include "clock.h"

namespace RTOS {

// Timer types
enum class TimerType {
    ONE_SHOT,    // Execute once and stop
    PERIODIC     // Execute repeatedly
};

// Timer state
enum class TimerState {
    STOPPED,
    RUNNING,
    EXPIRED,
    DELETED
};

// Timer callback function type
using TimerCallback = std::function<void(uint32_t timer_id, void* user_data)>;

// Timer class for RTOS
class Timer {
private:
    uint32_t id_;
    std::string name_;
    TimerType type_;
    TimerState state_;
    std::chrono::milliseconds interval_;
    std::chrono::milliseconds remaining_time_;
    TimerCallback callback_;
    void* user_data_;
    std::chrono::steady_clock::time_point start_time_;
    std::chrono::steady_clock::time_point next_expiry_;
    
    // Thread safety
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::atomic<bool> should_stop_;
    
    // Clock reference
    IClock* clock_;

public:
    // Constructor
    Timer(uint32_t timer_id, const std::string& name, TimerType type, 
          std::chrono::milliseconds interval, TimerCallback callback, void* user_data = nullptr);
    
    // Set clock
    void set_clock(IClock* clock) { clock_ = clock; }
    
    // Destructor
    ~Timer();
    
    // Copy constructor (disabled)
    Timer(const Timer&) = delete;
    
    // Assignment operator (disabled)
    Timer& operator=(const Timer&) = delete;
    
    // Move constructor
    Timer(Timer&& other) noexcept;
    
    // Move assignment operator
    Timer& operator=(Timer&& other) noexcept;
    
    // Getters
    uint32_t get_id() const { return id_; }
    const std::string& get_name() const { return name_; }
    TimerType get_type() const { return type_; }
    TimerState get_state() const;
    std::chrono::milliseconds get_interval() const { return interval_; }
    std::chrono::milliseconds get_remaining_time() const;
    void* get_user_data() const { return user_data_; }
    
    // Setters
    void set_callback(TimerCallback callback) { callback_ = callback; }
    void set_user_data(void* data) { user_data_ = data; }
    
    // Timer control
    bool start();
    bool stop();
    bool restart();
    bool reset();
    
    // Timer execution
    void execute_callback();
    
    // Utility methods
    bool is_running() const;
    bool is_expired() const;
    bool is_stopped() const;
    
    // String representation
    std::string to_string() const;
    std::string state_to_string() const;
    std::string type_to_string() const;
};

// Timer Manager class
class TimerManager {
private:
    // Timer storage
    std::map<uint32_t, std::shared_ptr<Timer>> timers_;
    
    // Timer ID counter
    uint32_t next_timer_id_;
    
    // Clock
    std::unique_ptr<IClock> clock_;
    
    // Timer thread
    std::thread timer_thread_;
    std::atomic<bool> running_;
    std::atomic<bool> should_stop_;
    
    // Thread synchronization
    mutable std::mutex timers_mutex_;
    std::condition_variable cv_;
    
    // Timer execution thread function
    void timer_thread_function();
    
    // Find next timer to expire
    std::shared_ptr<Timer> find_next_expiring_timer();
    
    // Wait for next timer expiry
    std::chrono::milliseconds wait_for_next_timer();
    
    // Execute expired timers
    void execute_expired_timers();

public:
    TimerManager();
    ~TimerManager();
    
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
    
    // Manager control
    bool start_manager();
    bool stop_manager();
    bool is_running() const { return running_.load(); }
    
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

} // namespace RTOS
