# RTOS Priority Scheduler with Separated Synchronization Components

A comprehensive Real-Time Operating System (RTOS) priority scheduler implementation with completely separated synchronization mechanisms including semaphores, events, signals, and message queues.

## ? Features

### Core Scheduler
- **Priority-based Task Scheduling**: 128 priority levels (0-127, 0 being highest)
- **O(1) Task Selection**: Using priority bitmap for efficient task scheduling
- **Task Management**: Create, delete, and manage tasks with different priorities
- **Real-time Simulation**: Complete task execution simulation with timing

### Separated Synchronization Components
- **Semaphore Manager**: Independent semaphore creation and management
- **Event Manager**: Event-based task communication with bit manipulation
- **Signal Manager**: Simple notification mechanism between tasks
- **Message Queue Manager**: Inter-task message passing with configurable queue sizes

### Key Benefits
- **Complete Separation**: Each synchronization component is fully independent
- **No Scheduler Dependency**: Synchronization objects can be used without the scheduler
- **Modular Design**: Easy to integrate individual components into other projects
- **Thread-Safe**: All operations are thread-safe using modern C++ synchronization primitives

## ? Project Structure

```
Scheduler/
戍式式 include/                    # Header files
弛   戍式式 scheduler.h            # Priority scheduler (task management only)
弛   戍式式 task.h                 # Task definition and management
弛   戍式式 semaphore.h            # Independent Semaphore + SemaphoreManager
弛   戍式式 event.h                # Independent Event + EventManager
弛   戍式式 signal.h               # Independent Signal + SignalManager
弛   戌式式 message_queue.h        # Independent MessageQueue + MessageQueueManager
戍式式 source/                    # Implementation files
弛   戍式式 scheduler.cpp
弛   戍式式 task.cpp
弛   戍式式 semaphore.cpp
弛   戍式式 event.cpp
弛   戍式式 signal.cpp
弛   戌式式 message_queue.cpp
戍式式 test/                      # Test files
弛   戍式式 test_*.cpp            # Individual component tests
弛   戌式式 main_*.cpp            # Test main functions
戍式式 main.cpp                   # Complete example with all components
戍式式 CMakeLists.txt            # Build configuration
戌式式 README.md                 # This file
```

## ?? Build Instructions

### Prerequisites
- CMake 3.10 or higher
- C++14 compatible compiler (GCC, Clang, or MSVC)
- Windows, Linux, or macOS

### Building the Project

```bash
# Clone or navigate to the project directory
cd Scheduler

# Create build directory
mkdir build
cd build

# Configure with CMake
cmake ..

# Build the project
cmake --build .

# On Windows with Visual Studio
cmake --build . --config Debug
```

### Build Targets
- `main`: Complete example demonstrating all components
- `test_scheduler`: All tests combined
- `test_basic`: Basic scheduler functionality tests
- `test_semaphore`: Semaphore functionality tests
- `test_event`: Event functionality tests
- `test_signal`: Signal functionality tests
- `test_message_queue`: Message queue functionality tests
- `test_sync_management`: Synchronization object management tests

## ? Usage Examples

### Independent Component Usage

Each component can be used completely independently:

```cpp
#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"

using namespace RTOS;

int main() {
    // 1. Scheduler (independent)
    PriorityScheduler scheduler;
    uint32_t task_id = scheduler.create_task(5); // Priority 5
    
    // 2. Semaphore Manager (independent)
    SemaphoreManager sem_manager;
    uint32_t sem_id = sem_manager.create_semaphore(2); // Initial count: 2
    sem_manager.semaphore_post(sem_id);
    
    // 3. Event Manager (independent)
    EventManager event_manager;
    uint32_t event_id = event_manager.create_event();
    event_manager.event_set(event_id, 0x0F); // Set bits 0-3
    
    // 4. Signal Manager (independent)
    SignalManager signal_manager;
    uint32_t signal_id = signal_manager.create_signal();
    signal_manager.signal_send(signal_id);
    
    // 5. Message Queue Manager (independent)
    MessageQueueManager mq_manager;
    uint32_t mq_id = mq_manager.create_message_queue(10);
    mq_manager.message_queue_send(mq_id, 1, "Hello World");
    
    return 0;
}
```

### Combined Usage

Components can also be used together for complex RTOS applications:

```cpp
// Create scheduler and synchronization managers
PriorityScheduler scheduler;
SemaphoreManager sem_manager;
EventManager event_manager;

// Create tasks
uint32_t task1 = scheduler.create_task(1);
uint32_t task2 = scheduler.create_task(2);

// Create synchronization objects
uint32_t resource_sem = sem_manager.create_semaphore(1);
uint32_t comm_event = event_manager.create_event();

// Task 1: Acquire resource and signal completion
scheduler.set_current_task(scheduler.get_next_task());
sem_manager.semaphore_wait(resource_sem, 1000);
// ... do work ...
sem_manager.semaphore_post(resource_sem);
event_manager.event_set(comm_event, 0x01);

// Task 2: Wait for completion signal
scheduler.set_current_task(scheduler.get_next_task());
event_manager.event_wait(comm_event, 0x01, true, 1000);
// ... process completion ...
```

