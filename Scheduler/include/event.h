#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <map>

namespace RTOS {

// Event class
class Event {
private:
    std::atomic<uint32_t> event_bits_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    Event();
    ~Event() = default;
    
    bool wait(uint32_t event_mask, bool clear_on_exit = true, uint32_t timeout_ms = 0);
    bool set(uint32_t event_bits);
    bool clear(uint32_t event_bits);
    uint32_t get_bits() const;
};

// Independent Event Manager
class EventManager {
private:
    std::map<uint32_t, std::shared_ptr<Event>> events_;
    uint32_t next_event_id_;
    
public:
    EventManager();
    ~EventManager() = default;
    
    // Event management functions
    uint32_t create_event();
    bool delete_event(uint32_t event_id);
    bool event_wait(uint32_t event_id, uint32_t event_mask, bool clear_on_exit = true, uint32_t timeout_ms = 0);
    bool event_set(uint32_t event_id, uint32_t event_bits);
    bool event_clear(uint32_t event_id, uint32_t event_bits);
    uint32_t event_get_bits(uint32_t event_id);
    
    // Status and debugging
    size_t get_event_count() const;
    void print_events() const;
};

} // namespace RTOS