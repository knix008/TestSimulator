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

// Semaphore class
class Semaphore {
private:
    std::atomic<int> count_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    explicit Semaphore(int initial_count = 0);
    ~Semaphore() = default;
    
    bool wait(uint32_t timeout_ms = 0);  // 0 = infinite wait
    bool post();
    int get_count() const;
};

// Semaphore management functions for PriorityScheduler
class SemaphoreManager {
public:
    // Semaphore management functions
    static uint32_t create_semaphore(PriorityScheduler* scheduler, int initial_count = 0);
    static bool delete_semaphore(PriorityScheduler* scheduler, uint32_t sem_id);
    static bool semaphore_wait(PriorityScheduler* scheduler, uint32_t sem_id, uint32_t timeout_ms = 0);
    static bool semaphore_post(PriorityScheduler* scheduler, uint32_t sem_id);
    static int semaphore_get_count(PriorityScheduler* scheduler, uint32_t sem_id);
};

} // namespace RTOS