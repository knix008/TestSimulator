#include <json-glib/json-glib.h>
#include <glib.h>
#include <glib/gstdio.h>
#include <string.h>
#include "settings.h"

static const char *CONFIG_DIR  = "myclock";
static const char *CONFIG_FILE = "settings.json";

/* ── Default world cities ───────────────────────────────────────────────── */

static const WorldTimeCityDto DEFAULT_CITIES[] = {
    { "서울",     "대한민국",   "Asia/Seoul",             "" },
    { "도쿄",     "일본",       "Asia/Tokyo",             "" },
    { "베이징",   "중국",       "Asia/Shanghai",          "" },
    { "뉴욕",     "미국",       "America/New_York",       "" },
    { "런던",     "영국",       "Europe/London",          "" },
    { "파리",     "프랑스",     "Europe/Paris",           "" },
    { "시드니",   "호주",       "Australia/Sydney",       "" },
};
#define DEFAULT_CITY_COUNT ((int)(sizeof(DEFAULT_CITIES)/sizeof(DEFAULT_CITIES[0])))

/* ── Defaults ───────────────────────────────────────────────────────────── */

void settings_reset_world_cities(AppSettings *s)
{
    s->world_city_count = DEFAULT_CITY_COUNT;
    for (int i = 0; i < DEFAULT_CITY_COUNT; i++)
        s->world_cities[i] = DEFAULT_CITIES[i];
}

void settings_defaults(AppSettings *s)
{
    memset(s, 0, sizeof(*s));
    s->window_w    = 300.0;
    s->window_h    = 120.0;
    s->digital_w   = 300.0;
    s->digital_h   = 120.0;
    s->analog_w    = 300.0;
    s->analog_h    = 300.0;
    s->is_digital  = TRUE;
    s->use24h      = FALSE;
    s->world_use24h = FALSE;
    s->always_on_top = FALSE;
    s->digital_style = DIGITAL_STYLE_SEVEN_SEGMENT;
    s->analog_style  = ANALOG_STYLE_CLASSIC;
    s->theme         = THEME_DARK;
    /* Default digit color: #58A6FF */
    s->digit_r = 0x58 / 255.0;
    s->digit_g = 0xA6 / 255.0;
    s->digit_b = 0xFF / 255.0;
    /* Default AM/PM color: #89B4FA */
    s->ampm_r  = 0x89 / 255.0;
    s->ampm_g  = 0xB4 / 255.0;
    s->ampm_b  = 0xFA / 255.0;
    s->brightness = 1.0;
    s->alarm_volume = 70;

    /* Default world cities */
    s->world_city_count = DEFAULT_CITY_COUNT;
    for (int i = 0; i < DEFAULT_CITY_COUNT; i++)
        s->world_cities[i] = DEFAULT_CITIES[i];

    /* Default timer */
    s->timer_count = 1;
    s->timers[0].hours   = 0;
    s->timers[0].minutes = 5;
    s->timers[0].seconds = 0;
    s->timers[0].label[0] = '\0';
}

/* ── Settings file path ─────────────────────────────────────────────────── */

static gchar *get_settings_path(void)
{
    const gchar *cfg = g_get_user_config_dir();
    gchar *dir  = g_build_filename(cfg, CONFIG_DIR, NULL);
    gchar *path = g_build_filename(dir, CONFIG_FILE, NULL);
    g_free(dir);
    return path;
}

/* ── JSON helpers ───────────────────────────────────────────────────────── */

static double jobj_double(JsonObject *obj, const char *key, double def)
{
    if (!json_object_has_member(obj, key)) return def;
    return json_node_get_double(json_object_get_member(obj, key));
}

static gboolean jobj_bool(JsonObject *obj, const char *key, gboolean def)
{
    if (!json_object_has_member(obj, key)) return def;
    return json_node_get_boolean(json_object_get_member(obj, key));
}

static int jobj_int(JsonObject *obj, const char *key, int def)
{
    if (!json_object_has_member(obj, key)) return def;
    return (int)json_node_get_int(json_object_get_member(obj, key));
}

static const char *jobj_str(JsonObject *obj, const char *key, const char *def)
{
    if (!json_object_has_member(obj, key)) return def;
    return json_node_get_string(json_object_get_member(obj, key));
}

/* ── Load ───────────────────────────────────────────────────────────────── */

