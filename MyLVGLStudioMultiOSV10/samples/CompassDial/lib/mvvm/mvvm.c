/* mvvm core: properties, observers and formats. Needs only the C standard library. */
#include "mvvm.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char * copy_text(const char * text)
{
    if(!text) text = "";
    size_t size = strlen(text) + 1;
    char * copy = MV_MALLOC(size);
    if(copy) memcpy(copy, text, size);
    return copy;
}

static void init_common(mv_prop_t * prop, const char * name, mv_type_t type)
{
    memset(prop, 0, sizeof(*prop));
    prop->name = name ? name : "";
    prop->type = type;
}

void mv_prop_init_int(mv_prop_t * prop, const char * name, int32_t value, int32_t min, int32_t max)
{
    init_common(prop, name, MV_INT);
    prop->min = min;
    prop->max = max;
    prop->text = copy_text("");
    if(min < max) value = value < min ? min : value > max ? max : value;
    prop->value = value;
}

void mv_prop_init_bool(mv_prop_t * prop, const char * name, bool value)
{
    init_common(prop, name, MV_BOOL);
    prop->text = copy_text("");
    prop->value = value ? 1 : 0;
}

void mv_prop_init_string(mv_prop_t * prop, const char * name, const char * value)
{
    init_common(prop, name, MV_STRING);
    prop->text = copy_text(value);
}

void mv_prop_deinit(mv_prop_t * prop)
{
    mv_observer_t * observer = prop->observers;
    while(observer) {
        mv_observer_t * next = observer->next;
        MV_FREE(observer);
        observer = next;
    }
    prop->observers = NULL;
    MV_FREE(prop->text);
    prop->text = NULL;
}

const char * mv_prop_name(const mv_prop_t * prop)
{
    return prop->name;
}

mv_type_t mv_prop_type(const mv_prop_t * prop)
{
    return prop->type;
}

bool mv_prop_range(const mv_prop_t * prop, int32_t * min, int32_t * max)
{
    if(prop->type != MV_INT || prop->min >= prop->max) return false;
    if(min) *min = prop->min;
    if(max) *max = prop->max;
    return true;
}

/* ------------------------------------------------------------------ values */

int32_t mv_get_int(const mv_prop_t * prop)
{
    if(prop->type == MV_STRING) return prop->text ? (int32_t)strtol(prop->text, NULL, 10) : 0;
    return prop->value;
}

bool mv_get_bool(const mv_prop_t * prop)
{
    if(prop->type == MV_STRING) {
        const char * text = prop->text ? prop->text : "";
        return text[0] != '\0' && strcmp(text, "0") != 0 && strcmp(text, "false") != 0;
    }
    return prop->value != 0;
}

const char * mv_get_string(const mv_prop_t * prop)
{
    static char number[16];
    if(prop->type == MV_STRING) return prop->text ? prop->text : "";
    if(prop->type == MV_BOOL) return prop->value ? "true" : "false";
    snprintf(number, sizeof(number), "%ld", (long)prop->value);
    return number;
}

static void sweep(mv_prop_t * prop)
{
    mv_observer_t ** link = &prop->observers;
    while(*link) {
        mv_observer_t * observer = *link;
        if(observer->removed) {
            *link = observer->next;
            MV_FREE(observer);
        }
        else link = &observer->next;
    }
    prop->sweep = false;
}

static void notify(mv_prop_t * prop, const mv_observer_t * skip)
{
    if(prop->depth >= MV_MAX_DEPTH) return;
    prop->depth++;
    /* Observers added while notifying are told from the next change on. */
    for(mv_observer_t * observer = prop->observers; observer; observer = observer->next) {
        if(observer != skip && !observer->removed) observer->cb(prop, observer->user);
    }
    prop->depth--;
    if(prop->depth == 0 && prop->sweep) sweep(prop);
}

void mv_notify(mv_prop_t * prop)
{
    notify(prop, NULL);
}

bool mv_set_int_from(mv_prop_t * prop, int32_t value, const mv_observer_t * skip)
{
    if(prop->type == MV_STRING) {
        char text[16];
        snprintf(text, sizeof(text), "%ld", (long)value);
        return mv_set_string_from(prop, text, skip);
    }
    if(prop->type == MV_BOOL) value = value ? 1 : 0;
    else if(prop->min < prop->max) value = value < prop->min ? prop->min : value > prop->max ? prop->max : value;
    if(prop->value == value) return false;
    prop->value = value;
    notify(prop, skip);
    return true;
}

bool mv_set_string_from(mv_prop_t * prop, const char * value, const mv_observer_t * skip)
{
    if(!value) value = "";
    if(prop->type != MV_STRING) {
        if(prop->type == MV_BOOL) return mv_set_int_from(prop, strcmp(value, "true") == 0 || strtol(value, NULL, 10) != 0, skip);
        return mv_set_int_from(prop, (int32_t)strtol(value, NULL, 10), skip);
    }
    if(prop->text && strcmp(prop->text, value) == 0) return false;
    char * copy = copy_text(value);
    if(!copy) return false;
    MV_FREE(prop->text);
    prop->text = copy;
    notify(prop, skip);
    return true;
}

bool mv_set_int(mv_prop_t * prop, int32_t value)
{
    return mv_set_int_from(prop, value, NULL);
}

bool mv_set_bool(mv_prop_t * prop, bool value)
{
    return mv_set_int_from(prop, value ? 1 : 0, NULL);
}

bool mv_set_string(mv_prop_t * prop, const char * value)
{
    return mv_set_string_from(prop, value, NULL);
}

/* --------------------------------------------------------------- observers */

mv_observer_t * mv_observe(mv_prop_t * prop, mv_observer_cb_t cb, void * user)
{
    if(!cb) return NULL;
    mv_observer_t * observer = MV_MALLOC(sizeof(mv_observer_t));
    if(!observer) return NULL;
    observer->cb = cb;
    observer->user = user;
    observer->removed = false;
    observer->next = NULL;
    /* At the end, so observers run in the order they were added. */
    mv_observer_t ** link = &prop->observers;
    while(*link) link = &(*link)->next;
    *link = observer;
    return observer;
}

void mv_unobserve(mv_prop_t * prop, mv_observer_t * observer)
{
    if(!observer) return;
    for(mv_observer_t * item = prop->observers; item; item = item->next) {
        if(item != observer) continue;
        item->removed = true;
        prop->sweep = true;
        if(prop->depth == 0) sweep(prop);
        return;
    }
}

/* ------------------------------------------------------------------ format */

static void append(char * out, uint32_t size, uint32_t * used, const char * text)
{
    while(*text && *used + 1 < size) out[(*used)++] = *text++;
}

void mv_format(char * out, uint32_t size, const char * format, const mv_prop_t * prop)
{
    if(!out || size == 0) return;
    uint32_t used = 0;
    if(!format) {
        append(out, size, &used, mv_get_string(prop));
        out[used] = '\0';
        return;
    }
    bool placed = false;
    for(const char * c = format; *c && used + 1 < size; c++) {
        if(c[0] == '%' && c[1] == '%') {
            out[used++] = '%';
            c++;
        }
        else if(c[0] == '%' && (c[1] == 'd' || c[1] == 's') && !placed) {
            char number[16];
            if(c[1] == 'd') {
                snprintf(number, sizeof(number), "%ld", (long)mv_get_int(prop));
                append(out, size, &used, number);
            }
            else append(out, size, &used, mv_get_string(prop));
            placed = true;
            c++;
        }
        else out[used++] = *c;
    }
    out[used] = '\0';
}
