#include "config.h"
#if ENABLE_SEMAPHORE
// ...existing code...
#endif
#include "semaphore.h"
#include <chrono>
#include <iostream>

namespace RTOS {

// Semaphore constructor
Semaphore::Semaphore(int initial_count) : count_(initial_count) {}

bool Semaphore::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // Infinite wait
        cv_.wait(lock, [this] { return count_ > 0; });
    } else {
        // Timeout wait
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return count_ > 0; })) {
            return false; // Timeout
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

// SemaphoreManager implementation
SemaphoreManager::SemaphoreManager() : next_semaphore_id_(1) {}

uint32_t SemaphoreManager::create_semaphore(int initial_count) {
    auto semaphore = std::make_shared<Semaphore>(initial_count);
    uint32_t sem_id = next_semaphore_id_++;
    semaphores_[sem_id] = semaphore;
    return sem_id;
}

bool SemaphoreManager::delete_semaphore(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it != semaphores_.end()) {
        semaphores_.erase(it);
        return true;
    }
    return false;
}

bool SemaphoreManager::semaphore_wait(uint32_t sem_id, uint32_t timeout_ms) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    return it->second->wait(timeout_ms);
}

bool SemaphoreManager::semaphore_post(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    return it->second->post();
}

int SemaphoreManager::semaphore_get_count(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return -1;
    }
    
    return it->second->get_count();
}

size_t SemaphoreManager::get_semaphore_count() const {
    return semaphores_.size();
}

void SemaphoreManager::print_semaphores() const {
    std::cout << "Semaphores (" << semaphores_.size() << "):\n";
    for (const auto& pair : semaphores_) {
        std::cout << "  ID: " << pair.first << ", Count: " << pair.second->get_count() << "\n";
    }
}

} // namespace RTOS