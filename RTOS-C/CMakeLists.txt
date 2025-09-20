cmake_minimum_required(VERSION 3.10)
project(RTOSScheduler C)

# C standard
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Compiler options
if(MSVC)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} /W4 /D_CRT_SECURE_NO_WARNINGS /wd4819 /wd4005")
else()
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra -O2 -pthread")
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
    include/mutex.h
)

# Source files (all components enabled)
set(SOURCES
    source/platform.c
    source/task.c
    source/scheduler.c
    source/semaphore.c
    source/event.c
    source/signal.c
    source/message_queue.c
    source/timer.c
    source/clock.c
    source/timer_task.c
    source/mutex.c
)

# Create library
add_library(scheduler ${SOURCES} ${HEADERS})

# Main executable
add_executable(main main.c)
target_link_libraries(main scheduler)

# Full demo executable
add_executable(main_full_demo main_full_demo.c)
target_link_libraries(main_full_demo scheduler)

# Test executables
add_executable(minimal_test test/minimal_test.c)
target_link_libraries(minimal_test scheduler)

add_executable(test_scheduler_c test/test_scheduler_c.c)
target_link_libraries(test_scheduler_c scheduler)

add_executable(test_task_management test/test_task_management.c)
target_link_libraries(test_task_management scheduler)

add_executable(test_platform_abstraction test/test_platform_abstraction.c)
target_link_libraries(test_platform_abstraction scheduler)

add_executable(test_priority_bitmap test/test_priority_bitmap.c)
target_link_libraries(test_priority_bitmap scheduler)

add_executable(test_integration test/test_integration.c)
target_link_libraries(test_integration scheduler)

add_executable(run_working_tests test/run_working_tests.c)
target_link_libraries(run_working_tests scheduler)

# Component-specific tests
add_executable(test_semaphore_c test/test_semaphore_c.c)
target_link_libraries(test_semaphore_c scheduler)

add_executable(test_event_c test/test_event_c.c)
target_link_libraries(test_event_c scheduler)

add_executable(test_signal_c test/test_signal_c.c)
target_link_libraries(test_signal_c scheduler)

# Additional component tests
add_executable(test_message_queue_c test/test_message_queue_c.c)
target_link_libraries(test_message_queue_c scheduler)

# Comprehensive timer and clock component tests
add_executable(test_timer_comprehensive test/test_timer_comprehensive.c)
target_link_libraries(test_timer_comprehensive scheduler)

add_executable(test_clock_comprehensive test/test_clock_comprehensive.c)
target_link_libraries(test_clock_comprehensive scheduler)

add_executable(test_timer_task_comprehensive test/test_timer_task_comprehensive.c)
target_link_libraries(test_timer_task_comprehensive scheduler)

# Mutex component test
add_executable(test_mutex_comprehensive test/test_mutex_comprehensive.c)
target_link_libraries(test_mutex_comprehensive scheduler)

enable_testing()
add_test(NAME minimal_test COMMAND minimal_test)
add_test(NAME test_task_management COMMAND test_task_management)
add_test(NAME test_scheduler_c COMMAND test_scheduler_c)
add_test(NAME test_priority_bitmap COMMAND test_priority_bitmap)
add_test(NAME test_platform_abstraction COMMAND test_platform_abstraction)
add_test(NAME test_integration COMMAND test_integration)
add_test(NAME test_semaphore_c COMMAND test_semaphore_c)
add_test(NAME test_event_c COMMAND test_event_c)
add_test(NAME test_signal_c COMMAND test_signal_c)
add_test(NAME test_message_queue_c COMMAND test_message_queue_c)
add_test(NAME test_timer_comprehensive COMMAND test_timer_comprehensive)
add_test(NAME test_clock_comprehensive COMMAND test_clock_comprehensive)
add_test(NAME test_timer_task_comprehensive COMMAND test_timer_task_comprehensive)
add_test(NAME test_mutex_comprehensive COMMAND test_mutex_comprehensive)