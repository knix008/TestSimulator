#include "timer_task.h"
#include <iostream>
#include <algorithm>
#include <sstream>

namespace RTOS {

// TimerTask implementation
TimerTask::TimerTask(uint32_t task_id, uint8_t priority, void* data)
    : Task(task_id, priority, data), next_timer_id_(1), should_stop_(false), is_running_(false) {
    // Default to realtime timing provider
    timing_provider_ = std::make_unique<RealtimeTimingProvider>();
}

TimerTask::~TimerTask() {
    stop_task();
}

void TimerTask::execute() {
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
            std::cerr << "Timer task exception: " << e.what() << std::endl;
        }
    }
}

uint32_t TimerTask::create_timer(const std::string& name, TimerType type, 
                                std::chrono::milliseconds interval, 
                                TimerCallback callback, void* user_data) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    uint32_t timer_id = next_timer_id_++;
    auto timer = std::make_shared<Timer>(timer_id, name, type, interval, callback, user_data);
    
    // Set timing provider reference
    if (timing_provider_) {
        timer->set_timing_provider(timing_provider_.get());
    }
    
    timers_[timer_id] = timer;
    
    return timer_id;
}

bool TimerTask::delete_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        it->second->stop();
        timers_.erase(it);
        return true;
    }
    
    return false;
}

bool TimerTask::start_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->start();
    }
    
    return false;
}

bool TimerTask::stop_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->stop();
    }
    
    return false;
}

bool TimerTask::restart_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->restart();
    }
    
    return false;
}

bool TimerTask::reset_timer(uint32_t timer_id) {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second->reset();
    }
    
    return false;
}

std::shared_ptr<Timer> TimerTask::get_timer(uint32_t timer_id) const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    auto it = timers_.find(timer_id);
    if (it != timers_.end()) {
        return it->second;
    }
    
    return nullptr;
}

std::vector<std::shared_ptr<Timer>> TimerTask::get_all_timers() const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    
    std::vector<std::shared_ptr<Timer>> result;
    for (const auto& pair : timers_) {
        result.push_back(pair.second);
    }
    
    return result;
}

std::vector<std::shared_ptr<Timer>> TimerTask::get_running_timers() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    std::vector<std::shared_ptr<Timer>> running_timers;
    
    for (const auto& timer : all_timers) {
        if (timer->is_running()) {
            running_timers.push_back(timer);
        }
    }
    
    return running_timers;
}

size_t TimerTask::get_timer_count() const {
    std::lock_guard<std::mutex> lock(timers_mutex_);
    return timers_.size();
}

size_t TimerTask::get_running_timer_count() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    size_t count = 0;
    
    for (const auto& timer : all_timers) {
        if (timer->is_running()) {
            count++;
        }
    }
    
    return count;
}

bool TimerTask::start_task() {
    if (is_running_.load()) {
        return false;
    }
    
    should_stop_ = false;
    is_running_ = true;
    
    // Start timing provider
    if (timing_provider_) {
        timing_provider_->start();
    }
    
    return true;
}

bool TimerTask::stop_task() {
    if (!is_running_.load()) {
        return false;
    }
    
    should_stop_ = true;
    cv_.notify_all();
    
    // Stop timing provider
    if (timing_provider_) {
        timing_provider_->stop();
    }
    
    is_running_ = false;
    
    return true;
}

void TimerTask::set_timing_provider(std::unique_ptr<ITimingProvider> provider) {
    if (is_running_.load()) {
        // Stop current timing provider
        if (timing_provider_) {
            timing_provider_->stop();
        }
    }
    
    timing_provider_ = std::move(provider);
    
    if (is_running_.load() && timing_provider_) {
        timing_provider_->start();
    }
}

bool TimerTask::is_tick_based() const {
    return timing_provider_ ? timing_provider_->is_tick_based() : false;
}

uint64_t TimerTask::get_tick_count() const {
    return timing_provider_ ? timing_provider_->get_tick_count() : 0;
}

std::chrono::milliseconds TimerTask::get_tick_interval() const {
    return timing_provider_ ? timing_provider_->get_tick_interval() : std::chrono::milliseconds(0);
}

void TimerTask::print_timer_status() const {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    
    std::cout << "Timer Task Status:" << std::endl;
    std::cout << "Total timers: " << all_timers.size() << std::endl;
    std::cout << "Running timers: " << get_running_timer_count() << std::endl;
    std::cout << "Task running: " << (is_running_.load() ? "Yes" : "No") << std::endl;
    
    for (const auto& timer : all_timers) {
        std::cout << "  " << timer->to_string() << std::endl;
    }
}

void TimerTask::print_running_timers() const {
    std::vector<std::shared_ptr<Timer>> running_timers = get_running_timers();
    
    std::cout << "Running Timers: " << running_timers.size() << std::endl;
    for (const auto& timer : running_timers) {
        auto remaining = timer->get_remaining_time();
        std::cout << "  " << timer->to_string() 
                  << " - Remaining: " << remaining.count() << "ms" << std::endl;
    }
}

std::chrono::milliseconds TimerTask::get_system_time() const {
    if (timing_provider_) {
        return timing_provider_->get_current_time();
    }
    auto now = std::chrono::steady_clock::now();
    auto duration = now.time_since_epoch();
    return std::chrono::duration_cast<std::chrono::milliseconds>(duration);
}

void TimerTask::sleep_until(std::chrono::steady_clock::time_point target_time) {
    if (timing_provider_) {
        timing_provider_->sleep_until(target_time);
    } else {
        std::this_thread::sleep_until(target_time);
    }
}

