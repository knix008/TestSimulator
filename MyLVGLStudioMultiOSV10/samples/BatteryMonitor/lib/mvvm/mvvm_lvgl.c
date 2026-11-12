/* mvvm bindings for LVGL widgets, and the timers of mvvm.h. LVGL 8.4 and 9.x. */
#include "mvvm_lvgl.h"
#include <string.h>

/* 9.6 marks lv_obj_add_flag deprecated; it is what every version from 8.4 on has. */
#if defined(__GNUC__)
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#endif

#if LVGL_VERSION_MAJOR < 9
#define MV_BUTTON_CLASS lv_btn_class
#define MV_IMAGE_CLASS lv_img_class
#define mv_child_count lv_obj_get_child_cnt
#define lv_dropdown_get_option_count lv_dropdown_get_option_cnt
#define lv_roller_get_option_count lv_roller_get_option_cnt
#define mv_remove_state lv_obj_clear_state
#define mv_remove_flag lv_obj_clear_flag
#define mv_timer_delete lv_timer_del
#define mv_timer_user(t) ((t)->user_data)
#else
#define MV_BUTTON_CLASS lv_button_class
#define MV_IMAGE_CLASS lv_image_class
#define mv_child_count lv_obj_get_child_count
#define mv_remove_state lv_obj_remove_state
#define mv_remove_flag lv_obj_remove_flag
#define mv_timer_delete lv_timer_delete
#define mv_timer_user(t) lv_timer_get_user_data(t)
#endif

/* Arc Label arrived in 9.4. */
#if LVGL_VERSION_MAJOR == 9 && LVGL_VERSION_MINOR >= 4 && LV_USE_ARCLABEL
#define MV_HAS_ARCLABEL 1
#else
#define MV_HAS_ARCLABEL 0
#endif

typedef enum {
    K_OTHER, K_SLIDER, K_BAR, K_ARC, K_SPINBOX, K_DROPDOWN, K_ROLLER, K_SWITCH, K_CHECKBOX,
    K_LED, K_IMAGE, K_LABEL, K_BUTTON, K_TEXTAREA, K_ARCLABEL,
} kind_t;

struct mv_binding {
    lv_obj_t * obj;
    mv_prop_t * prop;
    mv_observer_t * observer;
    mv_binding_desc_t desc;
    kind_t kind;
    bool updating;
};

static kind_t kind_of(const lv_obj_t * obj)
{
#define IS(cls) lv_obj_check_type(obj, &cls)
#if LV_USE_SLIDER
    if(IS(lv_slider_class)) return K_SLIDER;
#endif
#if LV_USE_BAR
    if(IS(lv_bar_class)) return K_BAR;
#endif
#if LV_USE_ARC
    if(IS(lv_arc_class)) return K_ARC;
#endif
#if LV_USE_SPINBOX
    if(IS(lv_spinbox_class)) return K_SPINBOX;
#endif
#if LV_USE_DROPDOWN
    if(IS(lv_dropdown_class)) return K_DROPDOWN;
#endif
#if LV_USE_ROLLER
    if(IS(lv_roller_class)) return K_ROLLER;
#endif
#if LV_USE_SWITCH
    if(IS(lv_switch_class)) return K_SWITCH;
#endif
#if LV_USE_CHECKBOX
    if(IS(lv_checkbox_class)) return K_CHECKBOX;
#endif
#if LV_USE_LED
    if(IS(lv_led_class)) return K_LED;
#endif
#if LV_USE_IMG || LV_USE_IMAGE
    if(IS(MV_IMAGE_CLASS)) return K_IMAGE;
#endif
#if LV_USE_LABEL
    if(IS(lv_label_class)) return K_LABEL;
#endif
#if LV_USE_BTN || LV_USE_BUTTON
    if(IS(MV_BUTTON_CLASS)) return K_BUTTON;
#endif
#if LV_USE_TEXTAREA
    if(IS(lv_textarea_class)) return K_TEXTAREA;
#endif
#if MV_HAS_ARCLABEL
    if(IS(lv_arclabel_class)) return K_ARCLABEL;
#endif
#undef IS
    return K_OTHER;
}

