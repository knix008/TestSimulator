#pragma once
#ifndef RTOS_H
#define RTOS_H

#include "task.hpp"

void rtos_init(void);
void rtos_start(void);
void rtos_tick(void);
void rtos_add_task(Task* task);

#endif // RTOS_H
