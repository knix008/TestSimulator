#include "timer.h"
#include <iostream>
#include <algorithm>
#include <chrono>
#include <sstream>

namespace RTOS {

// Timer class implementation
Timer::Timer(uint32_t timer_id, const std::string& name, TimerType type, 
             std::chrono::milliseconds interval, TimerCallback callback, void* user_data)
    : id_(timer_id), name_(name), type_(type), state_(TimerState::STOPPED),
      interval_(interval), remaining_time_(interval), callback_(callback), 
      user_data_(user_data), should_stop_(false), clock_(nullptr) {
}

Timer::~Timer() {
    stop();
}

Timer::Timer(Timer&& other) noexcept
    : id_(other.id_), name_(std::move(other.name_)), type_(other.type_),
      state_(other.state_), interval_(other.interval_), remaining_time_(other.remaining_time_),
      callback_(std::move(other.callback_)), user_data_(other.user_data_),
      start_time_(other.start_time_), next_expiry_(other.next_expiry_),
      should_stop_(other.should_stop_.load()) {
    other.id_ = 0;
    other.user_data_ = nullptr;
    other.should_stop_ = true;
}

Timer& Timer::operator=(Timer&& other) noexcept {
    if (this != &other) {
        stop();
        
        id_ = other.id_;
        name_ = std::move(other.name_);
        type_ = other.type_;
        state_ = other.state_;
        interval_ = other.interval_;
        remaining_time_ = other.remaining_time_;
        callback_ = std::move(other.callback_);
        user_data_ = other.user_data_;
        start_time_ = other.start_time_;
        next_expiry_ = other.next_expiry_;
        should_stop_ = other.should_stop_.load();
        
        other.id_ = 0;
        other.user_data_ = nullptr;
        other.should_stop_ = true;
    }
    return *this;
}

TimerState Timer::get_state() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return state_;
}

std::chrono::milliseconds Timer::get_remaining_time() const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ != TimerState::RUNNING) {
        return std::chrono::milliseconds(0);
    }
    
    auto now = clock_ ? clock_->get_current_time_point() : std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time_);
    
    if (elapsed >= interval_) {
        return std::chrono::milliseconds(0);
    }
    
    return interval_ - elapsed;
}

bool Timer::start() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ == TimerState::DELETED) {
        return false;
    }
    
    start_time_ = clock_ ? clock_->get_current_time_point() : std::chrono::steady_clock::now();
    next_expiry_ = start_time_ + interval_;
    state_ = TimerState::RUNNING;
    should_stop_ = false;
    
    return true;
}

bool Timer::stop() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ == TimerState::DELETED) {
        return false;
    }
    
    state_ = TimerState::STOPPED;
    should_stop_ = true;
    
    return true;
}

bool Timer::restart() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ == TimerState::DELETED) {
        return false;
    }
    
    start_time_ = clock_ ? clock_->get_current_time_point() : std::chrono::steady_clock::now();
    next_expiry_ = start_time_ + interval_;
    state_ = TimerState::RUNNING;
    should_stop_ = false;
    
    return true;
}

bool Timer::reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ == TimerState::DELETED) {
        return false;
    }
    
    remaining_time_ = interval_;
    state_ = TimerState::STOPPED;
    should_stop_ = true;
    
    return true;
}

void Timer::execute_callback() {
    if (callback_) {
        try {
            callback_(id_, user_data_);
        } catch (const std::exception& e) {
            std::cerr << "Timer " << id_ << " callback exception: " << e.what() << std::endl;
        }
    }
}

bool Timer::is_running() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return state_ == TimerState::RUNNING;
}

bool Timer::is_expired() const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (state_ != TimerState::RUNNING) {
        return false;
    }
    
    auto now = clock_ ? clock_->get_current_time_point() : std::chrono::steady_clock::now();
    return now >= next_expiry_;
}

bool Timer::is_stopped() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return state_ == TimerState::STOPPED;
}

