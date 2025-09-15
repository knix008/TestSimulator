#pragma once

#include <cstdint>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <memory>
#include <string>
#include <map>

namespace RTOS {

// Forward declarations
class PriorityScheduler;
struct Task;

// Message structure
struct Message {
    uint32_t id;
    uint32_t type;
    std::string data;
    uint32_t timestamp;
    
    Message(uint32_t msg_id = 0, uint32_t msg_type = 0, const std::string& msg_data = "", uint32_t msg_timestamp = 0)
        : id(msg_id), type(msg_type), data(msg_data), timestamp(msg_timestamp) {}
};

// Message Queue class
class MessageQueue {
private:
    std::queue<Message> messages_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    size_t max_size_;
    uint32_t next_message_id_;
    
public:
    explicit MessageQueue(size_t max_size = 100);
    ~MessageQueue() = default;
    
    // Message sending
    bool send(const Message& message, uint32_t timeout_ms = 0);
    bool send(uint32_t type, const std::string& data, uint32_t timeout_ms = 0);
    
    // Message receiving
    bool receive(Message& message, uint32_t timeout_ms = 0);
    bool receive(uint32_t& type, std::string& data, uint32_t timeout_ms = 0);
    
    // Status query
    size_t get_message_count() const;
    size_t get_max_size() const;
    bool is_empty() const;
    bool is_full() const;
    
    // Queue management
    void clear();
    bool peek(Message& message) const;
};

// Message Queue management functions for PriorityScheduler
class MessageQueueManager {
public:
    // Message Queue management functions
    static uint32_t create_message_queue(PriorityScheduler* scheduler, size_t max_size = 100);
    static bool delete_message_queue(PriorityScheduler* scheduler, uint32_t mq_id);
    static bool message_queue_send(PriorityScheduler* scheduler, uint32_t mq_id, uint32_t type, const std::string& data, uint32_t timeout_ms = 0);
    static bool message_queue_send(PriorityScheduler* scheduler, uint32_t mq_id, const Message& message, uint32_t timeout_ms = 0);
    static bool message_queue_receive(PriorityScheduler* scheduler, uint32_t mq_id, uint32_t& type, std::string& data, uint32_t timeout_ms = 0);
    static bool message_queue_receive(PriorityScheduler* scheduler, uint32_t mq_id, Message& message, uint32_t timeout_ms = 0);
    static size_t message_queue_get_count(PriorityScheduler* scheduler, uint32_t mq_id);
    static size_t message_queue_get_max_size(PriorityScheduler* scheduler, uint32_t mq_id);
    static bool message_queue_is_empty(PriorityScheduler* scheduler, uint32_t mq_id);
    static bool message_queue_is_full(PriorityScheduler* scheduler, uint32_t mq_id);
    static void message_queue_clear(PriorityScheduler* scheduler, uint32_t mq_id);
    static bool message_queue_peek(PriorityScheduler* scheduler, uint32_t mq_id, Message& message);
};

} // namespace RTOS