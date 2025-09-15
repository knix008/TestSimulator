#include "semaphore.h"
#include "scheduler.h"
#include <chrono>

namespace RTOS {

// Semaphore ����
Semaphore::Semaphore(int initial_count) : count_(initial_count) {}

bool Semaphore::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // ���� ���
        cv_.wait(lock, [this] { return count_ > 0; });
    } else {
        // Ÿ�Ӿƿ� ���
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return count_ > 0; })) {
            return false; // Ÿ�Ӿƿ�
        }
    }
    
    count_--;
    return true;
}

bool Semaphore::post() {
    std::lock_guard<std::mutex> lock(mutex_);
    count_++;
    cv_.notify_one();
    return true;
}

int Semaphore::get_count() const {
    return count_.load();
}

// Semaphore management functions
uint32_t PriorityScheduler::create_semaphore(int initial_count) {
    auto semaphore = std::make_shared<Semaphore>(initial_count);
    uint32_t sem_id = next_sync_id_++;
    semaphores_[sem_id] = semaphore;
    return sem_id;
}

bool PriorityScheduler::delete_semaphore(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it != semaphores_.end()) {
        semaphores_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::semaphore_wait(uint32_t sem_id, uint32_t timeout_ms) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    // Semaphore wait
    if (!it->second->wait(timeout_ms)) {
        return false; // Timeout or failure
    }
    
    return true;
}

bool PriorityScheduler::semaphore_post(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    return it->second->post();
}

int PriorityScheduler::semaphore_get_count(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return -1;
    }
    
    return it->second->get_count();
}

} // namespace RTOS
