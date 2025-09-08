#include "krtos.hpp"
#include <stddef.h>
#include <windows.h> // Sleep 함수 사용을 위한 헤더 추가

#define MAX_TASKS 8

static Task* task_list[MAX_TASKS];
static int task_count = 0;
static int current_priority = -1;
static int rr_index[KRTOS_MAX_PRIORITY] = { 0 };

void rtos_init(void) {
    task_count = 0;
    for (int i = 0; i < MAX_TASKS; i++) task_list[i] = NULL;
    for (int i = 0; i < KRTOS_MAX_PRIORITY; i++) rr_index[i] = 0;
}

void rtos_add_task(Task* task) {
    if (task_count < MAX_TASKS) {
        task_list[task_count++] = task;
    }
}

void rtos_start(void) {
    while (1) {
        rtos_tick();
    }
}

void rtos_tick(void) {
    // sleeping 태스크들의 상태를 체크하고 업데이트
    unsigned long current_time = get_tick_count();
    for (int i = 0; i < task_count; i++) {
        if (task_list[i]->state == TASK_SLEEP) {
            if (current_time >= task_list[i]->sleep_until) {
                task_list[i]->state = TASK_READY;
            }
        }
    }

    // 현재 실행 중인 우선순위보다 높은 우선순위의 태스크가 있는지 확인
    int highest_priority = -1;
    for (int i = 0; i < task_count; i++) {
        if (task_list[i]->state == TASK_READY && 
            (highest_priority == -1 || task_list[i]->priority < highest_priority)) {
            highest_priority = task_list[i]->priority;
        }
    }
    
    if (highest_priority == -1) {
        Sleep(1);  // CPU 사용률 감소를 위한 짧은 대기
        return;     // 실행 가능한 태스크가 없음
    }

    // 같은 우선순위의 태스크 수를 계산
    int cnt = 0;
    for (int i = 0; i < task_count; i++) {
        if (task_list[i]->priority == highest_priority && 
            task_list[i]->state == TASK_READY) {
            cnt++;
        }
    }

    if (cnt == 0) {
        Sleep(1);  // CPU 사용률 감소를 위한 짧은 대기
        return;
    }

    // Round-Robin 스케줄링 실행
    int idx = 0;
    for (int i = 0; i < task_count; i++) {
        if (task_list[i]->priority == highest_priority && 
            task_list[i]->state == TASK_READY) {
            if (idx == rr_index[highest_priority]) {
                task_list[i]->state = TASK_RUNNING;
                task_list[i]->task_func();
                // task가 sleep 상태로 전환되지 않았을 경우에만 READY로 변경
                if (task_list[i]->state == TASK_RUNNING) {
                    task_list[i]->state = TASK_READY;
                }
                rr_index[highest_priority] = (rr_index[highest_priority] + 1) % cnt;
                Sleep(1);  // 다른 태스크에게 실행 기회를 주기 위한 최소한의 대기
                break;
            }
            idx++;
        }
    }
}
