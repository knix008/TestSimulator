
#include "header/rtos.h"
#include <stdio.h>
#include <windows.h> // Sleep 함수 사용

void task1(void) {
    printf("[우선순위2] Task 1 실행!\n");
    Sleep(500);
}

void task2(void) {
    printf("[우선순위2] Task 2 실행!\n");
    Sleep(500);
}

void task3(void) {
    printf("[우선순위1] Task 3 실행!\n");
    Sleep(500);
}

int main() {
    Task t1 = {task1, 2, TASK_READY};
    Task t2 = {task2, 2, TASK_READY};
    Task t3 = {task3, 1, TASK_READY};

    rtos_init();
    rtos_add_task(&t1);
    rtos_add_task(&t2);
    rtos_add_task(&t3);

    printf("RTOS 스케줄러 예제 시작!\n");
    rtos_start();
    return 0;
}
