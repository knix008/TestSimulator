# RTOS Priority Scheduler with Separated Synchronization Components and Independent Clock System

This project implements an RTOS priority scheduler with 128 priority levels, **completely separated** synchronization mechanisms, and an **independent** clock and timer system. Using bitmap optimization, it can find the highest priority task in O(1) time. Each component (Scheduler, Semaphore, Event, Signal, Message Queue, Timer, Clock) is now **completely independent** and can be used separately without any dependencies.

## Key Features

### Scheduler Core
- **128 Priority Levels**: Priority range 0-127 (0 is highest priority)
- **Bitmap Optimization**: Find highest priority task in O(1) time
- **Same Priority Handling**: Multiple tasks at same priority level
- **Efficient Memory Usage**: 16-byte bitmap manages 128 priority levels
- **FIFO Scheduling**: Tasks at same priority are scheduled in FIFO order

### Separated Synchronization Components
- **Independent Semaphore Manager**: Resource sharing and counting semaphore support
- **Independent Event Manager**: 32-bit event flag for task communication
- **Independent Signal Manager**: Simple notification mechanism
- **Independent Message Queue Manager**: FIFO queue for task message communication
- **Independent Timer Manager**: One-shot and periodic timer support with callback functions
- **Timeout Support**: All wait functions support timeout
- **Thread Safety**: Uses `std::mutex` and `std::condition_variable`
- **Complete Separation**: Each component can be used independently without any dependencies

### Independent Clock and Timer System
- **One-shot Timers**: Execute once and automatically stop
- **Periodic Timers**: Execute repeatedly at specified intervals
- **Callback Support**: User-defined callback functions for timer expiry
- **Timer Control**: Start, stop, restart, reset operations
- **Multiple Timers**: Support for multiple concurrent timers
- **Dual Timing Modes**: Both realtime and tick-based timing support
- **Clock Interface**: Pluggable clock system architecture
- **Dual Execution Modes**: Both thread-based and task-based execution
- **Thread Safety**: All timer operations are thread-safe
- **Complete Independence**: Timer system works without scheduler or other components

## Project Structure

```
include/
戍式式 scheduler.h         # Independent scheduler class (task management only)
戍式式 semaphore.h         # Independent Semaphore + SemaphoreManager
戍式式 event.h             # Independent Event + EventManager
戍式式 signal.h            # Independent Signal + SignalManager
戍式式 message_queue.h     # Independent MessageQueue + MessageQueueManager
戍式式 timer.h             # Independent Timer + TimerManager
戍式式 clock.h             # Clock interface and implementations
戍式式 timer_task.h        # Task-based Timer + TaskBasedTimerManager
戌式式 task.h              # Task structure
source/
戍式式 scheduler.cpp       # Independent scheduler implementation (task management only)
戍式式 semaphore.cpp       # Independent semaphore implementation
戍式式 event.cpp           # Independent event implementation
戍式式 signal.cpp          # Independent signal implementation
戍式式 message_queue.cpp   # Independent message queue implementation
戍式式 timer.cpp           # Independent timer implementation
戍式式 clock.cpp            # Clock implementations
戌式式 timer_task.cpp      # Task-based timer implementation
test/
戍式式 test_basic.cpp      # Basic functionality tests (standalone executable)
戍式式 test_semaphore.cpp  # Semaphore tests (standalone executable)
戍式式 test_event.cpp      # Event tests (standalone executable)
戍式式 test_signal.cpp     # Signal tests (standalone executable)
戍式式 test_message_queue.cpp # Message queue tests (standalone executable)
戍式式 test_timer.cpp      # Timer tests (standalone executable)
戍式式 test_clock.cpp      # Clock system tests (standalone executable)
戍式式 test_timer_task.cpp # Task-based timer tests (standalone executable)
戌式式 test_sync_management.cpp # Synchronization management tests (standalone executable)
main.cpp                # Main example demonstrating all components including timers
```

## Build Instructions

### Prerequisites
- C++11 or later compiler
- CMake 3.10 or later

### Build Steps
```bash
mkdir build
cd build
cmake ..
cmake --build .
```

