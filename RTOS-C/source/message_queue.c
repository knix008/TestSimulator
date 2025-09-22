#include "message_queue.h"
#include "atomic_lock.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Using atomic operations from atomic_lock.h

// Message Queue functions
void message_queue_init(MessageQueue* queue, size_t capacity, uint32_t id) {
    if (!queue) return;
    
    // Limit capacity to maximum allowed
    if (capacity > MAX_MESSAGE_QUEUE_SIZE) {
        capacity = MAX_MESSAGE_QUEUE_SIZE;
    }
    
    queue->id = id;
    queue->capacity = capacity;
    queue->count = 0;
    queue->head = 0;
    queue->tail = 0;
    atomic_lock_init(&queue->lock);
}

void message_queue_destroy(MessageQueue* queue) {
    if (!queue) return;
    
    queue->capacity = 0;
    queue->count = 0;
    queue->head = 0;
    queue->tail = 0;
    atomic_lock_init(&queue->lock);
    // No free() needed - caller manages memory
}

bool message_queue_send(MessageQueue* queue, uint32_t type, const char* data, uint32_t timeout_ms) {
    if (!queue || !data) return false;
    
    // Simple send without platform dependencies
    while (queue->count >= queue->capacity) {
        // Busy wait - in real hardware this would yield to scheduler
        volatile int dummy = 0;
        dummy++;
        
        // Simple timeout handling
        if (timeout_ms > 0) {
            // In real implementation, this would use hardware timer
            timeout_ms--;
            if (timeout_ms == 0) return false;
        }
    }
    
    ATOMIC_LOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    
    // Create a simple message structure
    Message msg;
    msg.id = 0;  // Simple ID
    msg.type = type;
    msg.sender_id = 0;  // Default sender
    
    // Copy data to fixed-size buffer
    strncpy(msg.data, data, sizeof(msg.data) - 1);
    msg.data[sizeof(msg.data) - 1] = '\0';
    
    // Copy message to buffer
    queue->buffer[queue->tail] = msg;
    
    queue->tail = (queue->tail + 1) % queue->capacity;
    queue->count++;
    
    ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    
    return true;
}

bool message_queue_receive(MessageQueue* queue, uint32_t* type, char** data, uint32_t timeout_ms) {
    if (!queue || !type || !data) return false;
    
    // Simple receive without platform dependencies
    while (queue->count == 0) {
        // Busy wait - in real hardware this would yield to scheduler
        volatile int dummy = 0;
        dummy++;
        
        // Simple timeout handling
        if (timeout_ms > 0) {
            // In real implementation, this would use hardware timer
            timeout_ms--;
            if (timeout_ms == 0) return false;
        }
    }
    
    ATOMIC_LOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    
    if (queue->count > 0) {
        // Get message from buffer
        Message* msg = &queue->buffer[queue->head];
        
        *type = msg->type;
        *data = msg->data;  // This returns a pointer to the fixed-size buffer
        
        queue->head = (queue->head + 1) % queue->capacity;
        queue->count--;
        
        ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
        return true;
    }
    
    ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    return false;
}

bool message_queue_is_full(const MessageQueue* queue) {
    return queue ? queue->count >= queue->capacity : false;
}

bool message_queue_is_empty(const MessageQueue* queue) {
    return queue ? queue->count == 0 : true;
}

size_t message_queue_get_count(const MessageQueue* queue) {
    return queue ? queue->count : 0;
}

size_t message_queue_get_capacity(const MessageQueue* queue) {
    return queue ? queue->capacity : 0;
}

size_t message_queue_get_message_size(const MessageQueue* queue) {
    return queue ? sizeof(Message) : 0;  // Fixed message size
}

// Message Queue Manager functions
void message_queue_manager_init(MessageQueueManager* manager) {
    if (!manager) return;
    
    // Initialize queue array
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        manager->queue_used[i] = false;
    }
    manager->next_queue_id = 1;
    manager->queue_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

void message_queue_manager_destroy(MessageQueueManager* manager) {
    if (!manager) return;
    
    // Simple unlock without platform dependencies
    atomic_lock_init(&manager->manager_lock);
    
    // Destroy all queues
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        if (manager->queue_used[i]) {
            message_queue_destroy(&manager->queues[i]);
            manager->queue_used[i] = false;
        }
    }
    
    manager->queue_count = 0;
    // No free() needed - caller manages memory
}

uint32_t message_queue_manager_create_queue(MessageQueueManager* manager, size_t capacity) {
    if (!manager) return 0;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
    
    // Find an available slot
    int slot = -1;
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        if (!manager->queue_used[i]) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
        return 0;  // No available slots
    }
    
    uint32_t queue_id = manager->next_queue_id++;
    MessageQueue* queue = &manager->queues[slot];
    
    message_queue_init(queue, capacity, queue_id);
    
    manager->queue_used[slot] = true;
    manager->queue_count++;
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
    return queue_id;
}

bool message_queue_manager_delete_queue(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return false;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
    
    // Find the queue in the fixed-size array
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        if (manager->queue_used[i] && manager->queues[i].id == queue_id) {
            message_queue_destroy(&manager->queues[i]);
            manager->queue_used[i] = false;
            manager->queue_count--;
            
            ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
            return true;
        }
    }
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_MESSAGE_QUEUE);
    return false;
}