void settings_load(AppSettings *s)
{
    settings_defaults(s);

    gchar *path = get_settings_path();
    if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return;
    }

    GError *err = NULL;
    JsonParser *parser = json_parser_new();
    if (!json_parser_load_from_file(parser, path, &err)) {
        g_error_free(err);
        g_object_unref(parser);
        g_free(path);
        return;
    }
    g_free(path);

    JsonNode *root = json_parser_get_root(parser);
    if (!JSON_NODE_HOLDS_OBJECT(root)) {
        g_object_unref(parser);
        return;
    }
    JsonObject *obj = json_node_get_object(root);

    s->window_x = jobj_double(obj, "window_x", s->window_x);
    s->window_y = jobj_double(obj, "window_y", s->window_y);
    s->window_w = jobj_double(obj, "window_w", s->window_w);
    s->window_h = jobj_double(obj, "window_h", s->window_h);

    s->digital_x = jobj_double(obj, "digital_x", s->digital_x);
    s->digital_y = jobj_double(obj, "digital_y", s->digital_y);
    s->digital_w = jobj_double(obj, "digital_w", s->digital_w);
    s->digital_h = jobj_double(obj, "digital_h", s->digital_h);
    s->digital_pos_saved = jobj_bool(obj, "digital_pos_saved", FALSE);

    s->analog_x = jobj_double(obj, "analog_x", s->analog_x);
    s->analog_y = jobj_double(obj, "analog_y", s->analog_y);
    s->analog_w = jobj_double(obj, "analog_w", s->analog_w);
    s->analog_h = jobj_double(obj, "analog_h", s->analog_h);
    s->analog_pos_saved = jobj_bool(obj, "analog_pos_saved", FALSE);

    s->is_digital    = jobj_bool(obj, "is_digital",    s->is_digital);
    s->use24h        = jobj_bool(obj, "use24h",        s->use24h);
    s->world_use24h  = jobj_bool(obj, "world_use24h",  s->world_use24h);
    s->always_on_top = jobj_bool(obj, "always_on_top", s->always_on_top);

    s->digital_style = (DigitalStyle)jobj_int(obj, "digital_style", (int)s->digital_style);
    s->analog_style  = (AnalogStyle)jobj_int(obj, "analog_style",   (int)s->analog_style);
    s->theme         = (ThemeId)jobj_int(obj, "theme",              (int)s->theme);

    s->digit_r = jobj_double(obj, "digit_r", s->digit_r);
    s->digit_g = jobj_double(obj, "digit_g", s->digit_g);
    s->digit_b = jobj_double(obj, "digit_b", s->digit_b);
    s->ampm_r  = jobj_double(obj, "ampm_r",  s->ampm_r);
    s->ampm_g  = jobj_double(obj, "ampm_g",  s->ampm_g);
    s->ampm_b  = jobj_double(obj, "ampm_b",  s->ampm_b);
    s->brightness    = jobj_double(obj, "brightness", s->brightness);
    s->alarm_volume  = jobj_int(obj, "alarm_volume", s->alarm_volume);

    /* Alarms */
    if (json_object_has_member(obj, "alarms")) {
        JsonArray *arr = json_object_get_array_member(obj, "alarms");
        int n = (int)json_array_get_length(arr);
        if (n > MAX_ALARMS) n = MAX_ALARMS;
        s->alarm_count = 0;
        for (int i = 0; i < n; i++) {
            JsonObject *ao = json_array_get_object_element(arr, i);
            AlarmItem *a   = &s->alarms[s->alarm_count];
            const char *id = jobj_str(ao, "id", "");
            g_strlcpy(a->id, id, sizeof(a->id));
            a->hour       = jobj_int(ao, "hour",   0);
            a->minute     = jobj_int(ao, "minute", 0);
            a->year       = jobj_int(ao, "year",   0);
            a->month      = jobj_int(ao, "month",  0);
            a->day        = jobj_int(ao, "day",    0);
            const char *lbl = jobj_str(ao, "label", "");
            g_strlcpy(a->label, lbl, sizeof(a->label));
            a->is_enabled = jobj_bool(ao, "is_enabled", TRUE);
            a->is_repeat  = jobj_bool(ao, "is_repeat",  FALSE);
            a->repeat_days = jobj_int(ao, "repeat_days", 0x7F);
            s->alarm_count++;
        }
    }

    /* World cities */
    if (json_object_has_member(obj, "world_cities")) {
        JsonArray *arr = json_object_get_array_member(obj, "world_cities");
        int n = (int)json_array_get_length(arr);
        if (n > MAX_WORLD_CITIES) n = MAX_WORLD_CITIES;
        s->world_city_count = 0;
        for (int i = 0; i < n; i++) {
            JsonObject *co = json_array_get_object_element(arr, i);
            WorldTimeCityDto *c = &s->world_cities[s->world_city_count];
            g_strlcpy(c->city,   jobj_str(co, "city",   ""), sizeof(c->city));
            g_strlcpy(c->region, jobj_str(co, "region", ""), sizeof(c->region));
            g_strlcpy(c->tz_id,  jobj_str(co, "tz_id",  "UTC"), sizeof(c->tz_id));
            s->world_city_count++;
        }
    }

    /* Timers */
    if (json_object_has_member(obj, "timers")) {
        JsonArray *arr = json_object_get_array_member(obj, "timers");
        int n = (int)json_array_get_length(arr);
        if (n > MAX_TIMERS) n = MAX_TIMERS;
        s->timer_count = n;
        for (int i = 0; i < n; i++) {
            JsonObject *to = json_array_get_object_element(arr, i);
            TimerDto *t = &s->timers[i];
            t->hours   = jobj_int(to, "hours",   0);
            t->minutes = jobj_int(to, "minutes", 5);
            t->seconds = jobj_int(to, "seconds", 0);
            g_strlcpy(t->label, jobj_str(to, "label", ""), sizeof(t->label));
        }
    }

    /* Calendar events */
    if (json_object_has_member(obj, "events")) {
        JsonArray *arr = json_object_get_array_member(obj, "events");
        int n = (int)json_array_get_length(arr);
        if (n > MAX_CAL_EVENTS) n = MAX_CAL_EVENTS;
        s->event_count = 0;
        for (int i = 0; i < n; i++) {
            JsonObject *eo = json_array_get_object_element(arr, i);
            CalendarEvent *e = &s->events[s->event_count];
            g_strlcpy(e->id,       jobj_str(eo, "id",    ""), sizeof(e->id));
            g_strlcpy(e->title,    jobj_str(eo, "title", ""), sizeof(e->title));
            e->start_year  = jobj_int(eo, "start_year",  2024);
            e->start_month = jobj_int(eo, "start_month", 1);
            e->start_day   = jobj_int(eo, "start_day",   1);
            e->start_hour  = jobj_int(eo, "start_hour",  9);
            e->start_minute= jobj_int(eo, "start_min",   0);
            e->end_year    = jobj_int(eo, "end_year",    2024);
            e->end_month   = jobj_int(eo, "end_month",   1);
            e->end_day     = jobj_int(eo, "end_day",     1);
            e->end_hour    = jobj_int(eo, "end_hour",    10);
            e->end_minute  = jobj_int(eo, "end_min",     0);
            e->is_all_day  = jobj_bool(eo, "is_all_day", FALSE);
            g_strlcpy(e->location, jobj_str(eo, "location", ""), sizeof(e->location));
            g_strlcpy(e->memo,     jobj_str(eo, "memo",     ""), sizeof(e->memo));
            s->event_count++;
        }
    }

    g_object_unref(parser);
}

