#pragma once
#include <gtk/gtk.h>
#include <stdbool.h>

#define MAX_ALARMS        32
#define MAX_WORLD_CITIES  20
#define MAX_TIMERS         5
#define MAX_LAP_TIMES    100
#define MAX_CAL_EVENTS   256

/* ── Enumerations ───────────────────────────────────────────────────────── */

typedef enum {
    DIGITAL_STYLE_SEVEN_SEGMENT = 0,
    DIGITAL_STYLE_DOT_MATRIX,
    DIGITAL_STYLE_MINIMAL,
    DIGITAL_STYLE_LCD_TEXT,
    DIGITAL_STYLE_RETRO,
    DIGITAL_STYLE_NEON,
    DIGITAL_STYLE_KOREAN,
    DIGITAL_STYLE_MATRIX,
    DIGITAL_STYLE_VINTAGE,
    DIGITAL_STYLE_THIN,
    DIGITAL_STYLE_COUNT
} DigitalStyle;

typedef enum {
    ANALOG_STYLE_CLASSIC = 0,
    ANALOG_STYLE_MINIMAL,
    ANALOG_STYLE_ROMAN,
    ANALOG_STYLE_INDICES,
    ANALOG_STYLE_RAILROAD,
    ANALOG_STYLE_BAUHAUS,
    ANALOG_STYLE_DOTS,
    ANALOG_STYLE_AVIATOR,
    ANALOG_STYLE_NAUTICAL,
    ANALOG_STYLE_MODERN,
    ANALOG_STYLE_STEAMPUNK,
    ANALOG_STYLE_COUNT
} AnalogStyle;

typedef enum {
    THEME_DARK = 0,
    THEME_LIGHT,
    THEME_MIDNIGHT,
    THEME_OCEAN,
    THEME_RUBY,
    THEME_EMERALD,
    THEME_PURPLE,
    THEME_AMBER,
    THEME_ROSE,
    THEME_MONO,
    THEME_SUNSET,
    THEME_MINT,
    THEME_COUNT
} ThemeId;

typedef enum {
    TIMER_STATE_IDLE = 0,
    TIMER_STATE_RUNNING,
    TIMER_STATE_PAUSED,
} TimerRunState;

/* ── Data models ────────────────────────────────────────────────────────── */

typedef struct {
    char  id[37];
    int   hour;
    int   minute;
    /* Calendar alarm: year > 0 means one-shot date+time alarm */
    int   year;         /* 0 = time-only (recurring); >0 = specific date */
    int   month;        /* 1-12, used when year > 0 */
    int   day;          /* 1-31, used when year > 0 */
    char  label[128];
    bool  is_enabled;
    bool  is_repeat;
    int   repeat_days;  /* bitmask: bit0=Sun, bit1=Mon…bit6=Sat */
} AlarmItem;

typedef struct {
    char  id[37];
    char  title[128];
    int   start_year, start_month, start_day;
    int   start_hour, start_minute;
    int   end_year, end_month, end_day;
    int   end_hour, end_minute;
    bool  is_all_day;
    char  location[128];
    char  memo[512];
    char  color[8];   /* "#rrggbb" CSS hex; empty = default accent */
} CalendarEvent;

typedef struct {
    char  city[64];
    char  region[64];
    char  tz_id[64];    /* IANA timezone ID (e.g. "Asia/Seoul") */
    char  display_time[16];
} WorldTimeCityDto;

typedef struct {
    int   hours, minutes, seconds;
    char  label[128];
} TimerDto;

/* ── Timer service ──────────────────────────────────────────────────────── */

typedef struct TimerService TimerService;

struct TimerService {
    int           set_hours, set_minutes, set_seconds;
    char          label[128];
    TimerRunState state;
    gint64        start_us;   /* g_get_monotonic_time() when last started */
    gint64        remain_us;  /* remaining µs when paused */
    void         *user_data;
    void        (*on_complete)(TimerService *svc, void *user_data);
};

/* ── Stopwatch service ──────────────────────────────────────────────────── */

typedef struct {
    bool   is_running;
    gint64 start_us;
    gint64 elapsed_us;  /* accumulated elapsed before last pause */
    gint64 lap_times_us[MAX_LAP_TIMES];
    int    lap_count;
} StopwatchService;

/* ── Application settings (persisted to JSON) ───────────────────────────── */

typedef struct {
    /* Window geometry */
    double window_x, window_y, window_w, window_h;
    double digital_x, digital_y, digital_w, digital_h;
    bool   digital_pos_saved;
    double analog_x,  analog_y,  analog_w,  analog_h;
    bool   analog_pos_saved;

    /* Clock mode */
    bool        is_digital;
    bool        use24h;
    bool        world_use24h;
    bool        always_on_top;

    /* Styles */
    DigitalStyle digital_style;
    AnalogStyle  analog_style;
    ThemeId      theme;

    /* Colors (linear 0-1) */
    double digit_r, digit_g, digit_b;
    double ampm_r,  ampm_g,  ampm_b;
    double brightness;

    /* Alarms */
    AlarmItem alarms[MAX_ALARMS];
    int       alarm_count;

    /* World cities */
    WorldTimeCityDto world_cities[MAX_WORLD_CITIES];
    int              world_city_count;

    /* Timers */
    TimerDto timers[MAX_TIMERS];
    int      timer_count;

    /* Sound */
    int  alarm_volume;  /* 0-100 */

    /* Calendar events */
    CalendarEvent events[MAX_CAL_EVENTS];
    int           event_count;
} AppSettings;

