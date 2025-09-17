#include "config.h"
#if ENABLE_EVENT
// ...existing code...
#endif
#include "event.h"
#include <chrono>
#include <iostream>

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
EventManager::EventManager() : next_event_id_(1) {}

uint32_t EventManager::create_event() {
    auto event = std::make_shared<Event>();
    uint32_t event_id = next_event_id_++;
    events_[event_id] = event;
    return event_id;
}

bool EventManager::delete_event(uint32_t event_id) {
    auto it = events_.find(event_id);
    if (it != events_.end()) {
        events_.erase(it);
        return true;
    }
    return false;
}

bool EventManager::event_wait(uint32_t event_id, uint32_t event_mask, bool clear_on_exit, uint32_t timeout_ms) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    return it->second->wait(event_mask, clear_on_exit, timeout_ms);
}

bool EventManager::event_set(uint32_t event_id, uint32_t event_bits) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    return it->second->set(event_bits);
}

bool EventManager::event_clear(uint32_t event_id, uint32_t event_bits) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    return it->second->clear(event_bits);
}

uint32_t EventManager::event_get_bits(uint32_t event_id) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return 0;
    }
    
    return it->second->get_bits();
}

size_t EventManager::get_event_count() const {
    return events_.size();
}

void EventManager::print_events() const {
    std::cout << "Events (" << events_.size() << "):\n";
    for (const auto& pair : events_) {
        std::cout << "  ID: " << pair.first << ", Bits: 0x" << std::hex << pair.second->get_bits() << std::dec << "\n";
    }
}

} // namespace RTOS