/* ── Save ───────────────────────────────────────────────────────────────── */

void settings_save(const AppSettings *s)
{
    JsonBuilder *b = json_builder_new();
    json_builder_begin_object(b);

    json_builder_set_member_name(b, "window_x");  json_builder_add_double_value(b, s->window_x);
    json_builder_set_member_name(b, "window_y");  json_builder_add_double_value(b, s->window_y);
    json_builder_set_member_name(b, "window_w");  json_builder_add_double_value(b, s->window_w);
    json_builder_set_member_name(b, "window_h");  json_builder_add_double_value(b, s->window_h);

    json_builder_set_member_name(b, "digital_x"); json_builder_add_double_value(b, s->digital_x);
    json_builder_set_member_name(b, "digital_y"); json_builder_add_double_value(b, s->digital_y);
    json_builder_set_member_name(b, "digital_w"); json_builder_add_double_value(b, s->digital_w);
    json_builder_set_member_name(b, "digital_h"); json_builder_add_double_value(b, s->digital_h);
    json_builder_set_member_name(b, "digital_pos_saved"); json_builder_add_boolean_value(b, s->digital_pos_saved);

    json_builder_set_member_name(b, "analog_x");  json_builder_add_double_value(b, s->analog_x);
    json_builder_set_member_name(b, "analog_y");  json_builder_add_double_value(b, s->analog_y);
    json_builder_set_member_name(b, "analog_w");  json_builder_add_double_value(b, s->analog_w);
    json_builder_set_member_name(b, "analog_h");  json_builder_add_double_value(b, s->analog_h);
    json_builder_set_member_name(b, "analog_pos_saved"); json_builder_add_boolean_value(b, s->analog_pos_saved);

    json_builder_set_member_name(b, "is_digital");    json_builder_add_boolean_value(b, s->is_digital);
    json_builder_set_member_name(b, "use24h");        json_builder_add_boolean_value(b, s->use24h);
    json_builder_set_member_name(b, "world_use24h");  json_builder_add_boolean_value(b, s->world_use24h);
    json_builder_set_member_name(b, "always_on_top"); json_builder_add_boolean_value(b, s->always_on_top);

    json_builder_set_member_name(b, "digital_style"); json_builder_add_int_value(b, (int)s->digital_style);
    json_builder_set_member_name(b, "analog_style");  json_builder_add_int_value(b, (int)s->analog_style);
    json_builder_set_member_name(b, "theme");         json_builder_add_int_value(b, (int)s->theme);

    json_builder_set_member_name(b, "digit_r");       json_builder_add_double_value(b, s->digit_r);
    json_builder_set_member_name(b, "digit_g");       json_builder_add_double_value(b, s->digit_g);
    json_builder_set_member_name(b, "digit_b");       json_builder_add_double_value(b, s->digit_b);
    json_builder_set_member_name(b, "ampm_r");        json_builder_add_double_value(b, s->ampm_r);
    json_builder_set_member_name(b, "ampm_g");        json_builder_add_double_value(b, s->ampm_g);
    json_builder_set_member_name(b, "ampm_b");        json_builder_add_double_value(b, s->ampm_b);
    json_builder_set_member_name(b, "brightness");    json_builder_add_double_value(b, s->brightness);
    json_builder_set_member_name(b, "alarm_volume");  json_builder_add_int_value(b,    s->alarm_volume);

    /* Alarms */
    json_builder_set_member_name(b, "alarms");
    json_builder_begin_array(b);
    for (int i = 0; i < s->alarm_count; i++) {
        const AlarmItem *a = &s->alarms[i];
        json_builder_begin_object(b);
        json_builder_set_member_name(b, "id");          json_builder_add_string_value(b, a->id);
        json_builder_set_member_name(b, "hour");        json_builder_add_int_value(b, a->hour);
        json_builder_set_member_name(b, "minute");      json_builder_add_int_value(b, a->minute);
        json_builder_set_member_name(b, "year");        json_builder_add_int_value(b, a->year);
        json_builder_set_member_name(b, "month");       json_builder_add_int_value(b, a->month);
        json_builder_set_member_name(b, "day");         json_builder_add_int_value(b, a->day);
        json_builder_set_member_name(b, "label");       json_builder_add_string_value(b, a->label);
        json_builder_set_member_name(b, "is_enabled");  json_builder_add_boolean_value(b, a->is_enabled);
        json_builder_set_member_name(b, "is_repeat");   json_builder_add_boolean_value(b, a->is_repeat);
        json_builder_set_member_name(b, "repeat_days"); json_builder_add_int_value(b, a->repeat_days);
        json_builder_end_object(b);
    }
    json_builder_end_array(b);

    /* World cities */
    json_builder_set_member_name(b, "world_cities");
    json_builder_begin_array(b);
    for (int i = 0; i < s->world_city_count; i++) {
        const WorldTimeCityDto *c = &s->world_cities[i];
        json_builder_begin_object(b);
        json_builder_set_member_name(b, "city");   json_builder_add_string_value(b, c->city);
        json_builder_set_member_name(b, "region"); json_builder_add_string_value(b, c->region);
        json_builder_set_member_name(b, "tz_id");  json_builder_add_string_value(b, c->tz_id);
        json_builder_end_object(b);
    }
    json_builder_end_array(b);

    /* Timers */
    json_builder_set_member_name(b, "timers");
    json_builder_begin_array(b);
    for (int i = 0; i < s->timer_count; i++) {
        const TimerDto *t = &s->timers[i];
        json_builder_begin_object(b);
        json_builder_set_member_name(b, "hours");   json_builder_add_int_value(b, t->hours);
        json_builder_set_member_name(b, "minutes"); json_builder_add_int_value(b, t->minutes);
        json_builder_set_member_name(b, "seconds"); json_builder_add_int_value(b, t->seconds);
        json_builder_set_member_name(b, "label");   json_builder_add_string_value(b, t->label);
        json_builder_end_object(b);
    }
    json_builder_end_array(b);

    /* Calendar events */
    json_builder_set_member_name(b, "events");
    json_builder_begin_array(b);
    for (int i = 0; i < s->event_count; i++) {
        const CalendarEvent *e = &s->events[i];
        json_builder_begin_object(b);
        json_builder_set_member_name(b, "id");          json_builder_add_string_value(b, e->id);
        json_builder_set_member_name(b, "title");       json_builder_add_string_value(b, e->title);
        json_builder_set_member_name(b, "start_year");  json_builder_add_int_value(b, e->start_year);
        json_builder_set_member_name(b, "start_month"); json_builder_add_int_value(b, e->start_month);
        json_builder_set_member_name(b, "start_day");   json_builder_add_int_value(b, e->start_day);
        json_builder_set_member_name(b, "start_hour");  json_builder_add_int_value(b, e->start_hour);
        json_builder_set_member_name(b, "start_min");   json_builder_add_int_value(b, e->start_minute);
        json_builder_set_member_name(b, "end_year");    json_builder_add_int_value(b, e->end_year);
        json_builder_set_member_name(b, "end_month");   json_builder_add_int_value(b, e->end_month);
        json_builder_set_member_name(b, "end_day");     json_builder_add_int_value(b, e->end_day);
        json_builder_set_member_name(b, "end_hour");    json_builder_add_int_value(b, e->end_hour);
        json_builder_set_member_name(b, "end_min");     json_builder_add_int_value(b, e->end_minute);
        json_builder_set_member_name(b, "is_all_day");  json_builder_add_boolean_value(b, e->is_all_day);
        json_builder_set_member_name(b, "location");    json_builder_add_string_value(b, e->location);
        json_builder_set_member_name(b, "memo");        json_builder_add_string_value(b, e->memo);
        json_builder_end_object(b);
    }
    json_builder_end_array(b);

    json_builder_end_object(b);

    JsonGenerator *gen = json_generator_new();
    json_generator_set_pretty(gen, TRUE);
    JsonNode *root = json_builder_get_root(b);
    json_generator_set_root(gen, root);

    gchar *path = get_settings_path();
    gchar *dir  = g_path_get_dirname(path);
    g_mkdir_with_parents(dir, 0755);
    g_free(dir);

    GError *err = NULL;
    json_generator_to_file(gen, path, &err);
    if (err) g_error_free(err);

    g_free(path);
    json_node_free(root);
    g_object_unref(gen);
    g_object_unref(b);
}

/* ── Autostart ──────────────────────────────────────────────────────────── */

gboolean settings_autostart_get(void)
{
    const gchar *cfg = g_get_user_config_dir();
    gchar *path = g_build_filename(cfg, "autostart", "myclock.desktop", NULL);
    gboolean exists = g_file_test(path, G_FILE_TEST_EXISTS);
    g_free(path);
    return exists;
}

void settings_autostart_set(gboolean enable)
{
    const gchar *cfg = g_get_user_config_dir();
    gchar *dir  = g_build_filename(cfg, "autostart", NULL);
    gchar *path = g_build_filename(dir, "myclock.desktop", NULL);

    if (enable) {
        g_mkdir_with_parents(dir, 0755);
        const char *exe = g_get_prgname();
        gchar *contents = g_strdup_printf(
            "[Desktop Entry]\n"
            "Type=Application\n"
            "Name=MyClock\n"
            "Exec=%s\n"
            "Hidden=false\n"
            "NoDisplay=false\n"
            "X-GNOME-Autostart-enabled=true\n",
            exe ? exe : "myclock");
        g_file_set_contents(path, contents, -1, NULL);
        g_free(contents);
    } else {
        g_unlink(path);
    }

    g_free(path);
    g_free(dir);
}
