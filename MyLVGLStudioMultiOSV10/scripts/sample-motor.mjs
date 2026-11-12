// The MVVM sample: a motor controller whose screens and logic are apart.
//   View       the design (screens, widgets, bindings)          generated, src/ui
//   ViewModel  Motor: target, speed, running, status, load        generated, src/glue
//   Model      motor.c: how a motor ramps, no LVGL, no ViewModel  src/app (the user's own)
//   logic      app.c: connects the Model to the ViewModel         src/app (the user's own)
// tests/test_motor.c tests the Model and the ViewModel without LVGL (test/run.mjs runs it).
import { addNode, createNode, newProject } from "../src/lvgl/project.js";
import { addViewModel, addVmProp, editVmProp, setBinding } from "../src/lvgl/viewmodel.js";

const add = (project, parent, type, props) => addNode(project, parent.id, createNode(project, type, props));
const named = (node, name) => {
  node.name = name;
  return node;
};

export function motorControl() {
  const project = newProject("MotorControl");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: true, primary: "#26c6da", secondary: "#ffa726" };
  const screen = project.screens[0];
  screen.name = "Motor";
  screen.props = { bgColor: "#12161c", bgOpa: 255 };

  const vm = addViewModel(project, "Motor");
  const prop = (name, type, patch) => {
    addVmProp(project, vm.name, type, name);
    editVmProp(project, vm.name, name, patch);
  };
  prop("target", "int", { min: 0, max: 3000, value: 1200 });
  prop("speed", "int", { min: 0, max: 3000, value: 0 });
  prop("running", "bool", { value: false });
  prop("status", "string", { value: "Stopped" });
  prop("load", "int", { min: 0, max: 100, value: 0 });
  screen.dataContext = vm.name;
  const bind = (node, key, path, extra = {}) => setBinding(project, node.id, key, { path, ...extra });

  add(project, screen, "label", { x: 16, y: 12, text: "Motor control - MVVM", font: 20, textColor: "#e0f7fa" });
  const dial = named(add(project, screen, "arc", { x: 16, y: 52, width: 200, height: 200, min: 0, max: 100, value: 40 }), "set_point");
  bind(dial, "value", "target", { converter: "range" });
  const target = named(add(project, screen, "label", { x: 66, y: 132, width: 100, text: "1200 rpm", font: 20, textColor: "#ffffff" }), "target_text");
  bind(target, "text", "target", { format: "%d rpm" });
  add(project, screen, "label", { x: 76, y: 262, text: "Drag the ring", textColor: "#80deea" });

  add(project, screen, "label", { x: 250, y: 60, text: "Run", textColor: "#b0bec5" });
  const power = named(add(project, screen, "switch", { x: 300, y: 56, width: 56, height: 28 }), "run_switch");
  bind(power, "checked", "running");
  const lamp = named(add(project, screen, "led", { x: 380, y: 60, width: 20, height: 20, ledBright: 255, hidden: true }), "run_lamp");
  bind(lamp, "hidden", "running", { converter: "invert" });
  const status = named(add(project, screen, "label", { x: 250, y: 98, text: "Stopped", font: 16, textColor: "#ffcc80" }), "status_text");
  bind(status, "text", "status");

  add(project, screen, "label", { x: 250, y: 140, text: "Speed", textColor: "#b0bec5" });
  const speed = named(add(project, screen, "label", { x: 330, y: 140, text: "0 rpm", textColor: "#ffffff" }), "speed_text");
  bind(speed, "text", "speed", { format: "%d rpm" });
  const speedBar = named(add(project, screen, "bar", { x: 250, y: 166, width: 200, height: 12, min: 0, max: 100, value: 0 }), "speed_bar");
  bind(speedBar, "value", "speed", { converter: "range" });

  add(project, screen, "label", { x: 250, y: 200, text: "Load", textColor: "#b0bec5" });
  const load = named(add(project, screen, "bar", { x: 250, y: 226, width: 200, height: 12, min: 0, max: 100, value: 0 }), "load_bar");
  bind(load, "value", "load");
  // Something moves by itself in every sample: the fan of the cooling unit.
  add(project, screen, "spinner", { x: 436, y: 10, width: 30, height: 30 });
  add(project, screen, "label", { x: 250, y: 266, text: "Logic: src/app (native run)", textColor: "#78909c" });
  return project;
}

/** The application code of the sample (src/app), instead of the starter files. */
export const MOTOR_APP = {
  "src/app/app.h": `/* The application: the logic of the motor controller. */
#ifndef APP_H
#define APP_H

#ifdef __cplusplus
extern "C" {
#endif

/* Called once, after ui_init(): the screens and the ViewModels are ready. */
void app_init(void);

#ifdef __cplusplus
}
#endif

#endif
`,
  "src/app/motor.h": `/* The Model: a motor that ramps towards its set point. It knows nothing of screens. */
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
/* Advances the motor by \`ms\`: towards \`target\` when running, towards a stop when not. */
void motor_step(motor_t * motor, bool running, int32_t target, uint32_t ms);
/* How hard it works, 0..100: more while it speeds up than while it holds its speed. */
int32_t motor_load(const motor_t * motor, bool running, int32_t target);

#endif
`,
  "src/app/motor.c": `#include "motor.h"

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
`,
  "src/app/app.c": `/*
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
`,
  "src/app/tests/test_motor.c": `/*
 * Tests the Model and the ViewModel without LVGL or a display. Not part of the program
 * (CMake builds only the files directly in src/app). Build and run it with:
 *
 *   gcc -Isrc/app -Isrc/glue -Ilib/mvvm src/app/tests/test_motor.c src/app/motor.c \\
 *       src/glue/glue.c src/glue/vm_motor.c lib/mvvm/mvvm.c -o test_motor && ./test_motor
 */
#include <stdio.h>
#include <string.h>
#include "glue.h"
#include "motor.h"

static int failed;
#define CHECK(what) do { if(!(what)) { printf("FAIL line %d: %s\\n", __LINE__, #what); failed++; } } while(0)

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

    printf(failed ? "%d failed\\n" : "all passed\\n", failed);
    return failed ? 1 : 0;
}
`,
};
