// KRTOS.cpp : 이 파일에는 'main' 함수가 포함됩니다. 거기서 프로그램 실행이 시작되고 종료됩니다.
//
#include "krtos.hpp"
#include <iostream>
#include <stdio.h>

void task1(void) {
    extern Task t1; // t1을 외부에서 선언
    printf("[우선순위1] Task 1 실행!\n");
    task_sleep(&t1, 1000);
}

void task2(void) {
    extern Task t2;
    printf("[우선순위2] Task 2 실행!\n");
    task_sleep(&t2, 500);
}

void task3(void) {
    extern Task t3;
    printf("[우선순위3] Task 3 실행!\n");
    task_sleep(&t3, 300);
}

Task t1 = { task1, 1, TASK_READY };
Task t2 = { task2, 2, TASK_READY };
Task t3 = { task3, 3, TASK_READY };

int main() {
    rtos_init();
    rtos_add_task(&t1);
    rtos_add_task(&t2);
    rtos_add_task(&t3);

    printf("RTOS 스케줄러 예제 시작!\n");
    rtos_start();
    return 0;
}