/* A button shows its text with the first label inside it. */
static lv_obj_t * button_label(lv_obj_t * obj)
{
#if LV_USE_LABEL
    uint32_t count = (uint32_t)mv_child_count(obj);
    for(uint32_t i = 0; i < count; i++) {
        lv_obj_t * child = lv_obj_get_child(obj, (int32_t)i);
        if(lv_obj_check_type(child, &lv_label_class)) return child;
    }
#endif
    LV_UNUSED(obj);
    return NULL;
}

static bool has_value(kind_t kind)
{
    return kind >= K_SLIDER && kind <= K_IMAGE;
}

static bool has_text(kind_t kind, lv_obj_t * obj)
{
    if(kind == K_BUTTON) return button_label(obj) != NULL;
    return kind == K_LABEL || kind == K_CHECKBOX || kind == K_TEXTAREA || kind == K_ARCLABEL;
}

bool mv_bindable(const lv_obj_t * obj, mv_attr_t attr)
{
    if(!obj) return false;
    kind_t kind = kind_of(obj);
    switch(attr) {
        case MV_ATTR_VALUE: return has_value(kind);
        case MV_ATTR_TEXT: return has_text(kind, (lv_obj_t *)obj);
        case MV_ATTR_CHECKED:
        case MV_ATTR_HIDDEN:
        case MV_ATTR_DISABLED: return true;
        default: return false;
    }
}

/* ------------------------------------------------------- widget values */

static int32_t clamp_index(int32_t value, uint32_t count)
{
    if(value < 0 || count == 0) return 0;
    return (uint32_t)value >= count ? (int32_t)count - 1 : value;
}

static int32_t widget_value(lv_obj_t * obj, kind_t kind)
{
    switch(kind) {
#if LV_USE_SLIDER
        case K_SLIDER: return lv_slider_get_value(obj);
#endif
#if LV_USE_BAR
        case K_BAR: return lv_bar_get_value(obj);
#endif
#if LV_USE_ARC
        case K_ARC: return lv_arc_get_value(obj);
#endif
#if LV_USE_SPINBOX
        case K_SPINBOX: return lv_spinbox_get_value(obj);
#endif
#if LV_USE_DROPDOWN
        case K_DROPDOWN: return (int32_t)lv_dropdown_get_selected(obj);
#endif
#if LV_USE_ROLLER
        case K_ROLLER: return (int32_t)lv_roller_get_selected(obj);
#endif
        case K_SWITCH:
        case K_CHECKBOX: return lv_obj_has_state(obj, LV_STATE_CHECKED) ? 1 : 0;
#if LV_USE_LED
        case K_LED: return lv_led_get_brightness(obj);
#endif
#if LVGL_VERSION_MAJOR >= 9
        case K_IMAGE: return lv_image_get_rotation(obj) / 10;
#else
        case K_IMAGE: return lv_img_get_angle(obj) / 10;
#endif
        default: return 0;
    }
}

static void set_widget_value(lv_obj_t * obj, kind_t kind, int32_t value)
{
    switch(kind) {
#if LV_USE_SLIDER
        case K_SLIDER: lv_slider_set_value(obj, value, LV_ANIM_OFF); break;
#endif
#if LV_USE_BAR
        case K_BAR: lv_bar_set_value(obj, value, LV_ANIM_OFF); break;
#endif
#if LV_USE_ARC
        case K_ARC: lv_arc_set_value(obj, value); break;
#endif
#if LV_USE_SPINBOX
        case K_SPINBOX: lv_spinbox_set_value(obj, value); break;
#endif
#if LV_USE_DROPDOWN
        case K_DROPDOWN: lv_dropdown_set_selected(obj, clamp_index(value, lv_dropdown_get_option_count(obj))); break;
#endif
#if LV_USE_ROLLER
        case K_ROLLER: lv_roller_set_selected(obj, clamp_index(value, lv_roller_get_option_count(obj)), LV_ANIM_OFF); break;
#endif
        case K_SWITCH:
        case K_CHECKBOX:
            if(value) lv_obj_add_state(obj, LV_STATE_CHECKED);
            else mv_remove_state(obj, LV_STATE_CHECKED);
            break;
#if LV_USE_LED
        case K_LED: lv_led_set_brightness(obj, (uint8_t)(value < 0 ? 0 : value > 255 ? 255 : value)); break;
#endif
#if LVGL_VERSION_MAJOR >= 9
        case K_IMAGE: lv_image_set_rotation(obj, value * 10); break;
#else
        case K_IMAGE: lv_img_set_angle(obj, (int16_t)((value % 360) * 10)); break;
#endif
        default: break;
    }
}

