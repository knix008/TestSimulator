#include "scheduler.h"
#include "message_queue.h"
#include <iostream>
#include <cassert>
#include <exception>

using namespace RTOS;

void test_message_queue_functionality() {
    std::cout << "=== Message Queue Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    MessageQueueManager mq_manager;
    
    // Create message queue
    uint32_t mq_id = mq_manager.create_message_queue(5); // max 5 messages
    assert(mq_id != 0);
    
    // Check initial state
    assert(mq_manager.message_queue_is_empty(mq_id));
    assert(!mq_manager.message_queue_is_full(mq_id));
    assert(mq_manager.message_queue_get_count(mq_id) == 0);
    assert(mq_manager.message_queue_get_max_size(mq_id) == 5);
    
    std::cout << "Created message queue with max size: " << mq_manager.message_queue_get_max_size(mq_id) << std::endl;
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Message send test
    assert(mq_manager.message_queue_send(mq_id, 1, "Hello", 1000));
    assert(mq_manager.message_queue_send(mq_id, 2, "World", 1000));
    assert(mq_manager.message_queue_send(mq_id, 3, "RTOS", 1000));
    
    assert(mq_manager.message_queue_get_count(mq_id) == 3);
    assert(!mq_manager.message_queue_is_empty(mq_id));
    assert(!mq_manager.message_queue_is_full(mq_id));
    
    // Message receive test
    uint32_t type;
    std::string data;
    
    assert(mq_manager.message_queue_receive(mq_id, type, data, 1000));
    assert(type == 1);
    assert(data == "Hello");
    (void)type; // Suppress unused variable warning
    
    assert(mq_manager.message_queue_receive(mq_id, type, data, 1000));
    assert(type == 2);
    assert(data == "World");
    
    assert(mq_manager.message_queue_get_count(mq_id) == 1);
    
    // Test Message object send/receive
    Message msg(0, 100, "Custom Message", 12345);
    assert(mq_manager.message_queue_send(mq_id, msg, 1000));
    
    Message received_msg;
    assert(mq_manager.message_queue_receive(mq_id, received_msg, 1000));
    assert(received_msg.type == 3);
    assert(received_msg.data == "RTOS");
    
    assert(mq_manager.message_queue_receive(mq_id, received_msg, 1000));
    assert(received_msg.type == 100);
    assert(received_msg.data == "Custom Message");
    
    // Fill queue test
    for (int i = 0; i < 5; i++) {
        assert(mq_manager.message_queue_send(mq_id, i + 10, "Fill " + std::to_string(i), 1000));
    }
    assert(mq_manager.message_queue_is_full(mq_id));
    
    // Queue clear test
    mq_manager.message_queue_clear(mq_id);
    assert(mq_manager.message_queue_is_empty(mq_id));
    assert(mq_manager.message_queue_get_count(mq_id) == 0);
    
    // Cleanup
    mq_manager.delete_message_queue(mq_id);
    mq_manager.delete_message_queue(999); // Test non-existent queue
    
    std::cout << "Message queue functionality test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "Message Queue Test" << std::endl;
    std::cout << "==================" << std::endl << std::endl;
    
    try {
        test_message_queue_functionality();
        std::cout << "Message queue test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}