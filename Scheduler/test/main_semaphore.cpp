#include <iostream>
#include <exception>

// 테스트 함수 선언
void test_semaphore_functionality();

int main() {
    std::cout << "Semaphore Test" << std::endl;
    std::cout << "==============" << std::endl << std::endl;
    
    try {
        test_semaphore_functionality();
        std::cout << "Semaphore test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}
