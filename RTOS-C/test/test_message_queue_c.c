#include "message_queue.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Test result tracking
typedef struct {
    int total;
    int passed;
    int failed;
} TestResults;

void print_test_result(TestResults* results, const char* test_name, bool passed) {
    results->total++;
    if (passed) {
        results->passed++;
        printf("✅PASS: %s\n", test_name);
    } else {
        results->failed++;
        printf("❌FAIL: %s\n", test_name);
    }
}

void test_message_queue_basic_operations(TestResults* results) {
    printf("\n=== Message Queue Basic Operations Tests ===\n");
    
    // Test 1: Message queue creation
    MessageQueue* mq = message_queue_create(5);
    bool test1 = (mq != NULL);
    print_test_result(results, "Message queue creation", test1);
    
    if (!mq) return;
    
    // Test 2: Initial state
    bool test2 = (message_queue_get_count(mq) == 0 && message_queue_get_max_size(mq) == 5);
    print_test_result(results, "Initial queue state", test2);
    
    // Test 3: Send message
    Message msg1 = message_create(1, 100, "Hello World", 12345);
    bool test3 = message_queue_send_message(mq, &msg1, 1000);
    print_test_result(results, "Send message", test3);
    
    // Test 4: Queue size after send
    bool test4 = (message_queue_get_count(mq) == 1);
    print_test_result(results, "Queue size after send", test4);
    
    // Test 5: Receive message
    Message received_msg;
    bool test5 = message_queue_receive_message(mq, &received_msg, 1000);
    print_test_result(results, "Receive message", test5);
    
    // Test 6: Message content verification
    bool test6 = (received_msg.id == 1 && 
                  received_msg.type == 100 && 
                  strcmp(received_msg.data, "Hello World") == 0 &&
                  received_msg.sender_id == 12345);
    print_test_result(results, "Message content verification", test6);
    
    // Test 7: Queue empty after receive
    bool test7 = (message_queue_get_count(mq) == 0);
    print_test_result(results, "Queue empty after receive", test7);
    
    // Test 8: Receive timeout on empty queue
    Message timeout_msg;
    bool test8 = !message_queue_receive_message(mq, &timeout_msg, 50);
    print_test_result(results, "Receive timeout on empty queue", test8);
    
    // Cleanup messages (only cleanup received message, not the original)
    message_destroy(&received_msg);
    
    message_queue_destroy(mq);
}

void test_message_queue_manager_operations(TestResults* results) {
    printf("\n=== Message Queue Manager Operations Tests ===\n");
    
    // Test 1: Manager creation
    MessageQueueManager* manager = message_queue_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Message queue manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial count
    bool test2 = (message_queue_manager_get_queue_count(manager) == 0);
    print_test_result(results, "Initial message queue count is 0", test2);
    
    // Test 3: Create message queue through manager
    uint32_t mq_id = message_queue_manager_create_queue(manager, 3);
    bool test3 = (mq_id != 0);
    print_test_result(results, "Create message queue through manager", test3);
    
    // Test 4: Count updated
    bool test4 = (message_queue_manager_get_queue_count(manager) == 1);
    print_test_result(results, "Manager count updated after creation", test4);
    
    // Test 5: Send through manager
    Message msg = message_create(2, 200, "Manager Test", 54321);
    bool test5 = message_queue_manager_send_message(manager, mq_id, &msg, 1000);
    print_test_result(results, "Send through manager", test5);
    
    // Test 6: Receive through manager
    Message received_msg;
    bool test6 = message_queue_manager_receive_message(manager, mq_id, &received_msg, 1000);
    print_test_result(results, "Receive through manager", test6);
    
    // Test 7: Message content through manager
    bool test7 = (received_msg.id == 2 && 
                  received_msg.type == 200 && 
                  strcmp(received_msg.data, "Manager Test") == 0 &&
                  received_msg.sender_id == 54321);
    print_test_result(results, "Message content through manager", test7);
    
    // Test 8: Multiple message queues
    uint32_t mq_id2 = message_queue_manager_create_queue(manager, 2);
    uint32_t mq_id3 = message_queue_manager_create_queue(manager, 4);
    bool test8 = (mq_id2 != 0 && mq_id3 != 0 && 
                  message_queue_manager_get_queue_count(manager) == 3);
    print_test_result(results, "Multiple message queues creation", test8);
    
    // Test 9: Independent queue operations
    Message msg2 = message_create(3, 300, "Queue 2", 11111);
    Message msg3 = message_create(4, 400, "Queue 3", 22222);
    bool send2 = message_queue_manager_send_message(manager, mq_id2, &msg2, 1000);
    bool send3 = message_queue_manager_send_message(manager, mq_id3, &msg3, 1000);
    bool test9 = (send2 && send3);
    print_test_result(results, "Independent queue operations", test9);
    
    // Test 10: Delete message queue
    message_queue_manager_delete_queue(manager, mq_id);
    bool test10 = (message_queue_manager_get_queue_count(manager) == 2);
    print_test_result(results, "Delete message queue", test10);
    
    // Test 11: Count updated after deletion
    bool test11 = (message_queue_manager_get_queue_count(manager) == 2);
    print_test_result(results, "Count updated after deletion", test11);
    
    // Cleanup only received message (original messages are handled by queue)
    message_destroy(&received_msg);
    
    message_queue_manager_destroy(manager);
}

