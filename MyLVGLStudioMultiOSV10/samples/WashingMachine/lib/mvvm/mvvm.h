/*
 * mvvm - observable properties for the ViewModel of an LVGL application.
 *
 * Part of My LVGL Studio; the same files are built into the design engine and copied into
 * every generated project (lib/mvvm/), so what the designer shows is what the program does.
 *
 * This header does not include lvgl.h: application logic (the Model and the logic of a
 * ViewModel) can include it and still be compiled and unit-tested without LVGL.
 *
 *   mv_prop_t speed;
 *   mv_prop_init_int(&speed, "speed", 40, 0, 100);
 *   mv_observe(&speed, on_speed, NULL);        // like PropertyChanged +=
 *   mv_set_int(&speed, 55);                    // every observer and bound widget follows
 *
 * Not thread safe: call it from the thread that runs lv_timer_handler().
 */
#ifndef MVVM_H
#define MVVM_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define MVVM_VERSION_MAJOR 1
#define MVVM_VERSION_MINOR 0

/* Memory for strings and observers; replace both to use another allocator. */
#ifndef MV_MALLOC
#include <stdlib.h>
#define MV_MALLOC malloc
#define MV_FREE free
#endif

/* How deep a change may cause further changes of the same property before it stops. */
#ifndef MV_MAX_DEPTH
#define MV_MAX_DEPTH 8
#endif

typedef enum {
    MV_INT = 0,
    MV_BOOL = 1,
    MV_STRING = 2,
} mv_type_t;

typedef struct mv_prop mv_prop_t;
typedef struct mv_observer mv_observer_t;

/* Called after the property changed. Read the new value with mv_get_*(prop). */
typedef void (*mv_observer_cb_t)(mv_prop_t * prop, void * user);

struct mv_observer {
    mv_observer_t * next;
    mv_observer_cb_t cb;
    void * user;
    bool removed;
};

/* A property. Treat the fields as private; they are public so a property can be static. */
struct mv_prop {
    const char * name;
    mv_type_t type;
    int32_t value;     /* MV_INT, and MV_BOOL as 0 or 1 */
    char * text;       /* MV_STRING, never NULL after init */
    int32_t min;       /* MV_INT: with min < max, values are kept inside the range */
    int32_t max;
    mv_observer_t * observers;
    uint8_t depth;     /* notifications running for this property */
    bool sweep;        /* an observer was removed while notifying */
};

void mv_prop_init_int(mv_prop_t * prop, const char * name, int32_t value, int32_t min, int32_t max);
void mv_prop_init_bool(mv_prop_t * prop, const char * name, bool value);
void mv_prop_init_string(mv_prop_t * prop, const char * name, const char * value);
/* Frees the text and the observers; the property can be initialised again afterwards. */
void mv_prop_deinit(mv_prop_t * prop);

const char * mv_prop_name(const mv_prop_t * prop);
mv_type_t mv_prop_type(const mv_prop_t * prop);
/* The range of an MV_INT property; false when it has none (min >= max). */
bool mv_prop_range(const mv_prop_t * prop, int32_t * min, int32_t * max);

/* Any property can be read as any type: 42 reads as "42" and true, "7" reads as 7. */
int32_t mv_get_int(const mv_prop_t * prop);
bool mv_get_bool(const mv_prop_t * prop);
/* The text of a string property; the number of an int property as text (a shared buffer). */
const char * mv_get_string(const mv_prop_t * prop);

/* Each returns true when the value changed; observers run only then. */
bool mv_set_int(mv_prop_t * prop, int32_t value);
bool mv_set_bool(mv_prop_t * prop, bool value);
bool mv_set_string(mv_prop_t * prop, const char * value);

/* The same, without telling `skip`: a binding uses it for the change it made itself. */
bool mv_set_int_from(mv_prop_t * prop, int32_t value, const mv_observer_t * skip);
bool mv_set_string_from(mv_prop_t * prop, const char * value, const mv_observer_t * skip);

/* Tells the observers again, even though nothing changed (a refresh). */
void mv_notify(mv_prop_t * prop);

mv_observer_t * mv_observe(mv_prop_t * prop, mv_observer_cb_t cb, void * user);
/* Safe inside an observer, also for the observer that is running. */
void mv_unobserve(mv_prop_t * prop, mv_observer_t * observer);

/*
 * Text of a value through a format: the first %d (the value as a number) or %s (as text)
 * takes the value, %% is a percent sign, anything else is printed as it is. Never reads
 * beyond its one value, whatever the format says. A NULL format prints the value as it is.
 */
void mv_format(char * out, uint32_t size, const char * format, const mv_prop_t * prop);

/* ------------------------------------------------------------------ timers */
/* Periodic work for the logic, without including LVGL (implemented in mvvm_lvgl.c). */
typedef struct mv_timer mv_timer_t;
typedef void (*mv_timer_cb_t)(void * user);
mv_timer_t * mv_timer_start(uint32_t period_ms, mv_timer_cb_t cb, void * user);
void mv_timer_stop(mv_timer_t * timer);

#ifdef __cplusplus
}
#endif

#endif