std::string Timer::to_string() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::ostringstream oss;
    oss << "Timer[" << id_ << "] " << name_ 
        << " (" << type_to_string() << ", " << state_to_string() 
        << ", " << interval_.count() << "ms)";
    return oss.str();
}

std::string Timer::state_to_string() const {
    switch (state_) {
        case TimerState::STOPPED: return "STOPPED";
        case TimerState::RUNNING: return "RUNNING";
        case TimerState::EXPIRED: return "EXPIRED";
        case TimerState::DELETED: return "DELETED";
        default: return "UNKNOWN";
    }
}

std::string Timer::type_to_string() const {
    switch (type_) {
        case TimerType::ONE_SHOT: return "ONE_SHOT";
        case TimerType::PERIODIC: return "PERIODIC";
        default: return "UNKNOWN";
    }
}

// TimerManager class implementation
TimerManager::TimerManager() 
    : next_timer_id_(1), running_(false), should_stop_(false) {
    // Default to realtime clock
    clock_ = std::make_unique<RealtimeClock>();
}

TimerManager::~TimerManager() {
    stop_manager();
}

uint32_t TimerManager::create_timer(const std::string& name, TimerType type, 
                                   std::chrono::milliseconds interval, 
                                   TimerCallback callback, void* user_data) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    uint32_t timer_id = next_timer_id_++;
    auto timer = std::make_shared<Timer>(timer_id, name, type, interval, callback, user_data);
    
    // Set clock reference
    if (clock_) {
        timer->set_clock(clock_.get());
    }
    
    timers_[timer_id] = timer;
    
    return timer_id;
}

bool TimerManager::delete_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        it->second->stop();
        timers_.erase(it);
        cv_.notify_all();
        return true;
    }
    
    return false;
}

bool TimerManager::start_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        bool result = it->second->start();
        if (result) {
            cv_.notify_all();
        }
        return result;
    }
    
    return false;
}

bool TimerManager::stop_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->stop();
    }
    
    return false;
}

bool TimerManager::restart_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        bool result = it->second->restart();
        if (result) {
            cv_.notify_all();
        }
        return result;
    }
    
    return false;
}

bool TimerManager::reset_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->reset();
    }
    
    return false;
}

std::shared_ptr<Timer> TimerManager::get_timer(uint32_t timer_id) const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second;
    }
    
    return nullptr;
}

std::vector<std::shared_ptr<Timer>> TimerManager::get_all_timers() const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    std::vector<std::shared_ptr<Timer>> result;
    for (const auto& pair : timers_) {
        result.push_back(pair.second);
    }
    
    return result;
}

std::vector<std::shared_ptr<Timer>> TimerManager::get_running_timers() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    std::vector<std::shared_ptr<Timer>> result;
    
    for (const auto& timer : all_timers) {
        if (timer->is_running()) {
            result.push_back(timer);
        }
    }
    
    return result;
}

size_t TimerManager::get_timer_count() const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    return timers_.size();
}

size_t TimerManager::get_running_timer_count() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    size_t count = 0;
    
    for (const auto& timer : all_timers) {
        if (timer->is_running()) {
            count++;
        }
    }
    
    return count;
}

bool TimerManager::start_manager() {
    if (running_.load()) {
        return false;
    }
    
    should_stop_ = false;
    running_ = true;
    
    // Start clock
    if (clock_) {
        clock_->start();
    }
    
    timer_thread_ = std::thread(&TimerManager::timer_thread_function, this);
    
    return true;
}

bool TimerManager::stop_manager() {
    if (!running_.load()) {
        return false;
    }
    
    should_stop_ = true;
    cv_.notify_all();
    
    if (timer_thread_.joinable()) {
        timer_thread_.join();
    }
    
    // Stop clock
    if (clock_) {
        clock_->stop();
    }
    
    running_ = false;
    
    return true;
}

void TimerManager::timer_thread_function() {
    while (!should_stop_.load()) {
        try {
            // Execute expired timers
            execute_expired_timers();
            
            // Wait for next timer expiry
            auto wait_time = wait_for_next_timer();
            
            if (wait_time > std::chrono::milliseconds(0)) {
                std::unique_lock<std::mutex> lock(timers_mutex_);
                cv_.wait_for(lock, wait_time, [this] { return should_stop_.load(); });
            }
        } catch (const std::exception& e) {
            std::cerr << "Timer thread exception: " << e.what() << std::endl;
        }
    }
}

