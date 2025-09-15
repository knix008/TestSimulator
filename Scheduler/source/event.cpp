#include "event.h"
#include "scheduler.h"
#include <chrono>

namespace RTOS {

Event::Event() : event_bits_(0) {}

bool Event::wait(uint32_t event_mask, bool clear_on_exit, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        cv_.wait(lock, [this, event_mask] { return (event_bits_ & event_mask) != 0; });
    } else {
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this, event_mask] { return (event_bits_ & event_mask) != 0; })) {
            return false; 
        }
    }
    
    if (clear_on_exit) {
        event_bits_ &= ~event_mask;
    }
    return true;
}

bool Event::set(uint32_t event_bits) {
    std::lock_guard<std::mutex> lock(mutex_);
    event_bits_ |= event_bits;
    cv_.notify_all();
    return true;
}

bool Event::clear(uint32_t event_bits) {
    std::lock_guard<std::mutex> lock(mutex_);
    event_bits_ &= ~event_bits;
    return true;
}

uint32_t Event::get_bits() const {
    return event_bits_.load();
}

// EventManager implementation
uint32_t EventManager::create_event(PriorityScheduler* scheduler) {
    auto event = std::make_shared<Event>();
    uint32_t event_id = scheduler->next_sync_id_++;
    scheduler->events_[event_id] = event;
    return event_id;
}

bool EventManager::delete_event(PriorityScheduler* scheduler, uint32_t event_id) {
    auto it = scheduler->events_.find(event_id);
    if (it != scheduler->events_.end()) {
        scheduler->events_.erase(it);
        return true;
    }
    return false;
}

bool EventManager::event_wait(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_mask, bool clear_on_exit, uint32_t timeout_ms) {
    auto it = scheduler->events_.find(event_id);
    if (it == scheduler->events_.end()) {
        return false;
    }
    
    auto current_task = scheduler->get_current_task();
    if (!current_task) {
        return false;
    }
    
    // Event wait
    if (!it->second->wait(event_mask, clear_on_exit, timeout_ms)) {
        return false; // Timeout or failure
    }
    
    return true;
}

bool EventManager::event_set(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_bits) {
    auto it = scheduler->events_.find(event_id);
    if (it == scheduler->events_.end()) {
        return false;
    }
    
    return it->second->set(event_bits);
}

bool EventManager::event_clear(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_bits) {
    auto it = scheduler->events_.find(event_id);
    if (it == scheduler->events_.end()) {
        return false;
    }
    
    return it->second->clear(event_bits);
}

uint32_t EventManager::event_get_bits(PriorityScheduler* scheduler, uint32_t event_id) {
    auto it = scheduler->events_.find(event_id);
    if (it == scheduler->events_.end()) {
        return 0;
    }
    
    return it->second->get_bits();
}

} // namespace RTOS