void test_message_queue_capacity_and_overflow(TestResults* results) {
    printf("\n=== Message Queue Capacity and Overflow Tests ===\n");
    
    MessageQueue* mq = message_queue_create(2); // Small capacity
    if (!mq) return;
    
    // Test 1: Fill queue to capacity
    Message msg1 = message_create(1, 100, "Message 1", 1000);
    Message msg2 = message_create(2, 200, "Message 2", 2000);
    bool send1 = message_queue_send_message(mq, &msg1, 1000);
    bool send2 = message_queue_send_message(mq, &msg2, 1000);
    bool test1 = (send1 && send2 && message_queue_get_count(mq) == 2);
    print_test_result(results, "Fill queue to capacity", test1);
    
    // Test 2: Queue full check
    bool test2 = message_queue_is_full(mq);
    print_test_result(results, "Queue full check", test2);
    
    // Test 3: Send to full queue (should timeout)
    Message msg3 = message_create(3, 300, "Message 3", 3000);
    bool test3 = !message_queue_send_message(mq, &msg3, 50);
    print_test_result(results, "Send to full queue timeout", test3);
    
    // Test 4: Receive to make space
    Message received;
    bool test4 = message_queue_receive_message(mq, &received, 1000);
    print_test_result(results, "Receive to make space", test4);
    
    // Test 5: Queue no longer full
    bool test5 = !message_queue_is_full(mq);
    print_test_result(results, "Queue no longer full", test5);
    
    // Test 6: Send after making space
    bool test6 = message_queue_send_message(mq, &msg3, 1000);
    print_test_result(results, "Send after making space", test6);
    
    // Cleanup only received message
    message_destroy(&received);
    
    message_queue_destroy(mq);
}

void test_message_queue_error_handling(TestResults* results) {
    printf("\n=== Message Queue Error Handling Tests ===\n");
    
    // Test 1: NULL message queue operations
    bool test1 = (!message_queue_send_message(NULL, NULL, 1000) &&
                  !message_queue_receive_message(NULL, NULL, 1000) &&
                  message_queue_get_count(NULL) == 0 &&
                  message_queue_get_max_size(NULL) == 0);
    print_test_result(results, "NULL message queue operations", test1);
    
    // Test 2: NULL manager operations
    bool test2 = (!message_queue_manager_send_message(NULL, 1, NULL, 1000) &&
                  !message_queue_manager_receive_message(NULL, 1, NULL, 1000) &&
                  message_queue_manager_get_queue_count(NULL) == 0);
    print_test_result(results, "NULL manager operations", test2);
    
    // Test 3: Invalid message queue ID
    MessageQueueManager* manager = message_queue_manager_create();
    if (manager) {
        Message msg = message_create(1, 100, "Test", 1000);
        bool test3 = (!message_queue_manager_send_message(manager, 999, &msg, 1000) &&
                      !message_queue_manager_receive_message(manager, 999, &msg, 1000));
        print_test_result(results, "Invalid message queue ID operations", test3);
        message_queue_manager_destroy(manager);
    }
    
    // Test 4: Safe destruction of NULL objects
    message_queue_destroy(NULL);
    message_queue_manager_destroy(NULL);
    bool test4 = true; // If we reach here, destruction was safe
    print_test_result(results, "Safe destruction of NULL objects", test4);
}

int main() {
    printf("=== RTOS C Implementation - Message Queue Test Suite ===\n");
    printf("Testing message queue functionality and inter-task communication...\n");
    
    TestResults results = {0, 0, 0};
    
    test_message_queue_basic_operations(&results);
    test_message_queue_manager_operations(&results);
    test_message_queue_capacity_and_overflow(&results);
    test_message_queue_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.total);
    printf("Passed: %d\n", results.passed);
    printf("Failed: %d\n", results.failed);
    printf("Success Rate: %.1f%%\n", results.total > 0 ? (results.passed * 100.0 / results.total) : 0.0);
    
    if (results.failed == 0) {
        printf("\n✅ ALL MESSAGE QUEUE TESTS PASSED! ✅\n");
        return 0;
    } else {
        printf("\n❌ Some message queue tests failed. Please check the implementation.\n");
        return 1;
    }
}
