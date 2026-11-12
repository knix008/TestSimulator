#include "motor.h"

void motor_init(motor_t * motor, int32_t max_speed, int32_t ramp)
{
    motor->speed = 0;
    motor->max_speed = max_speed;
    motor->ramp = ramp;
}

void motor_step(motor_t * motor, bool running, int32_t target, uint32_t ms)
{
    int32_t goal = running ? target : 0;
    if(goal < 0) goal = 0;
    if(goal > motor->max_speed) goal = motor->max_speed;
    int32_t step = (int32_t)((int64_t)motor->ramp * ms / 1000);
    if(step < 1) step = 1;
    if(motor->speed < goal) motor->speed = motor->speed + step > goal ? goal : motor->speed + step;
    else if(motor->speed > goal) motor->speed = motor->speed - step < goal ? goal : motor->speed - step;
}

int32_t motor_load(const motor_t * motor, bool running, int32_t target)
{
    if(!running || motor->max_speed <= 0) return 0;
    int32_t base = (int32_t)((int64_t)motor->speed * 60 / motor->max_speed);
    int32_t pulling = motor->speed < target ? 35 : 0;
    int32_t load = base + pulling;
    return load > 100 ? 100 : load;
}
