#include "clock.h"
#include <iostream>
#include <thread>

namespace RTOS {

// RealtimeClock implementation
std::chrono::milliseconds RealtimeClock::get_current_time() const {
    auto now = std::chrono::steady_clock::now();
    auto duration = now.time_since_epoch();
    return std::chrono::duration_cast<std::chrono::milliseconds>(duration);
}

std::chrono::steady_clock::time_point RealtimeClock::get_current_time_point() const {
    return std::chrono::steady_clock::now();
}

void RealtimeClock::sleep_for(std::chrono::milliseconds duration) {
    std::this_thread::sleep_for(duration);
}

void RealtimeClock::sleep_until(std::chrono::steady_clock::time_point target_time) {
    std::this_thread::sleep_until(target_time);
}

// TickBasedClock implementation
TickBasedClock::TickBasedClock(std::chrono::milliseconds tick_interval)
    : tick_interval_(tick_interval) {
}

TickBasedClock::~TickBasedClock() {
    stop();
}

void TickBasedClock::start() {
    if (running_.load()) {
        return; // Already running
    }
    
    should_stop_ = false;
    running_ = true;
    start_time_ = std::chrono::steady_clock::now();
    tick_count_ = 0;
    
    tick_thread_ = std::thread(&TickBasedClock::tick_thread_function, this);
}

void TickBasedClock::stop() {
    if (!running_.load()) {
        return; // Already stopped
    }
    
    should_stop_ = true;
    running_ = false;
    
    if (tick_thread_.joinable()) {
        tick_thread_.join();
    }
}

std::chrono::milliseconds TickBasedClock::get_current_time() const {
    if (!running_.load()) {
        return std::chrono::milliseconds(0);
    }
    
    uint64_t current_tick = tick_count_.load();
    return std::chrono::milliseconds(current_tick * tick_interval_.count());
}

std::chrono::steady_clock::time_point TickBasedClock::get_current_time_point() const {
    if (!running_.load()) {
        return std::chrono::steady_clock::now();
    }
    
    uint64_t current_tick = tick_count_.load();
    auto elapsed_ms = std::chrono::milliseconds(current_tick * tick_interval_.count());
    return start_time_ + elapsed_ms;
}

void TickBasedClock::sleep_for(std::chrono::milliseconds duration) {
    if (!running_.load()) {
        std::this_thread::sleep_for(duration);
        return;
    }
    
    // Calculate target tick count
    uint64_t target_ticks = duration.count() / tick_interval_.count();
    if (target_ticks == 0) {
        target_ticks = 1; // At least 1 tick
    }
    
    uint64_t start_tick = tick_count_.load();
    uint64_t target_tick = start_tick + target_ticks;
    
    // Wait until target tick is reached
    while (tick_count_.load() < target_tick && !should_stop_.load()) {
        std::this_thread::sleep_for(tick_interval_);
    }
}

void TickBasedClock::sleep_until(std::chrono::steady_clock::time_point target_time) {
    if (!running_.load()) {
        std::this_thread::sleep_until(target_time);
        return;
    }
    
    auto current_time = get_current_time_point();
    if (target_time <= current_time) {
        return; // Already past target time
    }
    
    auto duration = target_time - current_time;
    sleep_for(std::chrono::duration_cast<std::chrono::milliseconds>(duration));
}

void TickBasedClock::tick_thread_function() {
    while (!should_stop_.load()) {
        std::this_thread::sleep_for(tick_interval_);
        if (!should_stop_.load()) {
            tick_count_++;
        }
    }
}

// ClockFactory implementation
std::unique_ptr<IClock> ClockFactory::create_realtime_clock() {
    return std::make_unique<RealtimeClock>();
}

std::unique_ptr<IClock> ClockFactory::create_tick_based_clock(
    std::chrono::milliseconds tick_interval) {
    return std::make_unique<TickBasedClock>(tick_interval);
}

} // namespace RTOS