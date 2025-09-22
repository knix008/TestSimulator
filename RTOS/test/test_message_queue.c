#include "../include/message_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>

// Test function declarations
void test_message_queue_basic_operations(void);
void test_message_queue_fifo_behavior(void);
void test_message_queue_manager_operations(void);
void test_message_queue_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("         Message Queue Component Tests            \n");
    printf("====================================================\n");
    
    test_message_queue_basic_operations();
    test_message_queue_fifo_behavior();
    test_message_queue_manager_operations();
    test_message_queue_edge_cases();
    
    printf("\n====================================================\n");
    printf("        All Message Queue Tests PASSED!          \n");
    printf("====================================================\n");
    
    return 0;
}

void test_message_queue_basic_operations(void) {
    printf("\n--- Testing Basic Message Queue Operations ---\n");
    
    MessageQueue queue;
    message_queue_init(&queue, 5, 1001); // Capacity: 5, ID: 1001
    
    // Test initial state
    assert(message_queue_get_count(&queue) == 0);
    assert(message_queue_get_capacity(&queue) == 5);
    assert(message_queue_is_empty(&queue));
    assert(!message_queue_is_full(&queue));
    assert(queue.id == 1001);
    printf("✓ Initial state correct (count: 0, capacity: 5)\n");
    
    // Test creating and sending messages
    Message msg1 = message_create(1, 101, "Hello", 2001);
    Message msg2 = message_create(2, 102, "World", 2002);
    
    assert(message_queue_send_message(&queue, &msg1, 0));
    assert(message_queue_get_count(&queue) == 1);
    assert(!message_queue_is_empty(&queue));
    assert(!message_queue_is_full(&queue));
    printf("✓ Message 1 sent successfully (count: 1)\n");
    
    assert(message_queue_send_message(&queue, &msg2, 0));
    assert(message_queue_get_count(&queue) == 2);
    printf("✓ Message 2 sent successfully (count: 2)\n");
    (void)msg1; // Suppress unused variable warning
    (void)msg2; // Suppress unused variable warning
    
    // Test receiving messages
    Message received_msg;
    assert(message_queue_receive_message(&queue, &received_msg, 0));
    assert(received_msg.id == 1);
    assert(received_msg.type == 101);
    assert(strcmp(received_msg.data, "Hello") == 0);
    assert(received_msg.sender_id == 2001);
    assert(message_queue_get_count(&queue) == 1);
    printf("✓ Message 1 received successfully\n");
    
    assert(message_queue_receive_message(&queue, &received_msg, 0));
    assert(received_msg.id == 2);
    assert(received_msg.type == 102);
    assert(strcmp(received_msg.data, "World") == 0);
    assert(received_msg.sender_id == 2002);
    assert(message_queue_get_count(&queue) == 0);
    assert(message_queue_is_empty(&queue));
    printf("✓ Message 2 received successfully\n");
    (void)received_msg; // Suppress unused variable warning
    
    printf("Basic operations test PASSED\n");
}

void test_message_queue_fifo_behavior(void) {
    printf("\n--- Testing Message Queue FIFO Behavior ---\n");
    
    MessageQueue queue;
    message_queue_init(&queue, 10, 2001);
    
    // Send multiple messages
    Message messages[5];
    for (int i = 0; i < 5; i++) {
        char data[32];
        sprintf(data, "Message%d", i + 1);
        messages[i] = message_create(i + 1, 100 + i, data, 3000 + i);
        assert(message_queue_send_message(&queue, &messages[i], 0));
    }
    
    assert(message_queue_get_count(&queue) == 5);
    printf("✓ 5 messages sent successfully\n");
    
    // Receive messages and verify FIFO order
    Message received_msg;
    for (int i = 0; i < 5; i++) {
        assert(message_queue_receive_message(&queue, &received_msg, 0));
        assert(received_msg.id == (uint32_t)(i + 1));
        assert(received_msg.type == (uint32_t)(100 + i));
        assert(received_msg.sender_id == (uint32_t)(3000 + i));
        
        char expected_data[32];
        sprintf(expected_data, "Message%d", i + 1);
        assert(strcmp(received_msg.data, expected_data) == 0);
        printf("✓ Message %d received in correct order\n", i + 1);
    }
    (void)received_msg; // Suppress unused variable warning
    
    assert(message_queue_is_empty(&queue));
    printf("✓ All messages received in FIFO order\n");
    
    printf("FIFO behavior test PASSED\n");
}