bool message_queue_manager_send(MessageQueueManager* manager, uint32_t queue_id, uint32_t type, const char* data, uint32_t timeout_ms) {
    if (!manager) return false;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_send(queue, type, data, timeout_ms) : false;
}

bool message_queue_manager_receive(MessageQueueManager* manager, uint32_t queue_id, uint32_t* type, char** data, uint32_t timeout_ms) {
    if (!manager) return false;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_receive(queue, type, data, timeout_ms) : false;
}

bool message_queue_manager_is_full(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return false;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_is_full(queue) : false;
}

bool message_queue_manager_is_empty(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return true;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_is_empty(queue) : true;
}

size_t message_queue_manager_get_count(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return 0;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_get_count(queue) : 0;
}

size_t message_queue_manager_get_capacity(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return 0;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_get_capacity(queue) : 0;
}

size_t message_queue_manager_get_message_size(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return 0;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    return queue ? message_queue_get_message_size(queue) : 0;
}

// Status and debugging
size_t message_queue_manager_get_queue_count(const MessageQueueManager* manager) {
    return manager ? manager->queue_count : 0;
}

MessageQueue* message_queue_manager_get_queue(MessageQueueManager* manager, uint32_t queue_id) {
    return message_queue_manager_find_queue(manager, queue_id);
}

void message_queue_manager_print_queues(const MessageQueueManager* manager) {
    if (!manager) return;
    
    printf("=== Message Queue Manager Status ===\n");
    printf("Total queues: %zu\n", manager->queue_count);
    
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        if (manager->queue_used[i]) {
            MessageQueue* queue = (MessageQueue*)&manager->queues[i];
            printf("  Queue %u: count=%zu/%zu, msg_size=%zu\n", 
                   queue->id, 
                   queue->count, 
                   queue->capacity, 
                   sizeof(Message));
        }
    }
    printf("=====================================\n");
}

// Internal helper functions
MessageQueue* message_queue_manager_find_queue(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return NULL;
    
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        if (manager->queue_used[i] && manager->queues[i].id == queue_id) {
            return &manager->queues[i];
        }
    }
    return NULL;
}

// Message functions
Message message_create(uint32_t id, uint32_t type, const char* data, uint32_t sender_id) {
    Message msg;
    msg.id = id;
    msg.type = type;
    msg.sender_id = sender_id;
    
    if (data) {
        strncpy(msg.data, data, MAX_MESSAGE_DATA_SIZE - 1);
        msg.data[MAX_MESSAGE_DATA_SIZE - 1] = '\0'; // Ensure null termination
    } else {
        msg.data[0] = '\0';
    }
    
    return msg;
}

void message_destroy(Message* msg) {
    if (msg) {
        // Clear the message data
        memset(msg->data, 0, MAX_MESSAGE_DATA_SIZE);
        msg->id = 0;
        msg->type = 0;
        msg->sender_id = 0;
    }
}

Message message_copy(const Message* src) {
    Message dst;
    if (src) {
        dst.id = src->id;
        dst.type = src->type;
        dst.sender_id = src->sender_id;
        strncpy(dst.data, src->data, MAX_MESSAGE_DATA_SIZE - 1);
        dst.data[MAX_MESSAGE_DATA_SIZE - 1] = '\0';
    } else {
        memset(&dst, 0, sizeof(Message));
    }
    return dst;
}

// Message Queue functions that work with Message structs
bool message_queue_send_message(MessageQueue* queue, const Message* msg, uint32_t timeout_ms) {
    (void)timeout_ms; // Suppress unused parameter warning
    if (!queue || !msg) return false;
    
    ATOMIC_LOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    
    // Check if queue is full
    if (queue->count >= queue->capacity) {
        ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
        return false;
    }
    
    // Add message to queue
    queue->buffer[queue->tail] = *msg;
    queue->tail = (queue->tail + 1) % queue->capacity;
    queue->count++;
    
    ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    return true;
}

bool message_queue_receive_message(MessageQueue* queue, Message* msg, uint32_t timeout_ms) {
    (void)timeout_ms; // Suppress unused parameter warning
    if (!queue || !msg) return false;
    
    ATOMIC_LOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    
    // Check if queue is empty
    if (queue->count == 0) {
        ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
        return false;
    }
    
    // Get message from queue
    *msg = queue->buffer[queue->head];
    queue->head = (queue->head + 1) % queue->capacity;
    queue->count--;
    
    ATOMIC_UNLOCK(&queue->lock, LOCK_ID_MESSAGE_QUEUE);
    return true;
}

// Manager functions that work with Message structs
bool message_queue_manager_send_message(MessageQueueManager* manager, uint32_t queue_id, const Message* msg, uint32_t timeout_ms) {
    if (!manager || !msg) return false;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    if (!queue) return false;
    
    return message_queue_send_message(queue, msg, timeout_ms);
}

bool message_queue_manager_receive_message(MessageQueueManager* manager, uint32_t queue_id, Message* msg, uint32_t timeout_ms) {
    if (!manager || !msg) return false;
    
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    if (!queue) return false;
    
    return message_queue_receive_message(queue, msg, timeout_ms);
}