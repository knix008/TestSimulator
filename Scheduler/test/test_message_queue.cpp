#include "scheduler.h"
#include "message_queue.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_message_queue_functionality() {
    std::cout << "=== Message Queue Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create message queue
    uint32_t mq_id = MessageQueueManager::create_message_queue(&scheduler, 5); // max 5 messages
    assert(mq_id != 0);
    
    // Check initial state
    assert(MessageQueueManager::message_queue_is_empty(&scheduler, mq_id));
    assert(!MessageQueueManager::message_queue_is_full(&scheduler, mq_id));
    assert(MessageQueueManager::message_queue_get_count(&scheduler, mq_id) == 0);
    assert(MessageQueueManager::message_queue_get_max_size(&scheduler, mq_id) == 5);
    
    std::cout << "Created message queue with max size: " << MessageQueueManager::message_queue_get_max_size(&scheduler, mq_id) << std::endl;
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Message send test
    assert(MessageQueueManager::message_queue_send(&scheduler, mq_id, 1, "Hello", 1000));
    assert(MessageQueueManager::message_queue_send(&scheduler, mq_id, 2, "World", 1000));
    assert(MessageQueueManager::message_queue_send(&scheduler, mq_id, 3, "RTOS", 1000));
    
    assert(MessageQueueManager::message_queue_get_count(&scheduler, mq_id) == 3);
    assert(!MessageQueueManager::message_queue_is_empty(&scheduler, mq_id));
    assert(!MessageQueueManager::message_queue_is_full(&scheduler, mq_id));
    
    // Message receive test
    uint32_t type;
    std::string data;
    
    assert(MessageQueueManager::message_queue_receive(&scheduler, mq_id, type, data, 1000));
    assert(type == 1);
    assert(data == "Hello");
    
    assert(MessageQueueManager::message_queue_receive(&scheduler, mq_id, type, data, 1000));
    assert(type == 2);
    assert(data == "World");
    
    assert(MessageQueueManager::message_queue_get_count(&scheduler, mq_id) == 1);
    
    // Test Message object send/receive
    Message msg(0, 100, "Custom Message", 12345);
    assert(MessageQueueManager::message_queue_send(&scheduler, mq_id, msg, 1000));
    
    Message received_msg;
    assert(MessageQueueManager::message_queue_receive(&scheduler, mq_id, received_msg, 1000));
    assert(received_msg.type == 3);
    assert(received_msg.data == "RTOS");
    
    assert(MessageQueueManager::message_queue_receive(&scheduler, mq_id, received_msg, 1000));
    assert(received_msg.type == 100);
    assert(received_msg.data == "Custom Message");
    
    // Fill queue test
    for (int i = 0; i < 5; i++) {
        assert(MessageQueueManager::message_queue_send(&scheduler, mq_id, i + 10, "Fill " + std::to_string(i), 1000));
    }
    assert(MessageQueueManager::message_queue_is_full(&scheduler, mq_id));
    
    // Queue clear test
    MessageQueueManager::message_queue_clear(&scheduler, mq_id);
    assert(MessageQueueManager::message_queue_is_empty(&scheduler, mq_id));
    assert(MessageQueueManager::message_queue_get_count(&scheduler, mq_id) == 0);
    
    // Cleanup
    MessageQueueManager::delete_message_queue(&scheduler, mq_id);
    MessageQueueManager::delete_message_queue(&scheduler, 999); // Test non-existent queue
    
    std::cout << "Message queue functionality test passed!" << std::endl << std::endl;
}