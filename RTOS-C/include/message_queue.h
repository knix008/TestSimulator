#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "atomic_lock.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MAX_MESSAGE_DATA_SIZE 256
#define MAX_MESSAGE_QUEUE_SIZE 100

// Message structure
typedef struct Message {
    uint32_t id;
    uint32_t type;
    char data[MAX_MESSAGE_DATA_SIZE];  // Fixed-size data buffer
    uint32_t sender_id;
} Message;

// Forward declarations
typedef struct MessageQueue MessageQueue;
typedef struct MessageQueueNode MessageQueueNode;

// Message Queue structure
typedef struct MessageQueue {
    uint32_t id;            // Queue ID
    Message buffer[MAX_MESSAGE_QUEUE_SIZE];  // Fixed-size buffer for messages
    size_t capacity;        // Maximum number of messages
    size_t count;           // Current number of messages
    size_t head;            // Index of first message
    size_t tail;            // Index of next free slot
    atomic_lock_t lock;     // Atomic lock for thread safety
} MessageQueue;

// Message queue node
typedef struct MessageQueueNode {
    uint32_t id;
    MessageQueue* queue;
    struct MessageQueueNode* next;
} MessageQueueNode;

// Message Queue Manager node
typedef struct MessageQueueManagerNode {
    uint32_t id;
    MessageQueue* queue;
    struct MessageQueueManagerNode* next;
} MessageQueueManagerNode;

#define MAX_MESSAGE_QUEUES 16

// Independent Message Queue Manager
typedef struct MessageQueueManager {
    MessageQueue queues[MAX_MESSAGE_QUEUES];  // Fixed-size array of queues
    bool queue_used[MAX_MESSAGE_QUEUES];      // Track which queues are used
    uint32_t next_queue_id;
    size_t queue_count;
    atomic_lock_t manager_lock;  // Atomic lock for manager operations
} MessageQueueManager;

// Message functions
Message message_create(uint32_t id, uint32_t type, const char* data, uint32_t sender_id);
void message_destroy(Message* msg);
Message message_copy(const Message* src);

// Message Queue functions
void message_queue_init(MessageQueue* queue, size_t capacity, uint32_t id);
void message_queue_destroy(MessageQueue* queue);
bool message_queue_send_message(MessageQueue* queue, const Message* msg, uint32_t timeout_ms);
bool message_queue_send(MessageQueue* queue, uint32_t type, const char* data, uint32_t timeout_ms);
bool message_queue_receive_message(MessageQueue* queue, Message* msg, uint32_t timeout_ms);
bool message_queue_receive(MessageQueue* queue, uint32_t* type, char** data, uint32_t timeout_ms);
size_t message_queue_get_count(const MessageQueue* queue);
size_t message_queue_get_max_size(const MessageQueue* queue);
size_t message_queue_get_capacity(const MessageQueue* queue);
bool message_queue_is_full(const MessageQueue* queue);
bool message_queue_is_empty(const MessageQueue* queue);

// Message Queue Manager functions
void message_queue_manager_init(MessageQueueManager* manager);
void message_queue_manager_destroy(MessageQueueManager* manager);

// Message queue management functions
uint32_t message_queue_manager_create_queue(MessageQueueManager* manager, size_t capacity);
bool message_queue_manager_delete_queue(MessageQueueManager* manager, uint32_t queue_id);
bool message_queue_manager_send_message(MessageQueueManager* manager, uint32_t queue_id, const Message* msg, uint32_t timeout_ms);
bool message_queue_manager_send(MessageQueueManager* manager, uint32_t queue_id, uint32_t type, const char* data, uint32_t timeout_ms);
bool message_queue_manager_receive_message(MessageQueueManager* manager, uint32_t queue_id, Message* msg, uint32_t timeout_ms);
bool message_queue_manager_receive(MessageQueueManager* manager, uint32_t queue_id, uint32_t* type, char** data, uint32_t timeout_ms);
size_t message_queue_manager_get_count(MessageQueueManager* manager, uint32_t queue_id);
size_t message_queue_manager_get_max_size(MessageQueueManager* manager, uint32_t queue_id);

// Status and debugging
size_t message_queue_manager_get_queue_count(const MessageQueueManager* manager);
MessageQueue* message_queue_manager_get_queue(MessageQueueManager* manager, uint32_t queue_id);
void message_queue_manager_print_queues(const MessageQueueManager* manager);

// Internal helper functions
MessageQueue* message_queue_manager_find_queue(MessageQueueManager* manager, uint32_t queue_id);

#ifdef __cplusplus
}
#endif