std::shared_ptr<Timer> TimerTask::find_next_expiring_timer() {
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
            auto expiry_time = (timing_provider_ ? timing_provider_->get_current_time_point() : std::chrono::steady_clock::now()) + remaining;
            
            if (expiry_time < next_expiry) {
                next_expiry = expiry_time;
                next_timer = timer;
            }
        }
    }
    
    return next_timer;
}

std::chrono::milliseconds TimerTask::wait_for_next_timer() {
    auto next_timer = find_next_expiring_timer();
    
    if (!next_timer) {
        return std::chrono::milliseconds(100); // Default wait time
    }
    
    auto remaining = next_timer->get_remaining_time();
    return std::max(remaining, std::chrono::milliseconds(1));
}

void TimerTask::execute_expired_timers() {
    std::vector<std::shared_ptr<Timer>> all_timers = get_all_timers();
    
    for (const auto& timer : all_timers) {
        if (timer->is_running() && timer->is_expired()) {
            timer->execute_callback();
            
            if (timer->get_type() == TimerType::ONE_SHOT) {
                timer->stop();
            } else if (timer->get_type() == TimerType::PERIODIC) {
                timer->restart();
            }
        }
    }
}

// TaskBasedTimerManager implementation
TaskBasedTimerManager::TaskBasedTimerManager(std::shared_ptr<PriorityScheduler> scheduler, 
                                            uint8_t timer_priority)
    : scheduler_(scheduler), owns_scheduler_(false) {
    // Create timer task
    uint32_t task_id = scheduler_->create_task(timer_priority);
    timer_task_ = std::make_shared<TimerTask>(task_id, timer_priority);
}

TaskBasedTimerManager::TaskBasedTimerManager(uint8_t timer_priority)
    : owns_scheduler_(true) {
    // Create new scheduler
    scheduler_ = std::make_shared<PriorityScheduler>();
    
    // Create timer task
    uint32_t task_id = scheduler_->create_task(timer_priority);
    timer_task_ = std::make_shared<TimerTask>(task_id, timer_priority);
}

TaskBasedTimerManager::~TaskBasedTimerManager() {
    stop_manager();
}

uint32_t TaskBasedTimerManager::create_timer(const std::string& name, TimerType type, 
                                            std::chrono::milliseconds interval, 
                                            TimerCallback callback, void* user_data) {
    return timer_task_->create_timer(name, type, interval, callback, user_data);
}

bool TaskBasedTimerManager::delete_timer(uint32_t timer_id) {
    return timer_task_->delete_timer(timer_id);
}

bool TaskBasedTimerManager::start_timer(uint32_t timer_id) {
    return timer_task_->start_timer(timer_id);
}

bool TaskBasedTimerManager::stop_timer(uint32_t timer_id) {
    return timer_task_->stop_timer(timer_id);
}

bool TaskBasedTimerManager::restart_timer(uint32_t timer_id) {
    return timer_task_->restart_timer(timer_id);
}

bool TaskBasedTimerManager::reset_timer(uint32_t timer_id) {
    return timer_task_->reset_timer(timer_id);
}

std::shared_ptr<Timer> TaskBasedTimerManager::get_timer(uint32_t timer_id) const {
    return timer_task_->get_timer(timer_id);
}

std::vector<std::shared_ptr<Timer>> TaskBasedTimerManager::get_all_timers() const {
    return timer_task_->get_all_timers();
}

std::vector<std::shared_ptr<Timer>> TaskBasedTimerManager::get_running_timers() const {
    return timer_task_->get_running_timers();
}

size_t TaskBasedTimerManager::get_timer_count() const {
    return timer_task_->get_timer_count();
}

size_t TaskBasedTimerManager::get_running_timer_count() const {
    return timer_task_->get_running_timer_count();
}

bool TaskBasedTimerManager::start_manager() {
    if (!timer_task_->start_task()) {
        return false;
    }
    
    // Add timer task to scheduler
    scheduler_->add_task(timer_task_->get_id(), timer_task_->get_priority(), timer_task_.get());
    
    return true;
}

bool TaskBasedTimerManager::stop_manager() {
    if (!timer_task_->stop_task()) {
        return false;
    }
    
    // Remove timer task from scheduler
    scheduler_->remove_task(timer_task_->get_id());
    
    return true;
}

bool TaskBasedTimerManager::is_running() const {
    return timer_task_->is_task_running();
}

void TaskBasedTimerManager::set_timing_provider(std::unique_ptr<ITimingProvider> provider) {
    timer_task_->set_timing_provider(std::move(provider));
}

ITimingProvider* TaskBasedTimerManager::get_timing_provider() const {
    return timer_task_->get_timing_provider();
}

bool TaskBasedTimerManager::is_tick_based() const {
    return timer_task_->is_tick_based();
}

uint64_t TaskBasedTimerManager::get_tick_count() const {
    return timer_task_->get_tick_count();
}

std::chrono::milliseconds TaskBasedTimerManager::get_tick_interval() const {
    return timer_task_->get_tick_interval();
}

void TaskBasedTimerManager::print_timer_status() const {
    timer_task_->print_timer_status();
}

void TaskBasedTimerManager::print_running_timers() const {
    timer_task_->print_running_timers();
}

std::chrono::milliseconds TaskBasedTimerManager::get_system_time() const {
    return timer_task_->get_system_time();
}

void TaskBasedTimerManager::sleep_until(std::chrono::steady_clock::time_point target_time) {
    timer_task_->sleep_until(target_time);
}

} // namespace RTOS
