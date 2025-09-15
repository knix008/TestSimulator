#include "message_queue.h"
#include <chrono>
#include <ctime>
#include <iostream>

namespace RTOS {

MessageQueue::MessageQueue(size_t max_size) 
    : max_size_(max_size), next_message_id_(1) {}

bool MessageQueue::send(const Message& message, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        cv_.wait(lock, [this] { return messages_.size() < max_size_; });
    } else {
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return messages_.size() < max_size_; })) {
            return false; 
        }
    }
    
    Message msg = message;
    if (msg.id == 0) {
        msg.id = next_message_id_++;
    }
    
    if (msg.timestamp == 0) {
        msg.timestamp = static_cast<uint32_t>(std::time(nullptr));
    }
    
    messages_.push(msg);
    cv_.notify_one();
    
    return true;
}

bool MessageQueue::send(uint32_t type, const std::string& data, uint32_t timeout_ms) {
    Message message(0, type, data);
    return send(message, timeout_ms);
}

bool MessageQueue::receive(Message& message, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        cv_.wait(lock, [this] { return !messages_.empty(); });
    } else {
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return !messages_.empty(); })) {
            return false; 
        }
    }
    
    message = messages_.front();
    messages_.pop();
    cv_.notify_one(); 
    return true;
}

bool MessageQueue::receive(uint32_t& type, std::string& data, uint32_t timeout_ms) {
    Message message;
    if (receive(message, timeout_ms)) {
        type = message.type;
        data = message.data;
        return true;
    }
    return false;
}

size_t MessageQueue::get_message_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.size();
}

size_t MessageQueue::get_max_size() const {
    return max_size_;
}

bool MessageQueue::is_empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.empty();
}

bool MessageQueue::is_full() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.size() >= max_size_;
}

void MessageQueue::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::queue<Message> empty;
    messages_.swap(empty);
    cv_.notify_all(); 
}

bool MessageQueue::peek(Message& message) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!messages_.empty()) {
        message = messages_.front();
        return true;
    }
    return false;
}

// MessageQueueManager implementation
MessageQueueManager::MessageQueueManager() : next_mq_id_(1) {}

uint32_t MessageQueueManager::create_message_queue(size_t max_size) {
    auto mq = std::make_shared<MessageQueue>(max_size);
    uint32_t mq_id = next_mq_id_++;
    message_queues_[mq_id] = mq;
    return mq_id;
}

bool MessageQueueManager::delete_message_queue(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it != message_queues_.end()) {
        message_queues_.erase(it);
        return true;
    }
    return false;
}

bool MessageQueueManager::message_queue_send(uint32_t mq_id, uint32_t type, const std::string& data, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->send(type, data, timeout_ms);
}

bool MessageQueueManager::message_queue_send(uint32_t mq_id, const Message& message, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->send(message, timeout_ms);
}

bool MessageQueueManager::message_queue_receive(uint32_t mq_id, uint32_t& type, std::string& data, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->receive(type, data, timeout_ms);
}

bool MessageQueueManager::message_queue_receive(uint32_t mq_id, Message& message, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->receive(message, timeout_ms);
}

size_t MessageQueueManager::message_queue_get_count(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return 0;
    }
    
    return it->second->get_message_count();
}

size_t MessageQueueManager::message_queue_get_max_size(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return 0;
    }
    
    return it->second->get_max_size();
}

bool MessageQueueManager::message_queue_is_empty(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return true;
    }
    
    return it->second->is_empty();
}

bool MessageQueueManager::message_queue_is_full(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->is_full();
}

void MessageQueueManager::message_queue_clear(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it != message_queues_.end()) {
        it->second->clear();
    }
}

bool MessageQueueManager::message_queue_peek(uint32_t mq_id, Message& message) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->peek(message);
}

size_t MessageQueueManager::get_message_queue_count() const {
    return message_queues_.size();
}

void MessageQueueManager::print_message_queues() const {
    std::cout << "Message Queues (" << message_queues_.size() << "):\n";
    for (const auto& pair : message_queues_) {
        std::cout << "  ID: " << pair.first 
                  << ", Messages: " << pair.second->get_message_count() 
                  << "/" << pair.second->get_max_size() << "\n";
    }
}

} // namespace RTOS