### Run Tests and Examples
```bash
# Run main example (demonstrates all components including timers)
./Debug/main.exe

# Run individual tests
./Debug/test_basic.exe
./Debug/test_semaphore.exe
./Debug/test_event.exe
./Debug/test_signal.exe
./Debug/test_message_queue.exe
./Debug/test_timer.exe
./Debug/test_clock.exe
./Debug/test_timer_task.exe
./Debug/test_sync_management.exe
```

## Usage Examples

### 1. Independent Scheduler Usage (Task Management Only)

```cpp
#include "scheduler.h"

using namespace RTOS;

// Create scheduler (no synchronization objects)
PriorityScheduler scheduler;

// Create tasks (priority 0 is highest)
uint32_t task1 = scheduler.create_task(0);   // High priority
uint32_t task2 = scheduler.create_task(5);   // Medium priority
uint32_t task3 = scheduler.create_task(10);  // Low priority

// Get next task to execute
auto next_task = scheduler.get_next_task();
if (next_task) {
    // Execute task
    std::cout << "Executing task " << next_task->get_id() 
              << " with priority " << (int)next_task->get_priority() << std::endl;
}

// Check scheduler status
std::cout << "Total tasks: " << scheduler.get_total_task_count() << std::endl;
std::cout << "Highest priority: " << (int)scheduler.get_highest_ready_priority() << std::endl;
```

### 2. Independent Semaphore Manager Usage

```cpp
#include "semaphore.h"

using namespace RTOS;

// Create independent semaphore manager
SemaphoreManager sem_manager;

// Create semaphore with initial count
uint32_t sem_id = sem_manager.create_semaphore(2);

// Wait for semaphore (with timeout)
if (sem_manager.semaphore_wait(sem_id, 1000)) {
    // Critical section
    std::cout << "Entered critical section" << std::endl;
    
    // Do work...
    
    // Release semaphore
    sem_manager.semaphore_post(sem_id);
    std::cout << "Left critical section" << std::endl;
}

// Check semaphore count
int count = sem_manager.semaphore_get_count(sem_id);
std::cout << "Semaphore count: " << count << std::endl;

// Print all semaphores
sem_manager.print_semaphores();
```

### 3. Independent Event Manager Usage

```cpp
#include "event.h"

using namespace RTOS;

// Create independent event manager
EventManager event_manager;

// Create event
uint32_t event_id = event_manager.create_event();

// Set event bits
event_manager.event_set(event_id, 0x01 | 0x02); // Set bits 0 and 1

// Wait for specific event bits
if (event_manager.event_wait(event_id, 0x01, true, 1000)) {
    std::cout << "Event received" << std::endl;
}

// Clear event bits
event_manager.event_clear(event_id, 0x02);

// Get current event bits
uint32_t bits = event_manager.event_get_bits(event_id);

// Print all events
event_manager.print_events();
```

### 4. Independent Signal Manager Usage

```cpp
#include "signal.h"

using namespace RTOS;

// Create independent signal manager
SignalManager signal_manager;

// Create signal
uint32_t signal_id = signal_manager.create_signal();

// Wait for signal
if (signal_manager.signal_wait(signal_id, 1000)) {
    std::cout << "Signal received" << std::endl;
}

// Send signal
signal_manager.signal_send(signal_id);

// Check signal state
bool is_set = signal_manager.signal_is_set(signal_id);

// Reset signal
signal_manager.signal_reset(signal_id);

// Print all signals
signal_manager.print_signals();
```

### 5. Independent Message Queue Manager Usage

```cpp
#include "message_queue.h"

using namespace RTOS;

// Create independent message queue manager
MessageQueueManager mq_manager;

// Create message queue
uint32_t mq_id = mq_manager.create_message_queue(10); // Max 10 messages

// Send message
mq_manager.message_queue_send(mq_id, 1, "Hello World", 1000);

// Receive message
uint32_t type;
std::string data;
if (mq_manager.message_queue_receive(mq_id, type, data, 1000)) {
    std::cout << "Received message type " << type << ": " << data << std::endl;
}

// Send custom message object
Message msg(0, 100, "Custom Message", 12345);
mq_manager.message_queue_send(mq_id, msg, 1000);

// Receive custom message object
Message received_msg;
if (mq_manager.message_queue_receive(mq_id, received_msg, 1000)) {
    std::cout << "Received custom message: " << received_msg.data << std::endl;
}

// Print all message queues
mq_manager.print_message_queues();
```

