/*
 * Tests the Model and the ViewModel without LVGL or a display. Not part of the program
 * (CMake builds only the files directly in src/app). Build and run it with:
 *
 *   gcc -Isrc/app -Isrc/glue -Ilib/mvvm src/app/tests/test_motor.c src/app/motor.c \
 *       src/glue/glue.c src/glue/vm_motor.c lib/mvvm/mvvm.c -o test_motor && ./test_motor
 */
#include <stdio.h>
#include <string.h>
#include "glue.h"
#include "motor.h"

static int failed;
#define CHECK(what) do { if(!(what)) { printf("FAIL line %d: %s\n", __LINE__, #what); failed++; } } while(0)

static int heard;
static void count(mv_prop_t * prop, void * user) { (void)prop; (void)user; heard++; }

int main(void)
{
    motor_t motor;
    motor_init(&motor, 3000, 1000);
    motor_step(&motor, true, 2000, 500);
    CHECK(motor.speed == 500);
    motor_step(&motor, true, 2000, 5000);
    CHECK(motor.speed == 2000);
    CHECK(motor_load(&motor, true, 2000) == 40);
    motor_step(&motor, false, 2000, 100000);
    CHECK(motor.speed == 0);
    CHECK(motor_load(&motor, false, 2000) == 0);

    glue_init();
    CHECK(vm_motor_get_target() == 1200);
    CHECK(strcmp(vm_motor_get_status(), "Stopped") == 0);
    mv_observe(vm_motor_prop_speed(), count, NULL);
    vm_motor_set_speed(100);
    vm_motor_set_speed(100);
    CHECK(heard == 1);
    vm_motor_set_speed(99999);
    CHECK(vm_motor_get_speed() == 3000);

    printf(failed ? "%d failed\n" : "all passed\n", failed);
    return failed ? 1 : 0;
}
