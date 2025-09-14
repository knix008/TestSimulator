#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_message_queue_functionality() {
    std::cout << "=== Message Queue Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 메시지 큐 생성
    uint32_t mq_id = scheduler.create_message_queue(5); // 최대 5개 메시지
    assert(mq_id != 0);
    
    // 초기 상태 확인
    assert(scheduler.message_queue_is_empty(mq_id));
    assert(!scheduler.message_queue_is_full(mq_id));
    assert(scheduler.message_queue_get_count(mq_id) == 0);
    assert(scheduler.message_queue_get_max_size(mq_id) == 5);
    
    std::cout << "Created message queue with max size: " << scheduler.message_queue_get_max_size(mq_id) << std::endl;
    
    // 테스트용 태스크 생성
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // 메시지 전송 테스트
    assert(scheduler.message_queue_send(mq_id, 1, "Hello", 1000));
    assert(scheduler.message_queue_send(mq_id, 2, "World", 1000));
    assert(scheduler.message_queue_send(mq_id, 3, "Test", 1000));
    
    assert(scheduler.message_queue_get_count(mq_id) == 3);
    assert(!scheduler.message_queue_is_empty(mq_id));
    assert(!scheduler.message_queue_is_full(mq_id));
    
    std::cout << "Sent 3 messages. Count: " << scheduler.message_queue_get_count(mq_id) << std::endl;
    
    // 메시지 수신 테스트
    uint32_t type;
    std::string data;
    
    assert(scheduler.message_queue_receive(mq_id, type, data, 1000));
    assert(type == 1);
    assert(data == "Hello");
    assert(scheduler.message_queue_get_count(mq_id) == 2);
    
    assert(scheduler.message_queue_receive(mq_id, type, data, 1000));
    assert(type == 2);
    assert(data == "World");
    assert(scheduler.message_queue_get_count(mq_id) == 1);
    
    assert(scheduler.message_queue_receive(mq_id, type, data, 1000));
    assert(type == 3);
    assert(data == "Test");
    assert(scheduler.message_queue_get_count(mq_id) == 0);
    
    std::cout << "Received all 3 messages. Count: " << scheduler.message_queue_get_count(mq_id) << std::endl;
    
    // Message 객체를 사용한 전송/수신 테스트
    Message msg(0, 4, "Message Object", 12345);
    assert(scheduler.message_queue_send(mq_id, msg, 1000));
    
    Message received_msg;
    assert(scheduler.message_queue_receive(mq_id, received_msg, 1000));
    assert(received_msg.type == 4);
    assert(received_msg.data == "Message Object");
    assert(received_msg.timestamp == 12345);
    assert(received_msg.id != 0); // ID가 자동으로 생성되었는지 확인
    
    std::cout << "Message object test passed" << std::endl;
    
    // 큐가 가득 찰 때까지 메시지 전송 (현재 0개 있음)
    assert(scheduler.message_queue_send(mq_id, 5, "Msg5", 1000));
    assert(scheduler.message_queue_send(mq_id, 6, "Msg6", 1000));
    assert(scheduler.message_queue_send(mq_id, 7, "Msg7", 1000));
    assert(scheduler.message_queue_send(mq_id, 8, "Msg8", 1000));
    assert(scheduler.message_queue_send(mq_id, 9, "Msg9", 1000));
    assert(scheduler.message_queue_is_full(mq_id));
    assert(scheduler.message_queue_get_count(mq_id) == 5);
    
    // 큐가 가득 찬 상태에서 전송 시도 (타임아웃)
    assert(!scheduler.message_queue_send(mq_id, 10, "Msg10", 100)); // 100ms 타임아웃
    
    std::cout << "Queue full test passed" << std::endl;
    
    // 큐 클리어 테스트
    scheduler.message_queue_clear(mq_id);
    assert(scheduler.message_queue_is_empty(mq_id));
    assert(scheduler.message_queue_get_count(mq_id) == 0);
    
    std::cout << "Queue clear test passed" << std::endl;
    
    // 빈 큐에서 수신 시도 (타임아웃)
    assert(!scheduler.message_queue_receive(mq_id, type, data, 100)); // 100ms 타임아웃
    
    // 메시지 큐 삭제
    assert(scheduler.delete_message_queue(mq_id));
    assert(!scheduler.delete_message_queue(mq_id)); // 이미 삭제된 큐
    
    std::cout << "Message queue functionality test passed!" << std::endl << std::endl;
}