/* The range a widget's value runs over, for MV_CONV_RANGE without one of its own. */
static void widget_range(lv_obj_t * obj, kind_t kind, int32_t * min, int32_t * max)
{
    *min = 0;
    *max = 100;
    switch(kind) {
#if LV_USE_SLIDER
        case K_SLIDER: *min = lv_slider_get_min_value(obj); *max = lv_slider_get_max_value(obj); break;
#endif
#if LV_USE_BAR
        case K_BAR: *min = lv_bar_get_min_value(obj); *max = lv_bar_get_max_value(obj); break;
#endif
#if LV_USE_ARC
        case K_ARC: *min = lv_arc_get_min_value(obj); *max = lv_arc_get_max_value(obj); break;
#endif
#if LV_USE_DROPDOWN
        case K_DROPDOWN: *max = (int32_t)lv_dropdown_get_option_count(obj) - 1; break;
#endif
#if LV_USE_ROLLER
        case K_ROLLER: *max = (int32_t)lv_roller_get_option_count(obj) - 1; break;
#endif
        case K_SWITCH:
        case K_CHECKBOX: *max = 1; break;
        case K_LED: *max = 255; break;
        case K_IMAGE: *max = 359; break;
        default: break;
    }
    LV_UNUSED(obj);
}

static const char * widget_text(lv_obj_t * obj, kind_t kind)
{
    switch(kind) {
#if LV_USE_LABEL
        case K_LABEL: return lv_label_get_text(obj);
        case K_BUTTON: {
            lv_obj_t * label = button_label(obj);
            return label ? lv_label_get_text(label) : "";
        }
#endif
#if LV_USE_CHECKBOX
        case K_CHECKBOX: return lv_checkbox_get_text(obj);
#endif
#if LV_USE_TEXTAREA
        case K_TEXTAREA: return lv_textarea_get_text(obj);
#endif
        default: return "";
    }
}

static void set_widget_text(lv_obj_t * obj, kind_t kind, const char * text)
{
    if(kind != K_ARCLABEL && strcmp(widget_text(obj, kind), text) == 0) return;
    switch(kind) {
#if LV_USE_LABEL
        case K_LABEL: lv_label_set_text(obj, text); break;
        case K_BUTTON: {
            lv_obj_t * label = button_label(obj);
            if(label) lv_label_set_text(label, text);
            break;
        }
#endif
#if LV_USE_CHECKBOX
        case K_CHECKBOX: lv_checkbox_set_text(obj, text); break;
#endif
#if LV_USE_TEXTAREA
        case K_TEXTAREA: lv_textarea_set_text(obj, text); break;
#endif
#if MV_HAS_ARCLABEL
        case K_ARCLABEL: lv_arclabel_set_text(obj, text); break;
#endif
        default: break;
    }
}

/* ------------------------------------------------------------ converting */

static int32_t map_value(int32_t value, int32_t in_min, int32_t in_max, int32_t out_min, int32_t out_max)
{
    if(in_min == in_max) return out_min;
    if(in_min < in_max ? value <= in_min : value >= in_min) return out_min;
    if(in_min < in_max ? value >= in_max : value <= in_max) return out_max;
    int64_t span = (int64_t)out_max - out_min;
    return (int32_t)(((int64_t)value - in_min) * span / ((int64_t)in_max - in_min) + out_min);
}

static void view_range(mv_binding_t * b, int32_t * min, int32_t * max)
{
    if(b->desc.view_min != b->desc.view_max) {
        *min = b->desc.view_min;
        *max = b->desc.view_max;
    }
    else widget_range(b->obj, b->kind, min, max);
}