### 6. Independent Timer Manager Usage

```cpp
#include "timer.h"

using namespace RTOS;

// Timer callback function
void my_timer_callback(uint32_t timer_id, void* user_data) {
    std::cout << "Timer " << timer_id << " expired!" << std::endl;
    if (user_data) {
        int* count = static_cast<int*>(user_data);
        (*count)++;
        std::cout << "Callback count: " << *count << std::endl;
    }
}

int main() {
    // Create independent timer manager
    TimerManager timer_manager;
    timer_manager.start_manager();
    
    int callback_count = 0;
    
    // Create one-shot timer (500ms delay)
    uint32_t one_shot_timer = timer_manager.create_timer(
        "One-shot Timer", 
        TimerType::ONE_SHOT, 
        std::chrono::milliseconds(500), 
        my_timer_callback, 
        &callback_count
    );
    
    // Create periodic timer (200ms interval)
    uint32_t periodic_timer = timer_manager.create_timer(
        "Periodic Timer", 
        TimerType::PERIODIC, 
        std::chrono::milliseconds(200), 
        my_timer_callback, 
        &callback_count
    );
    
    // Start timers
    timer_manager.start_timer(one_shot_timer);
    timer_manager.start_timer(periodic_timer);
    
    // Wait for timers to execute
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    
    // Stop periodic timer
    timer_manager.stop_timer(periodic_timer);
    
    // Print timer status
    timer_manager.print_timer_status();
    
    // Cleanup
    timer_manager.delete_timer(one_shot_timer);
    timer_manager.delete_timer(periodic_timer);
    timer_manager.stop_manager();
    
    return 0;
}
```

### 6a. Timer with Tick-based Clock

```cpp
#include "timer.h"
#include "clock.h"

using namespace RTOS;

void tick_timer_callback(uint32_t timer_id, void* user_data) {
    std::cout << "Tick-based timer " << timer_id << " expired!" << std::endl;
}

int main() {
    // Create timer manager with tick-based timing
    TimerManager timer_manager;
    
    // Set tick-based clock (10ms per tick)
    auto tick_clock = std::make_unique<TickBasedClock>(
        std::chrono::milliseconds(10)
    );
    timer_manager.set_clock(std::move(tick_clock));
    
    std::cout << "Timing type: " << (timer_manager.is_tick_based() ? "Tick-based" : "Realtime") << std::endl;
    std::cout << "Tick interval: " << timer_manager.get_tick_interval().count() << "ms" << std::endl;
    
    timer_manager.start_manager();
    
    // Create timer with tick-based clock (50ms = 5 ticks)
    uint32_t tick_timer = timer_manager.create_timer(
        "Tick Timer", 
        TimerType::ONE_SHOT, 
        std::chrono::milliseconds(50), 
        tick_timer_callback
    );
    
    timer_manager.start_timer(tick_timer);
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    
    // Print tick count
    std::cout << "Total ticks: " << timer_manager.get_tick_count() << std::endl;
    
    timer_manager.delete_timer(tick_timer);
    timer_manager.stop_manager();
    
    return 0;
}
```

### 6b. Task-based Timer with Clock Integration

```cpp
#include "timer_task.h"
#include "scheduler.h"

using namespace RTOS;

void task_timer_callback(uint32_t timer_id, void* user_data) {
    std::cout << "Task-based timer " << timer_id << " expired!" << std::endl;
}

int main() {
    // Create scheduler and task-based timer manager
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager task_timer_manager(scheduler, 0); // High priority timer task
    
    // Create timer
    uint32_t timer_id = task_timer_manager.create_timer(
        "Task Timer", 
        TimerType::ONE_SHOT, 
        std::chrono::milliseconds(500), 
        task_timer_callback
    );
    
    // Start timer manager (adds timer task to scheduler)
    task_timer_manager.start_manager();
    task_timer_manager.start_timer(timer_id);
    
    // Run scheduler to execute timer task
    std::cout << "Running scheduler with timer task..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 1000) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            std::cout << "Executing task " << task->get_id() << " with priority " 
                      << (int)task->get_priority() << std::endl;
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // Cleanup
    task_timer_manager.delete_timer(timer_id);
    task_timer_manager.stop_manager();
    
    return 0;
}
```

