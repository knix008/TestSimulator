/* Tests the mvvm core (engine/mvvm/mvvm.c) on its own: no LVGL, as an application's logic tests
 * would use it. test/run.mjs builds it with gcc and runs it. Prints one line per failure. */
#include "mvvm.h"
#include <stdio.h>
#include <string.h>

static int failed;
#define CHECK(what) do { if(!(what)) { printf("FAIL %d: %s\n", __LINE__, #what); failed++; } } while(0)

static int calls[4];
static void count0(mv_prop_t * prop, void * user) { (void)prop; (void)user; calls[0]++; }
static void count1(mv_prop_t * prop, void * user) { (void)prop; (void)user; calls[1]++; }

static mv_observer_t * self_removing;
static void remove_self(mv_prop_t * prop, void * user) { (void)user; calls[2]++; mv_unobserve(prop, self_removing); }

static void feedback(mv_prop_t * prop, void * user) { (void)user; calls[3]++; mv_set_int(prop, mv_get_int(prop) + 1); }

static char order[8];
static void first(mv_prop_t * prop, void * user) { (void)prop; (void)user; strcat(order, "a"); }
static void second(mv_prop_t * prop, void * user) { (void)prop; (void)user; strcat(order, "b"); }

int main(void)
{
    mv_prop_t speed, on, name;
    char text[32];

    /* ranges and types */
    mv_prop_init_int(&speed, "speed", 500, 0, 100);
    CHECK(mv_get_int(&speed) == 100);
    CHECK(mv_set_int(&speed, -5) && mv_get_int(&speed) == 0);
    CHECK(!mv_set_int(&speed, -9));
    int32_t min, max;
    CHECK(mv_prop_range(&speed, &min, &max) && min == 0 && max == 100);
    CHECK(strcmp(mv_prop_name(&speed), "speed") == 0 && mv_prop_type(&speed) == MV_INT);
    mv_prop_init_bool(&on, "on", true);
    CHECK(mv_get_bool(&on) && mv_get_int(&on) == 1 && strcmp(mv_get_string(&on), "true") == 0);
    CHECK(!mv_set_int(&on, 7) && mv_get_int(&on) == 1);
    mv_set_bool(&on, false);
    CHECK(!mv_get_bool(&on));
    mv_prop_init_string(&name, "name", "42");
    CHECK(mv_get_int(&name) == 42 && mv_get_bool(&name));
    CHECK(mv_set_string(&name, "false") && !mv_get_bool(&name));
    CHECK(!mv_set_string(&name, "false"));
    CHECK(mv_set_int(&name, 9) && strcmp(mv_get_string(&name), "9") == 0);

    /* observers: only on a change, in order, and the one a binding skips */
    mv_observer_t * a = mv_observe(&speed, count0, NULL);
    mv_observer_t * b = mv_observe(&speed, count1, NULL);
    mv_set_int(&speed, 10);
    mv_set_int(&speed, 10);
    CHECK(calls[0] == 1 && calls[1] == 1);
    mv_set_int_from(&speed, 11, b);
    CHECK(calls[0] == 2 && calls[1] == 1);
    mv_notify(&speed);
    CHECK(calls[0] == 3 && calls[1] == 2);
    mv_unobserve(&speed, a);
    mv_set_int(&speed, 12);
    CHECK(calls[0] == 3 && calls[1] == 3);

    /* removed while it runs: runs once, never again, and nothing breaks */
    self_removing = mv_observe(&speed, remove_self, NULL);
    mv_set_int(&speed, 13);
    mv_set_int(&speed, 14);
    CHECK(calls[2] == 1 && calls[1] == 5);

    /* an observer that changes its own property stops at the depth limit */
    mv_prop_t loop;
    mv_prop_init_int(&loop, "loop", 0, 0, 0);
    mv_observe(&loop, feedback, NULL);
    mv_set_int(&loop, 1);
    CHECK(calls[3] == MV_MAX_DEPTH && mv_get_int(&loop) == MV_MAX_DEPTH + 1);
    mv_prop_deinit(&loop);

    mv_prop_t ordered;
    mv_prop_init_int(&ordered, "ordered", 0, 0, 0);
    mv_observe(&ordered, first, NULL);
    mv_observe(&ordered, second, NULL);
    mv_set_int(&ordered, 1);
    CHECK(strcmp(order, "ab") == 0);
    mv_prop_deinit(&ordered);

    /* formats never read more than the one value */
    mv_set_int(&speed, 55);
    mv_format(text, sizeof(text), "%d rpm", &speed);
    CHECK(strcmp(text, "55 rpm") == 0);
    mv_format(text, sizeof(text), "%d%% and %d %s %n", &speed);
    CHECK(strcmp(text, "55% and %d %s %n") == 0);
    mv_format(text, sizeof(text), "[%s]", &name);
    CHECK(strcmp(text, "[9]") == 0);
    mv_format(text, sizeof(text), NULL, &on);
    CHECK(strcmp(text, "false") == 0);
    mv_format(text, 6, "%d rpm", &speed);
    CHECK(strcmp(text, "55 rp") == 0);
    mv_format(text, sizeof(text), "%", &speed);
    CHECK(strcmp(text, "%") == 0);

    mv_prop_deinit(&speed);
    mv_prop_deinit(&on);
    mv_prop_deinit(&name);
    /* a property can be used again after deinit */
    mv_prop_init_string(&name, "again", NULL);
    CHECK(strcmp(mv_get_string(&name), "") == 0);
    mv_prop_deinit(&name);

    printf(failed ? "%d failed\n" : "all passed\n", failed);
    return failed ? 1 : 0;
}
