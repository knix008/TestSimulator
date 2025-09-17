# ARM64 컨텍스트 스위칭 코드 조건부 컴파일 옵션 추가
if(CMAKE_SYSTEM_PROCESSOR STREQUAL "aarch64")
    add_definitions(-DUSE_ARM64_CONTEXT)
endif()
cmake_minimum_required(VERSION 3.10)
project(RTOSScheduler)

# C++ standard
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler options
if(MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4")
else()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O2")
endif()

# Include directories
include_directories(include)

# Header files
set(HEADERS
    include/task.h
    include/scheduler.h
    include/semaphore.h
    include/event.h
    include/signal.h
    include/message_queue.h
    include/timer.h
    include/clock.h
    include/timer_task.h
)

# Source files
set(SOURCES
    source/task.cpp
    source/scheduler.cpp
    source/semaphore.cpp
    source/event.cpp
    source/signal.cpp
    source/message_queue.cpp
    source/timer.cpp
    source/clock.cpp
    source/timer_task.cpp
    source/arm64_context.cpp
)

# ARM64(aarch64) 환경에서만 어셈블리 파일 추가
if(CMAKE_SYSTEM_PROCESSOR STREQUAL "aarch64")
    set(SOURCES ${SOURCES} source/arm64_context.S)
endif()

# Create library
add_library(scheduler ${SOURCES} ${HEADERS})

# Main executable
add_executable(main main.cpp)
target_link_libraries(main scheduler)

# Individual test executables
add_executable(test_basic test/test_basic.cpp)
target_link_libraries(test_basic scheduler)

add_executable(test_semaphore test/test_semaphore.cpp)
target_link_libraries(test_semaphore scheduler)

add_executable(test_event test/test_event.cpp)
target_link_libraries(test_event scheduler)

add_executable(test_signal test/test_signal.cpp)
target_link_libraries(test_signal scheduler)

add_executable(test_message_queue test/test_message_queue.cpp)
target_link_libraries(test_message_queue scheduler)

add_executable(test_sync_management test/test_sync_management.cpp)
target_link_libraries(test_sync_management scheduler)

add_executable(test_timer test/test_timer.cpp)
target_link_libraries(test_timer scheduler)

add_executable(test_clock test/test_clock.cpp)
target_link_libraries(test_clock scheduler)

add_executable(test_timer_task test/test_timer_task.cpp)
target_link_libraries(test_timer_task scheduler)

# Enable testing
enable_testing()
add_test(NAME test_basic COMMAND test_basic)
add_test(NAME test_semaphore COMMAND test_semaphore)
add_test(NAME test_event COMMAND test_event)
add_test(NAME test_signal COMMAND test_signal)
add_test(NAME test_message_queue COMMAND test_message_queue)
add_test(NAME test_sync_management COMMAND test_sync_management)
add_test(NAME test_timer COMMAND test_timer)
add_test(NAME test_clock COMMAND test_clock)
add_test(NAME test_timer_task COMMAND test_timer_task)