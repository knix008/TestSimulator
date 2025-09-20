#include "message_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <time.h>

// Message functions
Message message_create(uint32_t id, uint32_t type, const char* data, uint32_t sender_id) {
    Message msg;
    msg.id = id;
    msg.type = type;
    msg.sender_id = sender_id;
    
    if (data) {
        msg.data = (char*)malloc(strlen(data) + 1);
        if (msg.data) {
            strcpy(msg.data, data);
        }
    } else {
        msg.data = NULL;
    }
    
    return msg;
}

void message_destroy(Message* msg) {
    if (msg && msg->data) {
        free(msg->data);
        msg->data = NULL;
    }
}

Message message_copy(const Message* src) {
    Message copy = {0};
    if (src) {
        copy.id = src->id;
        copy.type = src->type;
        copy.sender_id = src->sender_id;
        
        if (src->data) {
            copy.data = (char*)malloc(strlen(src->data) + 1);
            if (copy.data) {
                strcpy(copy.data, src->data);
            }
        }
    }
    return copy;
}

// Message Queue functions
MessageQueue* message_queue_create(size_t max_size) {
    MessageQueue* queue = (MessageQueue*)malloc(sizeof(MessageQueue));
    if (!queue) return NULL;
    
    queue->front = NULL;
    queue->rear = NULL;
    queue->count = 0;
    queue->max_size = max_size;
    
    if (platform_mutex_init(&queue->mutex) != 0) {
        free(queue);
        return NULL;
    }
    
    if (platform_cond_init(&queue->cv_not_full) != 0) {
        platform_mutex_destroy(&queue->mutex);
        free(queue);
        return NULL;
    }
    
    if (platform_cond_init(&queue->cv_not_empty) != 0) {
        platform_mutex_destroy(&queue->mutex);
        platform_cond_destroy(&queue->cv_not_full);
        free(queue);
        return NULL;
    }
    
    return queue;
}

void message_queue_destroy(MessageQueue* queue) {
    if (!queue) return;
    
    platform_mutex_lock(&queue->mutex);
    
    // Free all messages in queue
    MessageQueueNode* current = queue->front;
    while (current) {
        MessageQueueNode* next = current->next;
        message_destroy(&current->message);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&queue->mutex);
    
    platform_mutex_destroy(&queue->mutex);
    platform_cond_destroy(&queue->cv_not_full);
    platform_cond_destroy(&queue->cv_not_empty);
    free(queue);
}

bool message_queue_send_message(MessageQueue* queue, const Message* msg, uint32_t timeout_ms) {
    if (!queue || !msg) return false;
    
    platform_mutex_lock(&queue->mutex);
    
    // Wait for space if queue is full
    if (timeout_ms == 0) {
        // Infinite wait
        while (queue->count >= queue->max_size) {
            platform_cond_wait(&queue->cv_not_full, &queue->mutex);
        }
    } else {
        // Timed wait
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_sec += timeout_ms / 1000;
        ts.tv_nsec += (timeout_ms % 1000) * 1000000;
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec++;
            ts.tv_nsec -= 1000000000;
        }
        
        while (queue->count >= queue->max_size) {
            int result = platform_cond_timedwait(&queue->cv_not_full, &queue->mutex, &ts);
            if (result != 0) { // Platform returns non-zero on timeout/error
                platform_mutex_unlock(&queue->mutex);
                return false;
            }
        }
    }
    
    // Create new node
    MessageQueueNode* node = (MessageQueueNode*)malloc(sizeof(MessageQueueNode));
    if (!node) {
        platform_mutex_unlock(&queue->mutex);
        return false;
    }
    
    node->message = message_copy(msg);
    node->next = NULL;
    
    // Add to queue
    if (queue->rear) {
        queue->rear->next = node;
    } else {
        queue->front = node;
    }
    queue->rear = node;
    queue->count++;
    
    platform_cond_signal(&queue->cv_not_empty);
    platform_mutex_unlock(&queue->mutex);
    
    return true;
}

bool message_queue_send(MessageQueue* queue, uint32_t type, const char* data, uint32_t timeout_ms) {
    Message msg = message_create(0, type, data, 0);
    bool result = message_queue_send_message(queue, &msg, timeout_ms);
    message_destroy(&msg);
    return result;
}

bool message_queue_receive_message(MessageQueue* queue, Message* msg, uint32_t timeout_ms) {
    if (!queue || !msg) return false;
    
    platform_mutex_lock(&queue->mutex);
    
    // Wait for message if queue is empty
    if (timeout_ms == 0) {
        // Infinite wait
        while (queue->count == 0) {
            platform_cond_wait(&queue->cv_not_empty, &queue->mutex);
        }
    } else {
        // Timed wait
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_sec += timeout_ms / 1000;
        ts.tv_nsec += (timeout_ms % 1000) * 1000000;
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec++;
            ts.tv_nsec -= 1000000000;
        }
        
        while (queue->count == 0) {
            int result = platform_cond_timedwait(&queue->cv_not_empty, &queue->mutex, &ts);
            if (result != 0) { // Platform returns non-zero on timeout/error
                platform_mutex_unlock(&queue->mutex);
                return false;
            }
        }
    }
    
    // Remove from queue
    MessageQueueNode* node = queue->front;
    *msg = node->message;
    queue->front = node->next;
    if (!queue->front) {
        queue->rear = NULL;
    }
    queue->count--;
    
    free(node);
    
    platform_cond_signal(&queue->cv_not_full);
    platform_mutex_unlock(&queue->mutex);
    
    return true;
}

