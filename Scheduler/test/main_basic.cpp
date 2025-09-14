#include <iostream>
#include <exception>

// 테스트 함수 선언
void test_basic_functionality();
void test_priority_ordering();
void test_bitmap_optimization();
void test_task_removal();
void test_edge_cases();
void performance_test();

int main() {
    std::cout << "Basic Functionality Test" << std::endl;
    std::cout << "========================" << std::endl << std::endl;
    
    try {
        test_basic_functionality();
        test_priority_ordering();
        test_bitmap_optimization();
        test_task_removal();
        test_edge_cases();
        performance_test();
        std::cout << "Basic functionality tests completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}