std::shared_ptr<Timer> TimerManager::find_next_expiring_timer() {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    std::shared_ptr<Timer> next_timer = nullptr;
    auto next_expiry = std::chrono::steady_clock::time_point::max();
    
    for (const auto& timer : all_timers) {
        if (timer->is_running() && timer->is_expired()) {
            // Return first expired timer
            return timer;
        }
        
        if (timer->is_running()) {
            auto remaining = timer->get_remaining_time();
            auto expiry_time = std::chrono::steady_clock::now() + remaining;
            
            if (expiry_time < next_expiry) {
                next_expiry = expiry_time;
                next_timer = timer;
            }
        }
    }
    
    return next_timer;
}

std::chrono::milliseconds TimerManager::wait_for_next_timer() {
    auto next_timer = find_next_expiring_timer();
    
    if (!next_timer) {
        return std::chrono::milliseconds(100); // Default wait time
    }
    
    auto remaining = next_timer->get_remaining_time();
    return std::max(remaining, std::chrono::milliseconds(1));
}

void TimerManager::execute_expired_timers() {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    std::vector<std::shared_ptr<Timer>> expired_timers;
    
    for (const auto& timer : all_timers) {
        if (timer->is_running() && timer->is_expired()) {
            expired_timers.push_back(timer);
        }
    }
    
    // Execute callbacks
    for (auto timer : expired_timers) {
        timer->execute_callback();
        
        // Handle timer type
        if (timer->get_type() == TimerType::ONE_SHOT) {
            timer->stop();
        } else if (timer->get_type() == TimerType::PERIODIC) {
            timer->restart();
        }
    }
}

void TimerManager::print_timer_status() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    
    std::cout << "Timer Manager Status:" << std::endl;
    std::cout << "Total timers: " << all_timers.size() << std::endl;
    std::cout << "Running timers: " << get_running_timer_count() << std::endl;
    std::cout << "Manager running: " << (running_.load() ? "Yes" : "No") << std::endl;
    std::cout << std::endl;
    
    for (const auto& timer : all_timers) {
        std::cout << "  " << timer->to_string() << std::endl;
    }
}

void TimerManager::print_running_timers() const {
    auto running_timers = get_running_timers();
    
    std::cout << "Running Timers (" << running_timers.size() << "):" << std::endl;
    for (const auto& timer : running_timers) {
        auto remaining = timer->get_remaining_time();
        std::cout << "  " << timer->to_string() 
                  << " - Remaining: " << remaining.count() << "ms" << std::endl;
    }
}

std::chrono::milliseconds TimerManager::get_system_time() const {
    if (clock_) {
        return clock_->get_current_time();
    }
    auto now = std::chrono::steady_clock::now();
    auto duration = now.time_since_epoch();
    return std::chrono::duration_cast<std::chrono::milliseconds>(duration);
}

void TimerManager::sleep_until(std::chrono::steady_clock::time_point target_time) {
    if (clock_) {
        clock_->sleep_until(target_time);
    } else {
        std::this_thread::sleep_until(target_time);
    }
}

void TimerManager::set_clock(std::unique_ptr<IClock> clock) {
    if (running_.load()) {
        // Stop current clock
        if (clock_) {
            clock_->stop();
        }
    }
    
    clock_ = std::move(clock);
    
    if (running_.load() && clock_) {
        clock_->start();
    }
}

bool TimerManager::is_tick_based() const {
    return clock_ ? clock_->is_tick_based() : false;
}

uint64_t TimerManager::get_tick_count() const {
    return clock_ ? clock_->get_tick_count() : 0;
}

std::chrono::milliseconds TimerManager::get_tick_interval() const {
    return clock_ ? clock_->get_tick_interval() : std::chrono::milliseconds(0);
}

} // namespace RTOS
