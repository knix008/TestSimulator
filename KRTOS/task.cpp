#include "task.hpp"
#include <windows.h>

void task_sleep(Task* task, unsigned long milliseconds) {
    task->state = TASK_SLEEP;
    task->sleep_until = get_tick_count() + milliseconds;
}

unsigned long get_tick_count(void) {
    return GetTickCount();  // Windows API를 사용하여 시스템 시작 이후 경과된 밀리초 반환
}