/* The property as the widget shows it, as a number. */
static int32_t view_number(mv_binding_t * b)
{
    const mv_binding_desc_t * d = &b->desc;
    int32_t value = mv_get_int(b->prop);
    if(b->prop->type == MV_BOOL && (d->conv & MV_CONV_INVERT)) value = !value;
    if(d->to_view) value = d->to_view(value, d->user);
    if(d->conv & MV_CONV_RANGE) {
        int32_t view_min, view_max, prop_min, prop_max;
        view_range(b, &view_min, &view_max);
        if(b->prop->type == MV_BOOL) value = value ? view_max : view_min;
        else if(mv_prop_range(b->prop, &prop_min, &prop_max)) value = map_value(value, prop_min, prop_max, view_min, view_max);
    }
    return value;
}

/* A number from the widget, as the property takes it. */
static int32_t source_number(mv_binding_t * b, int32_t value)
{
    const mv_binding_desc_t * d = &b->desc;
    if(d->conv & MV_CONV_RANGE) {
        int32_t view_min, view_max, prop_min, prop_max;
        view_range(b, &view_min, &view_max);
        if(b->prop->type == MV_BOOL) value = value != view_min;
        else if(mv_prop_range(b->prop, &prop_min, &prop_max)) value = map_value(value, view_min, view_max, prop_min, prop_max);
    }
    if(d->to_source) value = d->to_source(value, d->user);
    if(b->prop->type == MV_BOOL && (d->conv & MV_CONV_INVERT)) value = !value;
    return value;
}

static bool view_flag(mv_binding_t * b)
{
    bool on = mv_get_bool(b->prop);
    if(b->desc.to_view) on = b->desc.to_view(on, b->desc.user) != 0;
    return (b->desc.conv & MV_CONV_INVERT) ? !on : on;
}

/* ------------------------------------------------------------- directions */

static void to_view(mv_binding_t * b)
{
    lv_obj_t * obj = b->obj;
    b->updating = true;
    switch(b->desc.attr) {
        case MV_ATTR_VALUE: set_widget_value(obj, b->kind, view_number(b)); break;
        case MV_ATTR_TEXT: {
            char text[256];
            const mv_binding_desc_t * d = &b->desc;
            if(b->prop->type != MV_STRING && (d->to_view || (d->conv & MV_CONV_INVERT))) {
                mv_prop_t shown;
                memset(&shown, 0, sizeof(shown));
                shown.type = d->to_view ? MV_INT : b->prop->type;
                shown.value = view_number(b);
                mv_format(text, sizeof(text), d->format, &shown);
            }
            else mv_format(text, sizeof(text), d->format, b->prop);
            set_widget_text(obj, b->kind, text);
            break;
        }
        case MV_ATTR_CHECKED:
            if(view_flag(b)) lv_obj_add_state(obj, LV_STATE_CHECKED);
            else mv_remove_state(obj, LV_STATE_CHECKED);
            break;
        case MV_ATTR_HIDDEN:
            if(view_flag(b)) lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
            else mv_remove_flag(obj, LV_OBJ_FLAG_HIDDEN);
            break;
        case MV_ATTR_DISABLED:
            if(view_flag(b)) lv_obj_add_state(obj, LV_STATE_DISABLED);
            else mv_remove_state(obj, LV_STATE_DISABLED);
            break;
        default: break;
    }
    b->updating = false;
}

static void to_source(mv_binding_t * b)
{
    lv_obj_t * obj = b->obj;
    switch(b->desc.attr) {
        case MV_ATTR_VALUE:
            mv_set_int_from(b->prop, source_number(b, widget_value(obj, b->kind)), b->observer);
            break;
        case MV_ATTR_TEXT:
            if(b->prop->type == MV_STRING || !b->desc.to_source) mv_set_string_from(b->prop, widget_text(obj, b->kind), b->observer);
            else mv_set_int_from(b->prop, b->desc.to_source((int32_t)strtol(widget_text(obj, b->kind), NULL, 10), b->desc.user), b->observer);
            break;
        case MV_ATTR_CHECKED: {
            int32_t on = lv_obj_has_state(obj, LV_STATE_CHECKED) ? 1 : 0;
            if(b->desc.to_source) on = b->desc.to_source(on, b->desc.user) != 0;
            if(b->desc.conv & MV_CONV_INVERT) on = !on;
            mv_set_int_from(b->prop, on, b->observer);
            break;
        }
        default: break;
    }
}

