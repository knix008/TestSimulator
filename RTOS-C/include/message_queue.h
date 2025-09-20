#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Message structure
typedef struct Message {
    uint32_t id;
    uint32_t type;
    char* data;
    uint32_t sender_id;
} Message;

// Message queue node
typedef struct MessageQueueNode {
    Message message;
    struct MessageQueueNode* next;
} MessageQueueNode;

// Message Queue structure
typedef struct MessageQueue {
    MessageQueueNode* front;
    MessageQueueNode* rear;
    size_t count;
    size_t max_size;
    mutex_t mutex;
    cond_t cv_not_full;
    cond_t cv_not_empty;
} MessageQueue;

// Message Queue Manager node
typedef struct MessageQueueManagerNode {
    uint32_t id;
    MessageQueue* queue;
    struct MessageQueueManagerNode* next;
} MessageQueueManagerNode;

// Independent Message Queue Manager
typedef struct MessageQueueManager {
    MessageQueueManagerNode* queues_head;
    uint32_t next_queue_id;
    size_t queue_count;
    mutex_t manager_mutex;
} MessageQueueManager;

// Message functions
Message message_create(uint32_t id, uint32_t type, const char* data, uint32_t sender_id);
void message_destroy(Message* msg);
Message message_copy(const Message* src);

// Message Queue functions
MessageQueue* message_queue_create(size_t max_size);
void message_queue_destroy(MessageQueue* queue);
bool message_queue_send_message(MessageQueue* queue, const Message* msg, uint32_t timeout_ms);
bool message_queue_send(MessageQueue* queue, uint32_t type, const char* data, uint32_t timeout_ms);
bool message_queue_receive_message(MessageQueue* queue, Message* msg, uint32_t timeout_ms);
bool message_queue_receive(MessageQueue* queue, uint32_t* type, char** data, uint32_t timeout_ms);
size_t message_queue_get_count(const MessageQueue* queue);
size_t message_queue_get_max_size(const MessageQueue* queue);
bool message_queue_is_full(const MessageQueue* queue);
bool message_queue_is_empty(const MessageQueue* queue);

// Message Queue Manager functions
MessageQueueManager* message_queue_manager_create(void);
void message_queue_manager_destroy(MessageQueueManager* manager);

// Message queue management functions
uint32_t message_queue_manager_create_queue(MessageQueueManager* manager, size_t max_size);
bool message_queue_manager_delete_queue(MessageQueueManager* manager, uint32_t queue_id);
bool message_queue_manager_send_message(MessageQueueManager* manager, uint32_t queue_id, const Message* msg, uint32_t timeout_ms);
bool message_queue_manager_send(MessageQueueManager* manager, uint32_t queue_id, uint32_t type, const char* data, uint32_t timeout_ms);
bool message_queue_manager_receive_message(MessageQueueManager* manager, uint32_t queue_id, Message* msg, uint32_t timeout_ms);
bool message_queue_manager_receive(MessageQueueManager* manager, uint32_t queue_id, uint32_t* type, char** data, uint32_t timeout_ms);
size_t message_queue_manager_get_count(MessageQueueManager* manager, uint32_t queue_id);
size_t message_queue_manager_get_max_size(MessageQueueManager* manager, uint32_t queue_id);

// Status and debugging
size_t message_queue_manager_get_queue_count(const MessageQueueManager* manager);
void message_queue_manager_print_queues(const MessageQueueManager* manager);

// Internal helper functions
MessageQueue* message_queue_manager_find_queue(MessageQueueManager* manager, uint32_t queue_id);

#ifdef __cplusplus
}
#endif