/* ── Forward declarations ───────────────────────────────────────────────── */

typedef struct AppState AppState;

/* ── Application state (live runtime) ──────────────────────────────────── */

struct AppState {
    GtkApplication *app;

    /* Persisted config */
    AppSettings     settings;

    /* Live timer state */
    TimerService    timers[MAX_TIMERS];

    /* Live stopwatch */
    StopwatchService stopwatch;

    /* UI – main window */
    GtkWidget *main_window;
    GtkWidget *clock_stack;       /* GtkStack: "digital" | "analog" */
    GtkWidget *seven_seg_area;
    GtkWidget *dot_matrix_area;
    GtkWidget *text_time_label;
    GtkWidget *ampm_label_seg;    /* AM/PM label for seg/dot modes */
    GtkWidget *ampm_label_text;   /* AM/PM label for text modes */
    GtkWidget *analog_area;
    GtkWidget *ampm_label_analog;  /* AM/PM at top of analog page */
    GtkWidget *date_label_digital; /* date at bottom of digital page */
    GtkWidget *date_label_analog;  /* date at bottom of analog page */
    GtkWidget *header_label;
    GtkWidget *status_label;
    GtkWidget *chrome_box;        /* revealed on hover */

    /* UI – side panel */
    GtkWidget *side_panel;
    GtkWidget *world_list;        /* GtkListBox */
    GtkWidget *alarm_list;        /* GtkListBox */

    /* CSS theming */
    GtkCssProvider *theme_provider;
    GtkCssProvider *color_provider;
    GtkCssProvider *font_provider;

    /* GLib timer source */
    guint tick_source;

    /* Chrome (title bar area) hide timer */
    guint  chrome_hide_source;
    bool   chrome_visible;

    /* Drag-to-move state */
    bool   dragging;
    double drag_start_x, drag_start_y;
    double win_start_x,  win_start_y;

    /* Alarm fire tracking (key = alarm id string) */
    GHashTable *fired_alarms;

    /* Side panel state */
    bool   side_open;

    /* Hover state (used to show/hide clock border) */
    bool   is_hovered;

    /* Resize hint state: TRUE when mouse is over a resize edge */
    bool   is_resize_hint;

    /* Overlay drawing area for resize silhouette */
    GtkWidget *resize_overlay;

    /* Custom resize state (X11 only) */
    bool  manual_resizing;
    int   resize_edge_type;
    int   resize_start_abs_x;
    int   resize_start_abs_y;
    int   resize_start_win_x;
    int   resize_start_win_y;
    int   resize_start_win_w;
    int   resize_start_win_h;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

static inline const char *digital_style_name(DigitalStyle s) {
    static const char *names[] = {
        "SevenSegment","DotMatrix","Minimal","LcdText",
        "Retro","Neon","Korean","Matrix","Vintage","Thin"
    };
    return (s < DIGITAL_STYLE_COUNT) ? names[s] : "SevenSegment";
}

static inline DigitalStyle digital_style_from_name(const char *name) {
    if (!name) return DIGITAL_STYLE_SEVEN_SEGMENT;
    const char *names[] = {
        "SevenSegment","DotMatrix","Minimal","LcdText",
        "Retro","Neon","Korean","Matrix","Vintage","Thin"
    };
    for (int i = 0; i < DIGITAL_STYLE_COUNT; i++)
        if (g_strcmp0(name, names[i]) == 0) return (DigitalStyle)i;
    return DIGITAL_STYLE_SEVEN_SEGMENT;
}

static inline const char *analog_style_name(AnalogStyle s) {
    static const char *names[] = {
        "Classic","Minimal","Roman","Indices","Railroad",
        "Bauhaus","Dots","Aviator","Nautical","Modern","Steampunk"
    };
    return (s < ANALOG_STYLE_COUNT) ? names[s] : "Classic";
}

static inline AnalogStyle analog_style_from_name(const char *name) {
    if (!name) return ANALOG_STYLE_CLASSIC;
    const char *names[] = {
        "Classic","Minimal","Roman","Indices","Railroad",
        "Bauhaus","Dots","Aviator","Nautical","Modern","Steampunk"
    };
    for (int i = 0; i < ANALOG_STYLE_COUNT; i++)
        if (g_strcmp0(name, names[i]) == 0) return (AnalogStyle)i;
    return ANALOG_STYLE_CLASSIC;
}

static inline const char *theme_name(ThemeId t) {
    static const char *names[] = {
        "dark","light","midnight","ocean","ruby","emerald",
        "purple","amber","rose","mono","sunset","mint"
    };
    return (t < THEME_COUNT) ? names[t] : "dark";
}

static inline ThemeId theme_from_name(const char *name) {
    if (!name) return THEME_DARK;
    const char *names[] = {
        "dark","light","midnight","ocean","ruby","emerald",
        "purple","amber","rose","mono","sunset","mint"
    };
    for (int i = 0; i < THEME_COUNT; i++)
        if (g_strcmp0(name, names[i]) == 0) return (ThemeId)i;
    return THEME_DARK;
}
