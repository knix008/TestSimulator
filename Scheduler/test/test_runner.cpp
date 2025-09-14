#include <iostream>
#include <exception>

// 테스트 함수들 선언
void test_basic_functionality();
void test_priority_ordering();
void test_bitmap_optimization();
void test_task_removal();
void test_edge_cases();
void performance_test();

void test_semaphore_functionality();
void test_event_functionality();
void test_signal_functionality();
void test_message_queue_functionality();
void test_sync_object_management();

int main() {
    std::cout << "RTOS Priority Scheduler Test Suite" << std::endl;
    std::cout << "===================================" << std::endl << std::endl;
    
    try {
        // 기본 기능 테스트
        test_basic_functionality();
        test_priority_ordering();
        test_bitmap_optimization();
        test_task_removal();
        test_edge_cases();
        performance_test();
        
        // 동기화 메커니즘 테스트
        test_semaphore_functionality();
        test_event_functionality();
        test_signal_functionality();
        test_message_queue_functionality();
        test_sync_object_management();
        
        std::cout << "All tests passed successfully!" << std::endl;
        std::cout << "The RTOS scheduler with synchronization mechanisms is working correctly." << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}