### 7. Independent Components Working Together

```cpp
#include "scheduler.h"
#include "timer.h"

using namespace RTOS;

// Timer callback for independent timer
void independent_timer_callback(uint32_t timer_id, void* user_data) {
    std::cout << "Independent timer " << timer_id << " expired!" << std::endl;
}

int main() {
    // Create independent scheduler and timer manager
    PriorityScheduler scheduler;
    TimerManager timer_manager;
    
    // Start timer manager
    timer_manager.start_manager();
    
    // Create tasks
    uint32_t task1 = scheduler.create_task(0);   // High priority
    uint32_t task2 = scheduler.create_task(5);   // Medium priority
    
    // Create timer through independent timer manager
    uint32_t timer_id = timer_manager.create_timer(
        "Independent Timer", 
        TimerType::PERIODIC, 
        std::chrono::milliseconds(1000), 
        independent_timer_callback
    );
    
    // Start timer
    timer_manager.start_timer(timer_id);
    
    // Timer runs in background while scheduler manages tasks independently
    std::this_thread::sleep_for(std::chrono::milliseconds(3000));
    
    // Print timer status
    timer_manager.print_timer_status();
    
    // Cleanup
    timer_manager.delete_timer(timer_id);
    timer_manager.stop_manager();
    
    return 0;
}
```

### 8. Complete Separation Example

```cpp
#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include "timer.h"

using namespace RTOS;

int main() {
    // Each component is completely independent
    PriorityScheduler scheduler;
    SemaphoreManager sem_manager;
    EventManager event_manager;
    SignalManager signal_manager;
    MessageQueueManager mq_manager;
    TimerManager timer_manager;
    
    // Use each component independently
    uint32_t task1 = scheduler.create_task(0);
    uint32_t sem1 = sem_manager.create_semaphore(1);
    uint32_t event1 = event_manager.create_event();
    uint32_t signal1 = signal_manager.create_signal();
    uint32_t mq1 = mq_manager.create_message_queue(5);
    uint32_t timer1 = timer_manager.create_timer("Test Timer", TimerType::ONE_SHOT, 
                                                std::chrono::milliseconds(1000), 
                                                [](uint32_t id, void* data) {
                                                    std::cout << "Timer " << id << " expired!" << std::endl;
                                                });
    
    // All components work independently without any dependencies
    std::cout << "All components are completely separated!" << std::endl;
    
    return 0;
}
```

## Priority Bitmap Implementation

The scheduler uses a 16-byte bitmap to efficiently track which priority levels have ready tasks:

```
Priority: 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
Bitmap:   [1] [0] [1] [0] [0] [1] [0] [0] [0] [0] [0] [0] [0] [0] [0] [0]
          ^       ^           ^
          |       |           |
          |       |           Priority 5 has tasks
          |       Priority 2 has tasks  
          Priority 0 has tasks (highest)
```

Each byte manages 8 priority levels (16 bytes ▼ 8 = 128 priority levels)

### How it works:
1. **Priority Search**: Find first set bit in bitmap to get highest priority
2. **Task Queue Management**: Each priority level has its own FIFO queue
3. **Bitmap Update**: Set/clear bits when tasks are added/removed

## Performance Characteristics

- **Priority Search**: O(1) - constant time using bitmap
- **Task Addition**: O(1) - direct queue access
- **Task Removal**: O(k) - k is number of tasks at that priority
- **Memory Usage**: 16-byte bitmap + task queues

## Design Decisions

1. **Complete Separation**: Each synchronization component is completely independent
2. **Independent Managers**: Each component has its own manager class
3. **No Scheduler Dependency**: Synchronization objects don't require scheduler
4. **Modular Design**: Components can be used separately or together
5. **Bitmap Optimization**: Efficient priority search in scheduler
6. **Error Handling**: Invalid priority checks, timeout handling

## Testing

The project includes comprehensive test coverage with standalone test executables:

