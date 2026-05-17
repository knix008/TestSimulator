# 간단한 테스트 추가
add_executable(test_basic test_basic.cpp)
target_link_libraries(test_basic PRIVATE)
add_test(NAME BasicTest COMMAND test_basic)
