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
    include/scheduler.h
    include/semaphore.h
    include/event.h
    include/signal.h
    include/message_queue.h
)

# Source files
set(SOURCES
    source/scheduler.cpp
    source/semaphore.cpp
    source/event.cpp
    source/signal.cpp
    source/message_queue.cpp
)

# Create library
add_library(scheduler ${SOURCES} ${HEADERS})

# Main executable
add_executable(main main.cpp)
target_link_libraries(main scheduler)

# Test executables
set(TEST_SOURCES
    test/test_runner.cpp
    test/test_basic.cpp
    test/test_semaphore.cpp
    test/test_event.cpp
    test/test_signal.cpp
    test/test_message_queue.cpp
    test/test_sync_management.cpp
)

# All test executable
add_executable(test_scheduler ${TEST_SOURCES})
target_link_libraries(test_scheduler scheduler)

# Individual test executables
add_executable(test_basic test/main_basic.cpp test/test_basic.cpp)
target_link_libraries(test_basic scheduler)

add_executable(test_semaphore test/main_semaphore.cpp test/test_semaphore.cpp)
target_link_libraries(test_semaphore scheduler)

add_executable(test_event test/main_event.cpp test/test_event.cpp)
target_link_libraries(test_event scheduler)

add_executable(test_signal test/main_signal.cpp test/test_signal.cpp)
target_link_libraries(test_signal scheduler)

add_executable(test_message_queue test/main_message_queue.cpp test/test_message_queue.cpp)
target_link_libraries(test_message_queue scheduler)

add_executable(test_sync_management test/main_sync_management.cpp test/test_sync_management.cpp)
target_link_libraries(test_sync_management scheduler)

# Enable testing
enable_testing()
add_test(NAME run_test COMMAND test_scheduler)
add_test(NAME test_basic COMMAND test_basic)
add_test(NAME test_semaphore COMMAND test_semaphore)
add_test(NAME test_event COMMAND test_event)
add_test(NAME test_signal COMMAND test_signal)
add_test(NAME test_message_queue COMMAND test_message_queue)
add_test(NAME test_sync_management COMMAND test_sync_management)