void test_message_queue_manager_operations(void) {
    printf("\n--- Testing Message Queue Manager Operations ---\n");
    
    MessageQueueManager manager;
    message_queue_manager_init(&manager);
    
    // Test initial state
    assert(message_queue_manager_get_queue_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating queues
    uint32_t queue1_id = message_queue_manager_create_queue(&manager, 3); // Small capacity
    uint32_t queue2_id = message_queue_manager_create_queue(&manager, 10); // Larger capacity
    
    assert(queue1_id != 0);
    assert(queue2_id != 0);
    assert(queue1_id != queue2_id);
    assert(message_queue_manager_get_queue_count(&manager) == 2);
    printf("✓ Two queues created successfully\n");
    
    // Test getting queues
    MessageQueue* queue1 = message_queue_manager_get_queue(&manager, queue1_id);
    MessageQueue* queue2 = message_queue_manager_get_queue(&manager, queue2_id);
    
    assert(queue1 != NULL);
    assert(queue2 != NULL);
    assert(message_queue_get_capacity(queue1) == 3);
    assert(message_queue_get_capacity(queue2) == 10);
    printf("✓ Queues retrieved correctly\n");
    
    // Test manager operations
    Message msg = message_create(1, 101, "Test", 4001);
    assert(message_queue_manager_send_message(&manager, queue1_id, &msg, 0));
    assert(message_queue_get_count(queue1) == 1);
    printf("✓ Manager send operation works\n");
    
    Message received_msg;
    assert(message_queue_manager_receive_message(&manager, queue1_id, &received_msg, 0));
    assert(message_queue_get_count(queue1) == 0);
    assert(received_msg.type == 101);
    printf("✓ Manager receive operation works\n");
    (void)queue1; // Suppress unused variable warning
    (void)queue2; // Suppress unused variable warning
    (void)msg; // Suppress unused variable warning
    (void)received_msg; // Suppress unused variable warning
    
    // Test operations on non-existent queue
    assert(!message_queue_manager_send_message(&manager, 999, &msg, 0));
    assert(!message_queue_manager_receive_message(&manager, 999, &received_msg, 0));
    printf("✓ Non-existent queue operations handled correctly\n");
    
    // Test deleting queues
    assert(message_queue_manager_delete_queue(&manager, queue1_id));
    assert(message_queue_manager_get_queue(&manager, queue1_id) == NULL);
    assert(message_queue_manager_get_queue_count(&manager) == 1);
    printf("✓ Queue deletion works\n");
    
    // Test deleting non-existent queue
    assert(!message_queue_manager_delete_queue(&manager, 999));
    assert(message_queue_manager_get_queue_count(&manager) == 1);
    printf("✓ Non-existent queue deletion handling correct\n");
    
    message_queue_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_message_queue_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    MessageQueue queue;
    message_queue_init(&queue, 2, 3001); // Small capacity for testing
    
    // Test NULL parameters
    Message msg = message_create(1, 101, "Test", 5001);
    Message received_msg;
    
    assert(!message_queue_send_message(NULL, &msg, 0));
    assert(!message_queue_send_message(&queue, NULL, 0));
    assert(!message_queue_receive_message(NULL, &received_msg, 0));
    assert(!message_queue_receive_message(&queue, NULL, 0));
    printf("✓ NULL parameter handling correct\n");
    
    // Test sending to full queue
    Message msg1 = message_create(1, 101, "Msg1", 5001);
    Message msg2 = message_create(2, 102, "Msg2", 5002);
    Message msg3 = message_create(3, 103, "Msg3", 5003);
    (void)msg; // Suppress unused variable warning
    (void)received_msg; // Suppress unused variable warning
    
    assert(message_queue_send_message(&queue, &msg1, 0));
    assert(message_queue_send_message(&queue, &msg2, 0));
    assert(!message_queue_send_message(&queue, &msg3, 0)); // Should fail - queue full
    assert(message_queue_get_count(&queue) == 2);
    assert(message_queue_is_full(&queue));
    printf("✓ Send to full queue correctly failed\n");
    (void)msg1; // Suppress unused variable warning
    (void)msg2; // Suppress unused variable warning
    (void)msg3; // Suppress unused variable warning
    
    // Test receiving from empty queue
    Message temp_msg;
    assert(message_queue_receive_message(&queue, &temp_msg, 0));
    assert(message_queue_receive_message(&queue, &temp_msg, 0));
    assert(!message_queue_receive_message(&queue, &temp_msg, 0)); // Should fail - queue empty
    (void)temp_msg; // Suppress unused variable warning
    assert(message_queue_get_count(&queue) == 0);
    assert(message_queue_is_empty(&queue));
    printf("✓ Receive from empty queue correctly failed\n");
    
    // Test large message data
    char large_data[MAX_MESSAGE_DATA_SIZE];
    memset(large_data, 'A', MAX_MESSAGE_DATA_SIZE - 1);
    large_data[MAX_MESSAGE_DATA_SIZE - 1] = '\0';
    
    Message large_msg = message_create(4, 104, large_data, 5004);
    assert(message_queue_send_message(&queue, &large_msg, 0));
    assert(message_queue_receive_message(&queue, &received_msg, 0));
    assert(strcmp(received_msg.data, large_data) == 0);
    printf("✓ Large message data handling correct\n");
    (void)large_msg; // Suppress unused variable warning
    
    // Test message with empty data
    Message empty_msg = message_create(5, 105, "", 5005);
    assert(message_queue_send_message(&queue, &empty_msg, 0));
    assert(message_queue_receive_message(&queue, &received_msg, 0));
    assert(strcmp(received_msg.data, "") == 0);
    (void)empty_msg; // Suppress unused variable warning
    printf("✓ Empty message data handling correct\n");
    
    // Test manager edge cases
    MessageQueueManager manager;
    message_queue_manager_init(&manager);
    
    assert(!message_queue_manager_send_message(NULL, 1, &msg, 0));
    assert(!message_queue_manager_receive_message(NULL, 1, &received_msg, 0));
    assert(!message_queue_manager_send_message(&manager, 999, &msg, 0));
    assert(!message_queue_manager_receive_message(&manager, 999, &received_msg, 0));
    printf("✓ Manager edge case handling correct\n");
    
    // Test creating maximum number of queues
    uint32_t queue_ids[MAX_MESSAGE_QUEUES];
    for (int i = 0; i < MAX_MESSAGE_QUEUES; i++) {
        queue_ids[i] = message_queue_manager_create_queue(&manager, 5);
        assert(queue_ids[i] != 0);
    }
    assert(message_queue_manager_get_queue_count(&manager) == MAX_MESSAGE_QUEUES);
    printf("✓ Maximum number of queues created successfully\n");
    
    // Test creating queue when manager is full
    uint32_t overflow_queue = message_queue_manager_create_queue(&manager, 5);
    assert(overflow_queue == 0); // Should fail
    (void)overflow_queue; // Suppress unused variable warning
    assert(message_queue_manager_get_queue_count(&manager) == MAX_MESSAGE_QUEUES);
    printf("✓ Queue creation when manager full correctly failed\n");
    
    message_queue_manager_destroy(&manager);
    printf("Edge cases test PASSED\n");
}
