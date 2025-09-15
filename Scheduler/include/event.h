#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <map>

namespace RTOS {

// Forward declarations
class PriorityScheduler;
struct Task;

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

// Event management functions for PriorityScheduler
class EventManager {
public:
    // Event management functions
    static uint32_t create_event(PriorityScheduler* scheduler);
    static bool delete_event(PriorityScheduler* scheduler, uint32_t event_id);
    static bool event_wait(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_mask, bool clear_on_exit = true, uint32_t timeout_ms = 0);
    static bool event_set(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_bits);
    static bool event_clear(PriorityScheduler* scheduler, uint32_t event_id, uint32_t event_bits);
    static uint32_t event_get_bits(PriorityScheduler* scheduler, uint32_t event_id);
};

} // namespace RTOS