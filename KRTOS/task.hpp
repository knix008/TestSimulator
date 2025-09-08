#ifndef TASK_HPP
#define TASK_HPP

#define KRTOS_MAX_PRIORITY 128

typedef enum {
    TASK_READY,
    TASK_RUNNING,
    TASK_BLOCKED,
    TASK_SLEEP
} TaskState;

typedef struct Task {
    void (*task_func)(void);
    int priority;
    TaskState state;
    unsigned long sleep_until;  // sleep이 끝나는 시점
} Task;

void task_sleep(Task* task, unsigned long milliseconds);
unsigned long get_tick_count(void);

#endif // TASK_H