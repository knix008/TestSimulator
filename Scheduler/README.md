# RTOS Priority Scheduler with Separated Synchronization Components

This project implements an RTOS priority scheduler with 128 priority levels and **completely separated** synchronization mechanisms. Using bitmap optimization, it can find the highest priority task in O(1) time. Each synchronization component (Semaphore, Event, Signal, Message Queue) is now **completely independent** and can be used separately without requiring the scheduler.

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
- **Timeout Support**: All wait functions support timeout
- **Thread Safety**: Uses `std::mutex` and `std::condition_variable`
- **Complete Separation**: Each component can be used independently without scheduler dependency

## Project Structure

```
include/
戍式式 scheduler.h         # Main scheduler class (task management only)
戍式式 semaphore.h         # Independent Semaphore + SemaphoreManager
戍式式 event.h             # Independent Event + EventManager
戍式式 signal.h            # Independent Signal + SignalManager
戍式式 message_queue.h     # Independent MessageQueue + MessageQueueManager
戌式式 task.h              # Task structure
source/
戍式式 scheduler.cpp       # Main scheduler implementation (no sync objects)
戍式式 semaphore.cpp       # Independent semaphore implementation
戍式式 event.cpp           # Independent event implementation
戍式式 signal.cpp          # Independent signal implementation
戌式式 message_queue.cpp   # Independent message queue implementation
test/
戍式式 test_runner.cpp     # Test runner
戍式式 test_basic.cpp      # Basic functionality tests
戍式式 test_semaphore.cpp  # Semaphore tests
戍式式 test_event.cpp      # Event tests
戍式式 test_signal.cpp     # Signal tests
戍式式 test_message_queue.cpp # Message queue tests
戍式式 test_sync_management.cpp # Synchronization management tests
戍式式 main_basic.cpp      # Basic functionality test main
戍式式 main_semaphore.cpp  # Semaphore test main
戍式式 main_event.cpp      # Event test main
戍式式 main_signal.cpp     # Signal test main
戍式式 main_message_queue.cpp # Message queue test main
戌式式 main_sync_management.cpp # Synchronization management test main
examples/
戌式式 component_separation_example.cpp # Example showing separated component usage
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
make
```

### Run Tests and Examples
```bash
# Run all tests
./test_runner

# Run individual tests
./main_basic
./main_semaphore
./main_event
./main_signal
./main_message_queue
./main_sync_management

# Run separation example
./component_separation_example
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

### 6. Complete Separation Example

```cpp
#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"

using namespace RTOS;

int main() {
    // Each component is completely independent
    PriorityScheduler scheduler;
    SemaphoreManager sem_manager;
    EventManager event_manager;
    SignalManager signal_manager;
    MessageQueueManager mq_manager;
    
    // Use each component independently
    uint32_t task1 = scheduler.create_task(0);
    uint32_t sem1 = sem_manager.create_semaphore(1);
    uint32_t event1 = event_manager.create_event();
    uint32_t signal1 = signal_manager.create_signal();
    uint32_t mq1 = mq_manager.create_message_queue(5);
    
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
- **Scheduler**: Task management without synchronization

### Combined Usage
- **IoT Devices**: Real-time sensor data processing with independent sync objects
- **Embedded Systems**: Microcontroller task scheduling with modular sync
- **Game Engines**: Game object update priority with independent communication
- **Real-time Systems**: Critical task priority with separated sync mechanisms
- **Robotics**: Sensor fusion and control loop priority with modular design
- **Audio/Video Processing**: Stream processing priority with independent queues

## Future Enhancements

- **Round Robin Scheduling**: Time slice scheduling for same priority tasks
- **Preemptive Scheduling**: Higher priority task can preempt lower priority task
- **Priority Inheritance**: Prevent priority inversion in synchronization
- **Component Integration**: Optional integration between scheduler and sync components
- **Cross-Component Communication**: Enhanced communication between separated components

## Limitations

- **Fixed Priority**: No dynamic priority adjustment
- **No Preemption**: Tasks run to completion
- **Single Core**: No multi-core support
- **Memory**: No memory protection between tasks
- **Component Isolation**: No automatic integration between separated components

## Contributing

- **Compatibility**: Ensure compatibility with other RTOS implementations
- **Testing**: Add comprehensive test coverage
- **Documentation**: Update documentation for new features
- **Performance**: Optimize for specific use cases

## License

This project is open source. Please check the license file for details.