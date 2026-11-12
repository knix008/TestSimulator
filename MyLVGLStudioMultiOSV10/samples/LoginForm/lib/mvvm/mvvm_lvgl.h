/*
 * mvvm_lvgl - data binding between mvvm properties and LVGL widgets (LVGL 8.4 and 9.x).
 *
 * A binding keeps one attribute of one widget and one property in step, the way a
 * {Binding} does in WPF:
 *
 *   mv_binding_desc_t desc = MV_BINDING_DEFAULT(MV_ATTR_VALUE);
 *   desc.mode = MV_TWO_WAY;
 *   mv_bind(slider, &speed, &desc);
 *
 * The binding removes itself when its widget is deleted.
 */
#ifndef MVVM_LVGL_H
#define MVVM_LVGL_H

#include "mvvm.h"
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MV_ATTR_VALUE = 0,    /* slider, bar, arc, spinbox: value; dropdown, roller: selected
                             index; switch, checkbox: 0/1; led: brightness; image: degrees */
    MV_ATTR_TEXT = 1,     /* label, button (its label), checkbox, textarea, arc label */
    MV_ATTR_CHECKED = 2,  /* the checked state of any widget */
    MV_ATTR_HIDDEN = 3,   /* any widget */
    MV_ATTR_DISABLED = 4, /* any widget */
} mv_attr_t;

typedef enum {
    MV_ONE_WAY = 0,           /* property -> widget */
    MV_TWO_WAY = 1,           /* both ways: what the user changes reaches the property */
    MV_ONE_WAY_TO_SOURCE = 2, /* widget -> property only; starts from the widget's value */
    MV_ONE_TIME = 3,          /* property -> widget, once */
} mv_mode_t;

/* Converters. They combine: MV_CONV_RANGE | MV_CONV_INVERT. */
#define MV_CONV_NONE 0
#define MV_CONV_INVERT 1  /* a bool shows the other way round (hidden = !visible) */
#define MV_CONV_RANGE 2   /* the property's min..max is scaled onto view_min..view_max */

/* A converter of the application's own, for values; `back` turns a widget value into a
 * property value for two-way bindings and may be NULL. */
typedef int32_t (*mv_convert_cb_t)(int32_t value, void * user);

typedef struct {
    mv_attr_t attr;
    mv_mode_t mode;
    uint8_t conv;
    int32_t view_min;
    int32_t view_max;
    const char * format;  /* MV_ATTR_TEXT: see mv_format(); NULL prints the value. Kept by
                             pointer: use a string literal or other long-lived text. */
    mv_convert_cb_t to_view;
    mv_convert_cb_t to_source;
    void * user;
} mv_binding_desc_t;

#define MV_BINDING_DEFAULT(a) { (a), MV_ONE_WAY, MV_CONV_NONE, 0, 0, NULL, NULL, NULL, NULL }

typedef struct mv_binding mv_binding_t;

/* NULL when the widget cannot show that attribute or memory ran out. */
mv_binding_t * mv_bind(lv_obj_t * obj, mv_prop_t * prop, const mv_binding_desc_t * desc);
void mv_unbind(mv_binding_t * binding);

/* Shortcuts for the everyday forms. */
mv_binding_t * mv_bind_value(lv_obj_t * obj, mv_prop_t * prop, mv_mode_t mode);
mv_binding_t * mv_bind_text(lv_obj_t * obj, mv_prop_t * prop, const char * format);

/* Can this widget show this attribute? */
bool mv_bindable(const lv_obj_t * obj, mv_attr_t attr);

#ifdef __cplusplus
}
#endif

#endif