## ? Testing

Run individual component tests:

```bash
# Run all tests
./Debug/test_scheduler.exe

# Run specific component tests
./Debug/test_semaphore.exe
./Debug/test_event.exe
./Debug/test_signal.exe
./Debug/test_message_queue.exe
./Debug/test_sync_management.exe

# Run complete example
./Debug/main.exe
```

## ? API Reference

### PriorityScheduler
- `create_task(priority, data)`: Create a new task
- `get_next_task()`: Get highest priority ready task
- `set_current_task(task)`: Set currently executing task
- `get_total_task_count()`: Get total number of tasks
- `get_highest_ready_priority()`: Get highest priority with ready tasks

### SemaphoreManager
- `create_semaphore(initial_count)`: Create semaphore
- `delete_semaphore(sem_id)`: Delete semaphore
- `semaphore_wait(sem_id, timeout_ms)`: Wait for semaphore
- `semaphore_post(sem_id)`: Release semaphore
- `semaphore_get_count(sem_id)`: Get current count

### EventManager
- `create_event()`: Create event object
- `delete_event(event_id)`: Delete event
- `event_set(event_id, bits)`: Set event bits
- `event_clear(event_id, bits)`: Clear event bits
- `event_wait(event_id, mask, clear_on_exit, timeout_ms)`: Wait for event
- `event_get_bits(event_id)`: Get current event bits

### SignalManager
- `create_signal()`: Create signal
- `delete_signal(signal_id)`: Delete signal
- `signal_send(signal_id)`: Send signal
- `signal_reset(signal_id)`: Reset signal
- `signal_wait(signal_id, timeout_ms)`: Wait for signal
- `signal_is_set(signal_id)`: Check if signal is set

### MessageQueueManager
- `create_message_queue(max_size)`: Create message queue
- `delete_message_queue(mq_id)`: Delete message queue
- `message_queue_send(mq_id, type, data, timeout_ms)`: Send message
- `message_queue_receive(mq_id, type, data, timeout_ms)`: Receive message
- `message_queue_get_count(mq_id)`: Get message count
- `message_queue_is_empty(mq_id)`: Check if queue is empty
- `message_queue_is_full(mq_id)`: Check if queue is full

## ? Design Decisions

### Complete Separation
- Each synchronization component is completely independent
- No circular dependencies between components
- Easy to use individual components in other projects

### Independent Managers
- Each manager handles its own object lifecycle
- Internal ID management for object tracking
- Thread-safe operations using modern C++ primitives

### No Scheduler Dependency
- Synchronization objects can be used without the scheduler
- Flexible integration with different scheduling algorithms
- Reduced coupling between components

## ? Use Cases

### Independent Component Usage
- **Embedded Systems**: Use only the components you need
- **Microservices**: Integrate individual managers into different services
- **Prototyping**: Quick testing of specific synchronization mechanisms
- **Educational**: Learn individual RTOS concepts in isolation

### Combined Usage
- **Full RTOS Implementation**: Complete real-time system with all components
- **Complex Applications**: Multi-task systems with inter-task communication
- **Simulation**: Test complete RTOS behavior before hardware implementation
- **Performance Testing**: Benchmark different scheduling and synchronization strategies

## ? Future Enhancements

### Component Integration
- **Cross-Component Communication**: Enhanced integration between managers
- **Unified API**: Common interface for all synchronization objects
- **Configuration Management**: Centralized configuration for all components

### Advanced Features
- **Priority Inheritance**: Prevent priority inversion in semaphores
- **Deadlock Detection**: Automatic detection and resolution of deadlocks
- **Performance Monitoring**: Built-in performance metrics and profiling
- **Memory Management**: Custom memory allocators for embedded systems

### Platform Support
- **Hardware Abstraction**: Platform-specific implementations
- **Real Hardware**: Support for actual embedded hardware platforms
- **RTOS Integration**: Integration with existing RTOS systems

## ?? Limitations

### Component Isolation
- **No Cross-Component Dependencies**: Components cannot directly interact
- **Separate Lifecycle Management**: Each component manages its own objects
- **Independent Configuration**: No shared configuration between components

### Current Scope
- **Simulation Only**: Currently designed for simulation and testing
- **Single Process**: All components run within a single process
- **No Hardware Integration**: No direct hardware abstraction layer

## ? License

This project is part of the TestSimulator suite for firmware testing and simulation.

## ? Contributing

This is a simulation and testing framework. Contributions for enhanced functionality, additional synchronization primitives, or improved performance are welcome.

---

**Note**: This implementation is designed for educational purposes and firmware simulation. For production embedded systems, consider additional safety and reliability features.
