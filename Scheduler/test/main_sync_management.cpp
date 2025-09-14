#include <iostream>
#include <exception>

// 테스트 함수 선언
void test_sync_object_management();

int main() {
    std::cout << "Synchronization Management Test" << std::endl;
    std::cout << "===============================" << std::endl << std::endl;
    
    try {
        test_sync_object_management();
        std::cout << "Synchronization management test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}