bool message_queue_receive(MessageQueue* queue, uint32_t* type, char** data, uint32_t timeout_ms) {
    Message msg;
    if (message_queue_receive_message(queue, &msg, timeout_ms)) {
        *type = msg.type;
        *data = msg.data; // Transfer ownership
        return true;
    }
    return false;
}

size_t message_queue_get_count(const MessageQueue* queue) {
    if (!queue) return 0;
    
    platform_mutex_lock((mutex_t*)&queue->mutex);
    size_t count = queue->count;
    platform_mutex_unlock((mutex_t*)&queue->mutex);
    
    return count;
}

size_t message_queue_get_max_size(const MessageQueue* queue) {
    return queue ? queue->max_size : 0;
}

bool message_queue_is_full(const MessageQueue* queue) {
    return queue && message_queue_get_count(queue) >= queue->max_size;
}

bool message_queue_is_empty(const MessageQueue* queue) {
    return queue && message_queue_get_count(queue) == 0;
}

// Message Queue Manager functions
MessageQueueManager* message_queue_manager_create(void) {
    MessageQueueManager* manager = (MessageQueueManager*)malloc(sizeof(MessageQueueManager));
    if (!manager) return NULL;
    
    manager->queues_head = NULL;
    manager->next_queue_id = 1;
    manager->queue_count = 0;
    
    if (platform_mutex_init(&manager->manager_mutex) != 0) {
        free(manager);
        return NULL;
    }
    
    return manager;
}

void message_queue_manager_destroy(MessageQueueManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    MessageQueueManagerNode* current = manager->queues_head;
    while (current) {
        MessageQueueManagerNode* next = current->next;
        message_queue_destroy(current->queue);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    platform_mutex_destroy(&manager->manager_mutex);
    free(manager);
}

MessageQueue* message_queue_manager_find_queue(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return NULL;
    
    MessageQueueManagerNode* current = manager->queues_head;
    while (current) {
        if (current->id == queue_id) {
            return current->queue;
        }
        current = current->next;
    }
    
    return NULL;
}

uint32_t message_queue_manager_create_queue(MessageQueueManager* manager, size_t max_size) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    MessageQueue* queue = message_queue_create(max_size);
    if (!queue) {
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    MessageQueueManagerNode* node = (MessageQueueManagerNode*)malloc(sizeof(MessageQueueManagerNode));
    if (!node) {
        message_queue_destroy(queue);
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    uint32_t queue_id = manager->next_queue_id++;
    node->id = queue_id;
    node->queue = queue;
    node->next = manager->queues_head;
    manager->queues_head = node;
    manager->queue_count++;
    
    platform_mutex_unlock(&manager->manager_mutex);
    return queue_id;
}

bool message_queue_manager_delete_queue(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    MessageQueueManagerNode* current = manager->queues_head;
    MessageQueueManagerNode* prev = NULL;
    
    while (current) {
        if (current->id == queue_id) {
            if (prev) {
                prev->next = current->next;
            } else {
                manager->queues_head = current->next;
            }
            
            message_queue_destroy(current->queue);
            free(current);
            manager->queue_count--;
            
            platform_mutex_unlock(&manager->manager_mutex);
            return true;
        }
        
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return false;
}

bool message_queue_manager_send_message(MessageQueueManager* manager, uint32_t queue_id, const Message* msg, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return false;
    
    return message_queue_send_message(queue, msg, timeout_ms);
}

bool message_queue_manager_send(MessageQueueManager* manager, uint32_t queue_id, uint32_t type, const char* data, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return false;
    
    return message_queue_send(queue, type, data, timeout_ms);
}

bool message_queue_manager_receive_message(MessageQueueManager* manager, uint32_t queue_id, Message* msg, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return false;
    
    return message_queue_receive_message(queue, msg, timeout_ms);
}

bool message_queue_manager_receive(MessageQueueManager* manager, uint32_t queue_id, uint32_t* type, char** data, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return false;
    
    return message_queue_receive(queue, type, data, timeout_ms);
}

size_t message_queue_manager_get_count(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return 0;
    
    return message_queue_get_count(queue);
}

size_t message_queue_manager_get_max_size(MessageQueueManager* manager, uint32_t queue_id) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    MessageQueue* queue = message_queue_manager_find_queue(manager, queue_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!queue) return 0;
    
    return message_queue_get_max_size(queue);
}

size_t message_queue_manager_get_queue_count(const MessageQueueManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    size_t count = manager->queue_count;
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
    
    return count;
}

void message_queue_manager_print_queues(const MessageQueueManager* manager) {
    if (!manager) {
        printf("MessageQueueManager is NULL\n");
        return;
    }
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("Message Queue Manager Status:\n");
    printf("Total queues: %zu\n", manager->queue_count);
    
    MessageQueueManagerNode* current = manager->queues_head;
    while (current) {
        printf("  Queue ID %u: %zu/%zu messages\n", 
               current->id, 
               message_queue_get_count(current->queue),
               message_queue_get_max_size(current->queue));
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}
