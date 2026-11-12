/* The Model: a motor that ramps towards its set point. It knows nothing of screens. */
#ifndef MOTOR_H
#define MOTOR_H

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    int32_t speed;       /* rpm now */
    int32_t max_speed;   /* rpm */
    int32_t ramp;        /* rpm per second */
} motor_t;

void motor_init(motor_t * motor, int32_t max_speed, int32_t ramp);
/* Advances the motor by `ms`: towards `target` when running, towards a stop when not. */
void motor_step(motor_t * motor, bool running, int32_t target, uint32_t ms);
/* How hard it works, 0..100: more while it speeds up than while it holds its speed. */
int32_t motor_load(const motor_t * motor, bool running, int32_t target);

#endif