static void on_prop(mv_prop_t * prop, void * user)
{
    mv_binding_t * b = user;
    LV_UNUSED(prop);
    if(b->desc.mode == MV_ONE_WAY || b->desc.mode == MV_TWO_WAY) to_view(b);
}

static void free_binding(mv_binding_t * b)
{
    mv_unobserve(b->prop, b->observer);
    MV_FREE(b);
}

static void on_widget(lv_event_t * e)
{
    mv_binding_t * b = lv_event_get_user_data(e);
    lv_event_code_t code = lv_event_get_code(e);
    if(code == LV_EVENT_DELETE) {
        free_binding(b);
        return;
    }
    if(code != LV_EVENT_VALUE_CHANGED || b->updating) return;
    if(b->desc.mode == MV_TWO_WAY || b->desc.mode == MV_ONE_WAY_TO_SOURCE) to_source(b);
}

mv_binding_t * mv_bind(lv_obj_t * obj, mv_prop_t * prop, const mv_binding_desc_t * desc)
{
    if(!obj || !prop || !desc || !mv_bindable(obj, desc->attr)) return NULL;
    mv_binding_t * b = MV_MALLOC(sizeof(mv_binding_t));
    if(!b) return NULL;
    memset(b, 0, sizeof(*b));
    b->obj = obj;
    b->prop = prop;
    b->desc = *desc;
    b->kind = kind_of(obj);
    if(desc->mode == MV_ONE_WAY || desc->mode == MV_TWO_WAY) {
        b->observer = mv_observe(prop, on_prop, b);
        if(!b->observer) {
            MV_FREE(b);
            return NULL;
        }
    }
    lv_obj_add_event_cb(obj, on_widget, LV_EVENT_ALL, b);
    if(desc->mode == MV_ONE_WAY_TO_SOURCE) to_source(b);
    else to_view(b);
    return b;
}

void mv_unbind(mv_binding_t * binding)
{
    if(!binding) return;
    lv_obj_remove_event_cb_with_user_data(binding->obj, on_widget, binding);
    free_binding(binding);
}

mv_binding_t * mv_bind_value(lv_obj_t * obj, mv_prop_t * prop, mv_mode_t mode)
{
    mv_binding_desc_t desc = MV_BINDING_DEFAULT(MV_ATTR_VALUE);
    desc.mode = mode;
    return mv_bind(obj, prop, &desc);
}

mv_binding_t * mv_bind_text(lv_obj_t * obj, mv_prop_t * prop, const char * format)
{
    mv_binding_desc_t desc = MV_BINDING_DEFAULT(MV_ATTR_TEXT);
    desc.format = format;
    return mv_bind(obj, prop, &desc);
}

/* ------------------------------------------------------------------ timers */

struct mv_timer {
    lv_timer_t * timer;
    mv_timer_cb_t cb;
    void * user;
};

static void on_timer(lv_timer_t * timer)
{
    mv_timer_t * own = mv_timer_user(timer);
    own->cb(own->user);
}

mv_timer_t * mv_timer_start(uint32_t period_ms, mv_timer_cb_t cb, void * user)
{
    if(!cb) return NULL;
    mv_timer_t * own = MV_MALLOC(sizeof(mv_timer_t));
    if(!own) return NULL;
    own->cb = cb;
    own->user = user;
    own->timer = lv_timer_create(on_timer, period_ms, own);
    if(!own->timer) {
        MV_FREE(own);
        return NULL;
    }
    return own;
}

void mv_timer_stop(mv_timer_t * timer)
{
    if(!timer) return;
    mv_timer_delete(timer->timer);
    MV_FREE(timer);
}
