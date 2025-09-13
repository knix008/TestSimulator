cmake_minimum_required(VERSION 3.10)
project(RTOSScheduler)

# C++ 표준 설정
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 컴파일러 옵션
if(MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4")
else()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O2")
endif()

# 헤더 파일
set(HEADERS
    scheduler.h
)

# 소스 파일
set(SOURCES
    scheduler.cpp
)

# 라이브러리 생성
add_library(scheduler ${SOURCES} ${HEADERS})

# 테스트 실행 파일
add_executable(test_scheduler test_scheduler.cpp)
target_link_libraries(test_scheduler scheduler)

# 예제 실행 파일
add_executable(example_scheduler example_scheduler.cpp)
target_link_libraries(example_scheduler scheduler)

# 테스트 실행
enable_testing()
add_test(NAME scheduler_tests COMMAND test_scheduler)
