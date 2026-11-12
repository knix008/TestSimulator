/*
 * The logic of the motor controller: it connects the Model (motor.c) to the ViewModel Motor
 * (src/glue/vm_motor.h). It never touches a widget: the screens can be redesigned freely.
 *
 *   The user turns the ring    -> Motor.target changes (two-way binding)
 *   The user flips the switch  -> Motor.running changes -> on_running() sets Motor.status
 *   Every 50 ms                -> the Model runs, and Motor.speed and Motor.load follow it
 */
#include "app.h"
#include "glue.h"
#include "motor.h"

#define TICK_MS 50

static motor_t motor;

static void show_status(void)
{
    if(!vm_motor_get_running()) vm_motor_set_status(motor.speed > 0 ? "Stopping" : "Stopped");
    else if(motor.speed == vm_motor_get_target()) vm_motor_set_status("At speed");
    else vm_motor_set_status(motor.speed < vm_motor_get_target() ? "Speeding up" : "Slowing down");
}

static void on_running(mv_prop_t * prop, void * user)
{
    (void)prop;
    (void)user;
    show_status();
}

static void tick(void * user)
{
    (void)user;
    bool running = vm_motor_get_running();
    int32_t target = vm_motor_get_target();
    motor_step(&motor, running, target, TICK_MS);
    vm_motor_set_speed(motor.speed);
    vm_motor_set_load(motor_load(&motor, running, target));
    show_status();
}

void app_init(void)
{
    motor_init(&motor, 3000, 1500);
    mv_observe(vm_motor_prop_running(), on_running, NULL);
    mv_timer_start(TICK_MS, tick, NULL);
}
