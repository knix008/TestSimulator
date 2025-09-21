cmake_minimum_required(VERSION 3.10)
project(RTOSScheduler C)

# C standard
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Compiler options
if(MSVC)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} /W4 /D_CRT_SECURE_NO_WARNINGS /wd4819 /wd4005")
else()
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall -Wextra -O2")
endif()

# Include directories
include_directories(include)

# Header files
set(HEADERS
    include/atomic_lock.h
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

# Source files (all synchronization components - no malloc)
set(SOURCES
    source/atomic_lock.c
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

# Component-specific test executables
add_executable(test_atomic_lock test/test_atomic_lock.c)
target_link_libraries(test_atomic_lock scheduler)

add_executable(test_scheduler test/test_scheduler.c)
target_link_libraries(test_scheduler scheduler)

add_executable(test_task test/test_task.c)
target_link_libraries(test_task scheduler)

add_executable(test_mutex test/test_mutex.c)
target_link_libraries(test_mutex scheduler)

add_executable(test_semaphore test/test_semaphore.c)
target_link_libraries(test_semaphore scheduler)

add_executable(test_event test/test_event.c)
target_link_libraries(test_event scheduler)

add_executable(test_signal test/test_signal.c)
target_link_libraries(test_signal scheduler)

add_executable(test_message_queue test/test_message_queue.c)
target_link_libraries(test_message_queue scheduler)

add_executable(test_clock test/test_clock.c)
target_link_libraries(test_clock scheduler)

add_executable(test_timer test/test_timer.c)
target_link_libraries(test_timer scheduler)

enable_testing()
# Component tests
add_test(NAME test_atomic_lock COMMAND test_atomic_lock)
add_test(NAME test_scheduler COMMAND test_scheduler)
add_test(NAME test_task COMMAND test_task)
add_test(NAME test_mutex COMMAND test_mutex)
add_test(NAME test_semaphore COMMAND test_semaphore)
add_test(NAME test_event COMMAND test_event)
add_test(NAME test_signal COMMAND test_signal)
add_test(NAME test_message_queue COMMAND test_message_queue)
add_test(NAME test_clock COMMAND test_clock)
add_test(NAME test_timer COMMAND test_timer)