### Test Structure
- **test_basic.cpp**: Tests scheduler core functionality (priority ordering, bitmap optimization, task management)
- **test_semaphore.cpp**: Tests semaphore creation, wait/post operations, and cleanup
- **test_event.cpp**: Tests event creation, bit operations, and waiting mechanisms
- **test_signal.cpp**: Tests signal creation, notification, and waiting
- **test_message_queue.cpp**: Tests message queue operations (send/receive, overflow handling)
- **test_timer.cpp**: Tests timer creation, one-shot/periodic functionality, callback execution, and timer control
- **test_clock.cpp**: Tests clock interface, realtime vs tick-based timing, and clock switching
- **test_timer_task.cpp**: Tests task-based timer functionality, scheduler integration, and mixed task execution
- **test_sync_management.cpp**: Tests synchronization object lifecycle management

### Running Tests
```bash
# Build all tests
cmake --build .

# Run individual tests
./Debug/test_basic.exe
./Debug/test_semaphore.exe
./Debug/test_event.exe
./Debug/test_signal.exe
./Debug/test_message_queue.exe
./Debug/test_timer.exe
./Debug/test_clock.exe
./Debug/test_timer_task.exe
./Debug/test_sync_management.exe
```

### Test Features
- **Standalone Executables**: Each test is a complete, independent executable
- **Comprehensive Coverage**: Tests all major functionality and edge cases
- **Error Handling**: Tests invalid operations and cleanup scenarios
- **Performance Testing**: Includes performance benchmarks for scheduler operations
- **Memory Management**: Tests proper cleanup and resource management

## Thread Safety

All synchronization mechanisms are thread-safe using:
- `std::mutex` for mutual exclusion
- `std::condition_variable` for waiting/notification
- `std::atomic` for simple state variables

## Use Cases

### Independent Component Usage
- **Semaphore Manager**: Resource sharing in any application
- **Event Manager**: Event-driven programming patterns
- **Signal Manager**: Simple notification systems
- **Message Queue Manager**: Inter-process communication
- **Timer Manager**: Precise timing and periodic task execution with dual timing modes
- **Task-based Timer Manager**: Timer execution integrated with scheduler task system
- **Scheduler**: Pure task management without dependencies

### Combined Usage
- **IoT Devices**: Real-time sensor data processing with independent sync objects and periodic timers
- **Embedded Systems**: Microcontroller task scheduling with modular sync and precise timing
- **Game Engines**: Game object update priority with independent communication and frame timing
- **Real-time Systems**: Critical task priority with separated sync mechanisms and deadline timers
- **Robotics**: Sensor fusion and control loop priority with modular design and timing control
- **Audio/Video Processing**: Stream processing priority with independent queues and frame synchronization
- **Network Applications**: Connection management with timeout timers and message queuing
- **Industrial Control**: Process control with periodic monitoring timers and event handling

## Future Enhancements

- **Round Robin Scheduling**: Time slice scheduling for same priority tasks
- **Preemptive Scheduling**: Higher priority task can preempt lower priority task
- **Priority Inheritance**: Prevent priority inversion in synchronization
- **Advanced Timer Features**: Timer chaining, relative timers, and timer groups
- **Timer Precision**: Sub-millisecond timer precision and hardware timer integration
- **Custom Clock Providers**: User-defined clock providers for specialized timing requirements
- **Task-based Timer Optimization**: Enhanced task-based timer performance and scheduling integration
- **Optional Component Integration**: Optional integration between independent components
- **Cross-Component Communication**: Enhanced communication between separated components
- **Timer Callback Optimization**: Asynchronous callback execution and callback prioritization
- **Test Framework**: Integration with testing frameworks like Google Test or Catch2
- **Continuous Integration**: Automated testing and build verification

## Limitations

- **Fixed Priority**: No dynamic priority adjustment
- **No Preemption**: Tasks run to completion
- **Single Core**: No multi-core support
- **Memory**: No memory protection between tasks
- **Component Independence**: No automatic integration between independent components
- **Timer Precision**: Limited to millisecond precision (platform dependent)
- **Timer Thread**: Single timer thread for all timers (potential bottleneck for many timers)

## Contributing

- **Compatibility**: Ensure compatibility with other RTOS implementations
- **Testing**: Add comprehensive test coverage with standalone test executables
- **Documentation**: Update documentation for new features
- **Performance**: Optimize for specific use cases
- **Test Structure**: Maintain the current standalone test executable structure

## License

This project is open source. Please check the license file for details.