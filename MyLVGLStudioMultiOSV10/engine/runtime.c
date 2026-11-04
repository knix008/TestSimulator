/*
 * The design engine: a thin, version-independent command layer over LVGL. JavaScript
 * replays the operations from src/lvgl/emit.js through these functions, and
 * src/lvgl/codegen.js prints the same operations as C, so the design surface and the
 * generated firmware code draw the same screens.
 *
 * The numeric ids below are mirrored by PROP_IDS, STR_IDS, TYPE_IDS, TRIGGER_IDS and
 * ACTION_IDS in src/lvgl/schema.js.
 */
#define LV_USE_PRIVATE_API 1 /* 9.6 keeps the image cache functions behind this. */
#include "lvgl.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if LVGL_VERSION_MAJOR < 9
#define lv_obj_remove_flag lv_obj_clear_flag
#define lv_obj_remove_state lv_obj_clear_state
#define lv_obj_delete lv_obj_del
#define lv_screen_load lv_scr_load
#define lv_screen_active lv_scr_act
#define lv_button_create lv_btn_create
#define lv_display_set_theme lv_disp_set_theme
#define lv_display_t lv_disp_t
#define lv_image_create lv_img_create
#define lv_image_set_src lv_img_set_src
#define lv_image_set_rotation lv_img_set_angle
#define lv_image_set_scale lv_img_set_zoom
#define lv_buttonmatrix_create lv_btnmatrix_create
#define lv_buttonmatrix_set_map lv_btnmatrix_set_map
#define lv_table_set_row_count lv_table_set_row_cnt
#define lv_table_set_column_count lv_table_set_col_cnt
#define lv_table_set_column_width lv_table_set_col_width
#define lv_list_add_button lv_list_add_btn
#define lv_imagebutton_create lv_imgbtn_create
#define lv_imagebutton_set_src lv_imgbtn_set_src
#define LV_IMAGEBUTTON_STATE_RELEASED LV_IMGBTN_STATE_RELEASED
#define ml_table_columns lv_table_get_col_cnt
typedef lv_coord_t ml_track_t;
typedef lv_point_t ml_point_t;
typedef lv_img_dsc_t ml_image_t;
#else
#define ml_table_columns lv_table_get_column_count
typedef int32_t ml_track_t;
typedef lv_point_precise_t ml_point_t;
typedef lv_image_dsc_t ml_image_t;
#endif

/* Arc Label arrived in 9.4. */
#define ML_HAS_ARCLABEL (LVGL_VERSION_MAJOR == 9 && LVGL_VERSION_MINOR >= 4)

/* 9.3 renamed these two. */
#if LVGL_VERSION_MAJOR == 9 && LVGL_VERSION_MINOR >= 3
#define ml_chart_range lv_chart_set_axis_range
#define ml_calendar_month lv_calendar_set_month_shown
#define ml_span_new lv_spangroup_add_span
#else
#define ml_span_new lv_spangroup_new_span
#define ml_chart_range lv_chart_set_range
#define ml_calendar_month lv_calendar_set_showed_date
#endif

#define MAX_OBJECTS 4096
#define LOG_LINES 32
#define LOG_WIDTH 256
#define MAX_IMAGES 256

typedef struct action {
    struct action * next;
    int kind;
    int target;
    char * text;
} action_t;

static lv_display_t * display;
static lv_indev_t * pointer;
static lv_obj_t * blank;
static uint8_t * framebuffer;
static int dirty;

static lv_obj_t * objects[MAX_OBJECTS];
static lv_obj_t * inner_labels[MAX_OBJECTS];
static int object_types[MAX_OBJECTS];
static int object_roots[MAX_OBJECTS];
static action_t * actions;
static ml_image_t images[MAX_IMAGES];
static int next_qr_size = 100;
#if LVGL_VERSION_MAJOR < 9
static lv_meter_scale_t * meter_scales[MAX_OBJECTS];
static lv_meter_indicator_t * meter_needles[MAX_OBJECTS];
#endif

/* Memory widgets keep pointing at (line points, button maps); freed with the objects. */
typedef struct kept {
    struct kept * next;
    void * data;
} kept_t;
static kept_t * kept_blocks;

static void * keep(void * data)
{
    kept_t * block = malloc(sizeof(kept_t));
    block->data = data;
    block->next = kept_blocks;
    kept_blocks = block;
    return data;
}

static void free_kept(void)
{
    while(kept_blocks) {
        kept_t * next = kept_blocks->next;
        free(kept_blocks->data);
        free(kept_blocks);
        kept_blocks = next;
    }
}

static char log_lines[LOG_LINES][LOG_WIDTH];
static unsigned log_head, log_tail;

/* Pointer input is queued so a press and release between two reads are both seen. */
#define INPUT_SLOTS 64
static struct { int x, y, down; } input_queue[INPUT_SLOTS];
static unsigned input_head, input_tail;
static int last_x, last_y, last_down;

enum { T_SCREEN = 0, T_CONTAINER, T_LABEL, T_BUTTON, T_CHECKBOX, T_SWITCH, T_SLIDER, T_BAR, T_ARC,
       T_DROPDOWN, T_ROLLER, T_TEXTAREA, T_SPINNER, T_LED, T_IMAGE, T_LINE, T_LIST, T_TABLE, T_CHART,
       T_TABVIEW, T_KEYBOARD, T_CALENDAR, T_SPINBOX, T_BUTTONMATRIX, T_IMAGEBUTTON, T_ANIMIMAGE, T_CANVAS, T_MSGBOX,
       T_WIN, T_TILEVIEW, T_MENU, T_SPAN, T_COLORWHEEL, T_METER, T_SCALE, T_QRCODE, T_BARCODE, T_ARCLABEL, T_GRID };

enum { P_X = 1, P_Y, P_WIDTH, P_HEIGHT, P_WIDTH_PCT, P_HEIGHT_PCT, P_WIDTH_CONTENT, P_HEIGHT_CONTENT,
       P_ALIGN, P_HIDDEN, P_CLICKABLE, P_SCROLLABLE, P_CHECKED, P_DISABLED,
       P_BG_COLOR = 20, P_BG_OPA, P_BORDER_COLOR, P_BORDER_WIDTH, P_RADIUS, P_TEXT_COLOR, P_FONT, P_PAD,
       P_SHADOW_WIDTH, P_SHADOW_COLOR, P_OPA, P_GAP, P_INDICATOR_COLOR, P_FLEX_FLOW,
       P_VALUE = 42, P_SELECTED, P_LED_BRIGHT, P_ROTATION, P_SCALE, P_LINE_COLOR, P_LINE_WIDTH, P_COLUMN_WIDTH,
       P_CHART_TYPE, P_IMAGE, P_SCALE_MODE, P_TOTAL_TICKS, P_MAJOR_EVERY, P_DURATION };

enum { S_TEXT = 1, S_PLACEHOLDER, S_OPTIONS, S_ITEMS, S_CELLS, S_SERIES, S_TABS, S_MAP, S_POINTS, S_TITLE, S_BUTTONS, S_TILES, S_MENU_ITEMS, S_SPANS, S_FRAMES };
enum { A_SCREEN = 1, A_SET_TEXT, A_TOGGLE, A_LOG, A_SHOW, A_HIDE };
enum { TR_CLICKED = 0, TR_PRESSED, TR_RELEASED, TR_VALUE_CHANGED };

static const lv_align_t ALIGNS[] = {
    LV_ALIGN_DEFAULT, LV_ALIGN_TOP_LEFT, LV_ALIGN_TOP_MID, LV_ALIGN_TOP_RIGHT, LV_ALIGN_BOTTOM_LEFT,
    LV_ALIGN_BOTTOM_MID, LV_ALIGN_BOTTOM_RIGHT, LV_ALIGN_LEFT_MID, LV_ALIGN_RIGHT_MID, LV_ALIGN_CENTER,
};

static const lv_flex_flow_t FLOWS[] = {
    LV_FLEX_FLOW_ROW, LV_FLEX_FLOW_COLUMN, LV_FLEX_FLOW_ROW_WRAP, LV_FLEX_FLOW_COLUMN_WRAP,
};

/* ---------------------------------------------------------------- display */

#if LVGL_VERSION_MAJOR >= 9
static void flush_cb(lv_display_t * disp, const lv_area_t * area, uint8_t * pixels)
{
    LV_UNUSED(area);
    LV_UNUSED(pixels);
    dirty = 1;
    lv_display_flush_ready(disp);
}
static void read_cb(lv_indev_t * indev, lv_indev_data_t * data)
{
    LV_UNUSED(indev);
#else
static lv_disp_draw_buf_t draw_buf;
static lv_disp_drv_t disp_drv;
static lv_indev_drv_t indev_drv;
static void flush_cb(lv_disp_drv_t * drv, const lv_area_t * area, lv_color_t * pixels)
{
    LV_UNUSED(area);
    LV_UNUSED(pixels);
    dirty = 1;
    lv_disp_flush_ready(drv);
}
static void read_cb(lv_indev_drv_t * drv, lv_indev_data_t * data)
{
    LV_UNUSED(drv);
#endif
    if(input_tail != input_head) {
        last_x = input_queue[input_tail].x;
        last_y = input_queue[input_tail].y;
        last_down = input_queue[input_tail].down;
        input_tail = (input_tail + 1) % INPUT_SLOTS;
    }
    data->point.x = last_x;
    data->point.y = last_y;
    data->state = last_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    data->continue_reading = input_tail != input_head;
}

static void free_actions(void)
{
    while(actions) {
        action_t * next = actions->next;
        free(actions->text);
        free(actions);
        actions = next;
    }
}

/* Removes every designed object; the display and its blank screen stay. */
void ml_clear(void)
{
    if(blank) lv_screen_load(blank);
    for(int i = 0; i < MAX_OBJECTS; i++) {
        if(objects[i] && object_roots[i]) lv_obj_delete(objects[i]);
    }
    memset(objects, 0, sizeof(objects));
    memset(inner_labels, 0, sizeof(inner_labels));
    memset(object_types, 0, sizeof(object_types));
    memset(object_roots, 0, sizeof(object_roots));
    free_actions();
    /* LVGL remembers decoded pictures by address, and these buffers are about to be freed. */
#if LVGL_VERSION_MAJOR >= 9
    lv_image_cache_drop(NULL);
    lv_image_header_cache_drop(NULL);
#else
    lv_img_cache_invalidate_src(NULL);
#endif
    free_kept();
    log_head = log_tail = 0;
    input_head = input_tail = 0;
    last_down = 0;
}

/* (Re)creates the display in the project's resolution. */
void ml_setup(int width, int height)
{
    static int initialised;
    if(!initialised) {
        lv_init();
        initialised = 1;
    }
    ml_clear();
#if LVGL_VERSION_MAJOR >= 9
    if(pointer) lv_indev_delete(pointer);
    if(display) lv_display_delete(display);
#else
    if(pointer) lv_indev_delete(pointer);
    if(display) {
        lv_obj_del(blank);
        lv_disp_remove(display);
    }
#endif
    free(framebuffer);
    framebuffer = calloc((size_t)width * height, 4);
#if LVGL_VERSION_MAJOR >= 9
    display = lv_display_create(width, height);
    lv_display_set_flush_cb(display, flush_cb);
    lv_display_set_buffers(display, framebuffer, NULL, (uint32_t)width * height * 4, LV_DISPLAY_RENDER_MODE_DIRECT);
    pointer = lv_indev_create();
    lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(pointer, read_cb);
    lv_indev_set_display(pointer, display);
#else
    lv_disp_draw_buf_init(&draw_buf, framebuffer, NULL, (uint32_t)width * height);
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res = (lv_coord_t)width;
    disp_drv.ver_res = (lv_coord_t)height;
    disp_drv.flush_cb = flush_cb;
    disp_drv.draw_buf = &draw_buf;
    disp_drv.direct_mode = 1;
    display = lv_disp_drv_register(&disp_drv);
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = read_cb;
    indev_drv.disp = display;
    pointer = lv_indev_drv_register(&indev_drv);
#endif
    blank = lv_screen_active();
}

void ml_theme(int dark, int primary, int secondary)
{
    lv_theme_t * theme = lv_theme_default_init(display, lv_color_hex((uint32_t)primary), lv_color_hex((uint32_t)secondary),
                                               dark != 0, LV_FONT_DEFAULT);
    lv_display_set_theme(display, theme);
}

/* ---------------------------------------------------------------- objects */

int ml_create(int id, int type, int parent)
{
    if(id < 0 || id >= MAX_OBJECTS) return -1;
    lv_obj_t * host = parent >= 0 ? objects[parent] : NULL;
    lv_obj_t * obj = NULL;
    switch(type) {
        case T_SCREEN: obj = lv_obj_create(NULL); break;
        case T_CONTAINER: obj = lv_obj_create(host); break;
        case T_LABEL: obj = lv_label_create(host); break;
        case T_BUTTON:
            obj = lv_button_create(host);
            inner_labels[id] = lv_label_create(obj);
            lv_obj_center(inner_labels[id]);
            break;
        case T_CHECKBOX: obj = lv_checkbox_create(host); break;
        case T_SWITCH: obj = lv_switch_create(host); break;
        case T_SLIDER: obj = lv_slider_create(host); break;
        case T_BAR: obj = lv_bar_create(host); break;
        case T_ARC: obj = lv_arc_create(host); break;
        case T_DROPDOWN: obj = lv_dropdown_create(host); break;
        case T_ROLLER: obj = lv_roller_create(host); break;
        case T_TEXTAREA: obj = lv_textarea_create(host); break;
#if LVGL_VERSION_MAJOR >= 9
        case T_SPINNER: obj = lv_spinner_create(host); break;
#else
        case T_SPINNER: obj = lv_spinner_create(host, 1000, 60); break;
#endif
        case T_LED: obj = lv_led_create(host); break;
        case T_IMAGE: obj = lv_image_create(host); break;
        case T_LINE: obj = lv_line_create(host); break;
        case T_LIST: obj = lv_list_create(host); break;
        case T_TABLE: obj = lv_table_create(host); break;
        case T_CHART: obj = lv_chart_create(host); break;
#if LVGL_VERSION_MAJOR >= 9
        case T_TABVIEW: obj = lv_tabview_create(host); break;
#else
        case T_TABVIEW: obj = lv_tabview_create(host, LV_DIR_TOP, 40); break;
#endif
        case T_KEYBOARD: obj = lv_keyboard_create(host); break;
        case T_CALENDAR: obj = lv_calendar_create(host); break;
        case T_SPINBOX: obj = lv_spinbox_create(host); break;
        case T_BUTTONMATRIX: obj = lv_buttonmatrix_create(host); break;
        case T_IMAGEBUTTON: obj = lv_imagebutton_create(host); break;
        case T_ANIMIMAGE: obj = lv_animimg_create(host); break;
        case T_CANVAS: obj = lv_canvas_create(host); break;
        case T_TILEVIEW: obj = lv_tileview_create(host); break;
        case T_MENU: obj = lv_menu_create(host); break;
        case T_SPAN: obj = lv_spangroup_create(host); break;
        case T_GRID: obj = lv_obj_create(host); break;
#if LVGL_VERSION_MAJOR >= 9
        case T_MSGBOX: obj = lv_msgbox_create(host); break;
        case T_WIN:
            obj = lv_win_create(host);
            inner_labels[id] = lv_label_create(lv_win_get_content(obj));
            break;
        case T_SCALE:
            obj = lv_scale_create(host);
            lv_scale_set_label_show(obj, true);
            break;
        case T_QRCODE:
            obj = lv_qrcode_create(host);
            lv_qrcode_set_size(obj, next_qr_size);
            break;
        case T_BARCODE: obj = lv_barcode_create(host); break;
#if ML_HAS_ARCLABEL
        case T_ARCLABEL:
            obj = lv_arclabel_create(host);
            lv_arclabel_set_angle_start(obj, 180);
            lv_arclabel_set_angle_size(obj, 270);
            lv_arclabel_set_radius(obj, LV_PCT(100));
            break;
#endif
#else
        case T_MSGBOX: {
            static const char * no_buttons[] = { "" };
            obj = lv_msgbox_create(host, " ", " ", no_buttons, false);
            break;
        }
        case T_WIN:
            obj = lv_win_create(host, 40);
            inner_labels[id] = lv_label_create(lv_win_get_content(obj));
            break;
        case T_COLORWHEEL: obj = lv_colorwheel_create(host, true); break;
        case T_METER:
            obj = lv_meter_create(host);
            meter_scales[id] = lv_meter_add_scale(obj);
            lv_meter_set_scale_ticks(obj, meter_scales[id], 41, 2, 10, lv_palette_main(LV_PALETTE_GREY));
            lv_meter_set_scale_major_ticks(obj, meter_scales[id], 8, 4, 15, lv_color_black(), 10);
            meter_needles[id] = lv_meter_add_needle_line(obj, meter_scales[id], 4, lv_palette_main(LV_PALETTE_RED), -10);
            break;
        case T_QRCODE: obj = lv_qrcode_create(host, next_qr_size, lv_color_black(), lv_color_white()); break;
#endif
        default: return -1;
    }
    objects[id] = obj;
    object_types[id] = type;
    object_roots[id] = type == T_SCREEN;
    return 0;
}

static const lv_font_t * font_for(int size)
{
    switch(size) {
        case 12: return &lv_font_montserrat_12;
        case 14: return &lv_font_montserrat_14;
        case 16: return &lv_font_montserrat_16;
        case 18: return &lv_font_montserrat_18;
        case 20: return &lv_font_montserrat_20;
        case 24: return &lv_font_montserrat_24;
        case 28: return &lv_font_montserrat_28;
        case 32: return &lv_font_montserrat_32;
        case 36: return &lv_font_montserrat_36;
        case 48: return &lv_font_montserrat_48;
        default: return NULL;
    }
}

static void set_flag(lv_obj_t * obj, lv_obj_flag_t flag, int on)
{
    if(on) lv_obj_add_flag(obj, flag);
    else lv_obj_remove_flag(obj, flag);
}

static void set_state(lv_obj_t * obj, lv_state_t state, int on)
{
    if(on) lv_obj_add_state(obj, state);
    else lv_obj_remove_state(obj, state);
}

int ml_range(int id, int min, int max)
{
    lv_obj_t * obj = objects[id];
    switch(object_types[id]) {
        case T_SLIDER: lv_slider_set_range(obj, min, max); return 0;
        case T_BAR: lv_bar_set_range(obj, min, max); return 0;
        case T_ARC: lv_arc_set_range(obj, min, max); return 0;
        case T_CHART: ml_chart_range(obj, LV_CHART_AXIS_PRIMARY_Y, min, max); return 0;
        case T_SPINBOX: lv_spinbox_set_range(obj, min, max); return 0;
#if LVGL_VERSION_MAJOR >= 9
        case T_SCALE: lv_scale_set_range(obj, min, max); return 0;
#else
        case T_METER: lv_meter_set_scale_range(obj, meter_scales[id], min, max, 270, 135); return 0;
#endif
        default: return -1;
    }
}

int ml_set_i(int id, int prop, int value)
{
    lv_obj_t * obj = objects[id];
    if(!obj) return -1;
    switch(prop) {
        case P_X: lv_obj_set_x(obj, value); return 0;
        case P_Y: lv_obj_set_y(obj, value); return 0;
        case P_WIDTH: lv_obj_set_width(obj, value); return 0;
        case P_HEIGHT: lv_obj_set_height(obj, value); return 0;
        case P_WIDTH_PCT: lv_obj_set_width(obj, lv_pct(value)); return 0;
        case P_HEIGHT_PCT: lv_obj_set_height(obj, lv_pct(value)); return 0;
        case P_WIDTH_CONTENT: lv_obj_set_width(obj, LV_SIZE_CONTENT); return 0;
        case P_HEIGHT_CONTENT: lv_obj_set_height(obj, LV_SIZE_CONTENT); return 0;
        case P_ALIGN: lv_obj_set_align(obj, ALIGNS[value]); return 0;
        case P_HIDDEN: set_flag(obj, LV_OBJ_FLAG_HIDDEN, value); return 0;
        case P_CLICKABLE: set_flag(obj, LV_OBJ_FLAG_CLICKABLE, value); return 0;
        case P_SCROLLABLE: set_flag(obj, LV_OBJ_FLAG_SCROLLABLE, value); return 0;
        case P_CHECKED: set_state(obj, LV_STATE_CHECKED, value); return 0;
        case P_DISABLED: set_state(obj, LV_STATE_DISABLED, value); return 0;
        case P_BG_COLOR: lv_obj_set_style_bg_color(obj, lv_color_hex((uint32_t)value), 0); return 0;
        case P_BG_OPA: lv_obj_set_style_bg_opa(obj, (lv_opa_t)value, 0); return 0;
        case P_BORDER_COLOR: lv_obj_set_style_border_color(obj, lv_color_hex((uint32_t)value), 0); return 0;
        case P_BORDER_WIDTH: lv_obj_set_style_border_width(obj, value, 0); return 0;
        case P_RADIUS: lv_obj_set_style_radius(obj, value, 0); return 0;
        case P_TEXT_COLOR: lv_obj_set_style_text_color(obj, lv_color_hex((uint32_t)value), 0); return 0;
        case P_FONT: {
            const lv_font_t * font = font_for(value);
            if(!font) return -1;
            lv_obj_set_style_text_font(obj, font, 0);
            return 0;
        }
        case P_PAD: lv_obj_set_style_pad_all(obj, value, 0); return 0;
        case P_SHADOW_WIDTH: lv_obj_set_style_shadow_width(obj, value, 0); return 0;
        case P_SHADOW_COLOR: lv_obj_set_style_shadow_color(obj, lv_color_hex((uint32_t)value), 0); return 0;
        case P_OPA: lv_obj_set_style_opa(obj, (lv_opa_t)value, 0); return 0;
        case P_GAP: lv_obj_set_style_pad_gap(obj, value, 0); return 0;
        case P_INDICATOR_COLOR:
            /* A switch only shows its indicator colour when on, and the theme styles that state. */
            lv_obj_set_style_bg_color(obj, lv_color_hex((uint32_t)value),
                                      object_types[id] == T_SWITCH ? (LV_PART_INDICATOR | LV_STATE_CHECKED) : LV_PART_INDICATOR);
            return 0;
        case P_FLEX_FLOW: lv_obj_set_flex_flow(obj, FLOWS[value]); return 0;
        case P_VALUE:
            switch(object_types[id]) {
                case T_SLIDER: lv_slider_set_value(obj, value, LV_ANIM_OFF); return 0;
                case T_BAR: lv_bar_set_value(obj, value, LV_ANIM_OFF); return 0;
                case T_ARC: lv_arc_set_value(obj, value); return 0;
                case T_SPINBOX: lv_spinbox_set_value(obj, value); return 0;
#if LVGL_VERSION_MAJOR < 9
                case T_METER: lv_meter_set_indicator_value(obj, meter_needles[id], value); return 0;
#endif
                default: return -1;
            }
        case P_SELECTED:
            switch(object_types[id]) {
                case T_DROPDOWN: lv_dropdown_set_selected(obj, value); return 0;
                case T_ROLLER: lv_roller_set_selected(obj, value, LV_ANIM_OFF); return 0;
                default: return -1;
            }
        case P_LED_BRIGHT: lv_led_set_brightness(obj, (uint8_t)value); return 0;
        case P_ROTATION: lv_image_set_rotation(obj, value); return 0;
        case P_SCALE: lv_image_set_scale(obj, value); return 0;
        case P_LINE_COLOR: lv_obj_set_style_line_color(obj, lv_color_hex((uint32_t)value), 0); return 0;
        case P_LINE_WIDTH: lv_obj_set_style_line_width(obj, value, 0); return 0;
        case P_COLUMN_WIDTH: {
            uint32_t columns = ml_table_columns(obj);
            for(uint32_t c = 0; c < columns; c++) lv_table_set_column_width(obj, c, value);
            return 0;
        }
        case P_CHART_TYPE: lv_chart_set_type(obj, value ? LV_CHART_TYPE_BAR : LV_CHART_TYPE_LINE); return 0;
        case P_IMAGE:
            if(value < 0 || value >= MAX_IMAGES) return -1;
            if(object_types[id] == T_IMAGEBUTTON) lv_imagebutton_set_src(obj, LV_IMAGEBUTTON_STATE_RELEASED, NULL, &images[value], NULL);
            else lv_image_set_src(obj, &images[value]);
            return 0;
#if LVGL_VERSION_MAJOR >= 9
        case P_SCALE_MODE: lv_scale_set_mode(obj, value ? LV_SCALE_MODE_ROUND_INNER : LV_SCALE_MODE_HORIZONTAL_BOTTOM); return 0;
        case P_TOTAL_TICKS: lv_scale_set_total_tick_count(obj, value); return 0;
        case P_MAJOR_EVERY: lv_scale_set_major_tick_every(obj, value); return 0;
#endif
        case P_DURATION:
            lv_animimg_set_duration(obj, value);
            lv_animimg_set_repeat_count(obj, LV_ANIM_REPEAT_INFINITE);
            lv_animimg_start(obj);
            return 0;
        default: return -1;
    }
}

static const uint32_t SERIES_COLORS[] = { 0x2196f3, 0xf44336, 0x4caf50, 0xff9800 };

/* A writable copy that lives as long as the objects, for splitting in place. */
static char * kept_copy(const char * text)
{
    return keep(strdup(text));
}

static int count_char(const char * text, char c)
{
    int n = 0;
    for(; *text; text++) if(*text == c) n++;
    return n;
}

static void set_items(lv_obj_t * obj, const char * text)
{
    char * copy = strdup(text);
    for(char * line = copy; line;) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        if(line[0] == '#') lv_list_add_text(obj, line + 1);
        else lv_list_add_button(obj, NULL, line);
        line = end ? end + 1 : NULL;
    }
    free(copy);
}

static void set_cells(lv_obj_t * obj, const char * text)
{
    char * copy = strdup(text);
    int rows = count_char(copy, '\n') + 1;
    int columns = 1;
    for(char * line = copy; line;) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        int here = count_char(line, ',') + 1;
        if(here > columns) columns = here;
        if(end) *end = '\n';
        line = end ? end + 1 : NULL;
    }
    lv_table_set_row_count(obj, rows);
    lv_table_set_column_count(obj, columns);
    int row = 0;
    for(char * line = copy; line; row++) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        int column = 0;
        for(char * cell = line; cell; column++) {
            char * comma = strchr(cell, ',');
            if(comma) *comma = 0;
            lv_table_set_cell_value(obj, row, column, cell);
            cell = comma ? comma + 1 : NULL;
        }
        line = end ? end + 1 : NULL;
    }
    free(copy);
}

static void set_series(lv_obj_t * obj, const char * text)
{
    char * copy = strdup(text);
    int points = 1;
    for(char * line = copy; line;) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        int here = count_char(line, ',') + 1;
        if(here > points) points = here;
        if(end) *end = '\n';
        line = end ? end + 1 : NULL;
    }
    lv_chart_set_point_count(obj, points);
    int index = 0;
    for(char * line = copy; line; index++) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        lv_chart_series_t * series = lv_chart_add_series(obj, lv_color_hex(SERIES_COLORS[index % 4]), LV_CHART_AXIS_PRIMARY_Y);
        for(char * value = line; value;) {
            char * comma = strchr(value, ',');
            if(comma) *comma = 0;
            lv_chart_set_next_value(obj, series, atoi(value));
            value = comma ? comma + 1 : NULL;
        }
        line = end ? end + 1 : NULL;
    }
    free(copy);
}

static void set_tabs(lv_obj_t * obj, const char * text)
{
    char * copy = strdup(text);
    for(char * line = copy; line;) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        lv_obj_t * page = lv_tabview_add_tab(obj, line);
        lv_label_set_text(lv_label_create(page), line);
        line = end ? end + 1 : NULL;
    }
    free(copy);
}

static void set_map(lv_obj_t * obj, const char * text)
{
    char * copy = kept_copy(text);
    int slots = count_char(copy, ',') + count_char(copy, '\n') * 2 + 3;
    const char ** map = keep(calloc(slots, sizeof(char *)));
    int at = 0;
    for(char * line = copy; line;) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        for(char * cell = line; cell;) {
            char * comma = strchr(cell, ',');
            if(comma) *comma = 0;
            map[at++] = cell;
            cell = comma ? comma + 1 : NULL;
        }
        if(end) map[at++] = "\n";
        line = end ? end + 1 : NULL;
    }
    map[at] = "";
    lv_buttonmatrix_set_map(obj, map);
}

static void set_points(lv_obj_t * obj, const char * text)
{
    int count = count_char(text, ' ') + 1;
    ml_point_t * points = keep(calloc(count, sizeof(ml_point_t)));
    const char * cursor = text;
    for(int i = 0; i < count; i++) {
        char * after;
        points[i].x = strtol(cursor, &after, 10);
        cursor = *after == ',' ? after + 1 : after;
        points[i].y = strtol(cursor, &after, 10);
        cursor = *after == ' ' ? after + 1 : after;
    }
    lv_line_set_points(obj, points, count);
}

static void set_lines(lv_obj_t * obj, const char * text, void (*add)(lv_obj_t *, const char *, int))
{
    char * copy = strdup(text);
    int index = 0;
    for(char * line = copy; line; index++) {
        char * end = strchr(line, '\n');
        if(end) *end = 0;
        add(obj, line, index);
        line = end ? end + 1 : NULL;
    }
    free(copy);
}

static void add_tile(lv_obj_t * obj, const char * line, int index)
{
    lv_label_set_text(lv_label_create(lv_tileview_add_tile(obj, index, 0, LV_DIR_HOR)), line);
}

static lv_obj_t * menu_page;

static void add_menu_item(lv_obj_t * obj, const char * line, int index)
{
    LV_UNUSED(obj);
    LV_UNUSED(index);
    lv_label_set_text(lv_label_create(lv_menu_cont_create(menu_page)), line);
}

static void add_span(lv_obj_t * obj, const char * line, int index)
{
    LV_UNUSED(index);
    lv_span_set_text(ml_span_new(obj), line);
}

/* Comma separated image indexes; the first shows until the animation starts. */
static void set_frames(lv_obj_t * obj, const char * text)
{
    int count = count_char(text, ',') + 1;
    const void ** frames = keep(calloc(count, sizeof(void *)));
    const char * cursor = text;
    for(int i = 0; i < count; i++) {
        char * after;
        frames[i] = &images[strtol(cursor, &after, 10)];
        cursor = *after == ',' ? after + 1 : after;
    }
    lv_image_set_src(obj, frames[0]);
    lv_animimg_set_src(obj, frames, count);
}

static int apply_text(int id, const char * text)
{
    lv_obj_t * obj = objects[id];
    if(!obj) return -1;
    switch(object_types[id]) {
        case T_LABEL: lv_label_set_text(obj, text); return 0;
        case T_BUTTON: lv_label_set_text(inner_labels[id], text); return 0;
        case T_CHECKBOX: lv_checkbox_set_text(obj, text); return 0;
        case T_TEXTAREA: lv_textarea_set_text(obj, text); return 0;
        case T_WIN: lv_label_set_text(inner_labels[id], text); return 0;
        case T_QRCODE: lv_qrcode_update(obj, text, strlen(text)); return 0;
#if LVGL_VERSION_MAJOR >= 9
        case T_MSGBOX: lv_msgbox_add_text(obj, text); return 0;
        case T_BARCODE:
            lv_obj_update_layout(obj);
            lv_barcode_update(obj, text);
            return 0;
#if ML_HAS_ARCLABEL
        case T_ARCLABEL: lv_arclabel_set_text(obj, text); return 0;
#endif
#else
        case T_MSGBOX: lv_label_set_text(lv_msgbox_get_text(obj), text); return 0;
#endif
        default: return -1;
    }
}

int ml_set_s(int id, int prop, const char * text)
{
    lv_obj_t * obj = objects[id];
    if(!obj) return -1;
    switch(prop) {
        case S_TEXT: return apply_text(id, text);
        case S_PLACEHOLDER: lv_textarea_set_placeholder_text(obj, text); return 0;
        case S_OPTIONS:
            if(object_types[id] == T_DROPDOWN) lv_dropdown_set_options(obj, text);
            else if(object_types[id] == T_ROLLER) lv_roller_set_options(obj, text, LV_ROLLER_MODE_NORMAL);
            else return -1;
            return 0;
        case S_ITEMS: set_items(obj, text); return 0;
        case S_CELLS: set_cells(obj, text); return 0;
        case S_SERIES: set_series(obj, text); return 0;
        case S_TABS: set_tabs(obj, text); return 0;
        case S_MAP: set_map(obj, text); return 0;
        case S_POINTS: set_points(obj, text); return 0;
        case S_TILES: set_lines(obj, text, add_tile); return 0;
        case S_MENU_ITEMS:
            menu_page = lv_menu_page_create(obj, NULL);
            set_lines(obj, text, add_menu_item);
            lv_menu_set_page(obj, menu_page);
            return 0;
        case S_SPANS: set_lines(obj, text, add_span); return 0;
        case S_FRAMES: set_frames(obj, text); return 0;
        case S_TITLE:
            if(object_types[id] == T_WIN) lv_win_add_title(obj, text);
#if LVGL_VERSION_MAJOR >= 9
            else lv_msgbox_add_title(obj, text);
#else
            else lv_label_set_text(lv_msgbox_get_title(obj), text);
#endif
            return 0;
        case S_BUTTONS: {
#if LVGL_VERSION_MAJOR >= 9
            char * copy = strdup(text);
            for(char * cell = copy; cell;) {
                char * comma = strchr(cell, ',');
                if(comma) *comma = 0;
                lv_msgbox_add_footer_button(obj, cell);
                cell = comma ? comma + 1 : NULL;
            }
            free(copy);
#else
            char * copy = kept_copy(text);
            const char ** map = keep(calloc(count_char(copy, ',') + 2, sizeof(char *)));
            int at = 0;
            for(char * cell = copy; cell;) {
                char * comma = strchr(cell, ',');
                if(comma) *comma = 0;
                map[at++] = cell;
                cell = comma ? comma + 1 : NULL;
            }
            map[at] = "";
            /* The size lv_msgbox_create gives its buttons, which it set for none at all. */
            lv_obj_t * buttons = lv_msgbox_get_btns(obj);
            lv_btnmatrix_set_map(buttons, map);
            lv_obj_set_size(buttons, at * (2 * LV_DPI_DEF / 3), lv_font_get_line_height(lv_obj_get_style_text_font(buttons, LV_PART_ITEMS)) + LV_DPI_DEF / 10);
#endif
            return 0;
        }
        default: return -1;
    }
}

/* Registers BGRA pixels, which stay owned by the caller, under an index. */
int ml_image_load(int index, int width, int height, const uint8_t * pixels)
{
    if(index < 0 || index >= MAX_IMAGES) return -1;
    ml_image_t * image = &images[index];
    memset(image, 0, sizeof(*image));
#if LVGL_VERSION_MAJOR >= 9
    image->header.magic = LV_IMAGE_HEADER_MAGIC;
    image->header.cf = LV_COLOR_FORMAT_ARGB8888;
    image->header.stride = width * 4;
#else
    image->header.cf = LV_IMG_CF_TRUE_COLOR_ALPHA;
#endif
    image->header.w = width;
    image->header.h = height;
    image->data_size = (uint32_t)width * height * 4;
    image->data = pixels;
    return 0;
}

int ml_link(int id, int target)
{
    if(object_types[id] != T_KEYBOARD || !objects[target]) return -1;
    lv_keyboard_set_textarea(objects[id], objects[target]);
    return 0;
}

int ml_date(int id, int year, int month, int day)
{
    if(object_types[id] != T_CALENDAR) return -1;
    lv_calendar_set_today_date(objects[id], year, month, day);
    ml_calendar_month(objects[id], year, month);
    return 0;
}

void ml_qr_size(int size)
{
    next_qr_size = size;
}

int ml_canvas(int id, int width, int height, int color)
{
    if(object_types[id] != T_CANVAS) return -1;
    void * buffer = keep(calloc((size_t)width * height, 4));
#if LVGL_VERSION_MAJOR >= 9
    lv_canvas_set_buffer(objects[id], buffer, width, height, LV_COLOR_FORMAT_ARGB8888);
#else
    lv_canvas_set_buffer(objects[id], buffer, width, height, LV_IMG_CF_TRUE_COLOR_ALPHA);
#endif
    lv_canvas_fill_bg(objects[id], lv_color_hex((uint32_t)color), LV_OPA_COVER);
    return 0;
}

/* Tracks are comma separated: 80, 2fr or content. */
static ml_track_t * grid_tracks(const char * text)
{
    int count = count_char(text, ',') + 1;
    ml_track_t * tracks = keep(calloc(count + 1, sizeof(ml_track_t)));
    const char * cursor = text;
    for(int i = 0; i < count; i++) {
        char * after;
        long number = strtol(cursor, &after, 10);
        if(strncmp(after, "fr", 2) == 0) {
            long parts = number > 0 ? number : 1;
            tracks[i] = LV_GRID_FR(parts);
            after += 2;
        }
        else if(strncmp(cursor, "content", 7) == 0) {
            tracks[i] = LV_GRID_CONTENT;
            after = (char *)cursor + 7;
        }
        else tracks[i] = (ml_track_t)number;
        cursor = *after == ',' ? after + 1 : after;
    }
    tracks[count] = LV_GRID_TEMPLATE_LAST;
    return tracks;
}

int ml_grid(int id, const char * columns, const char * rows)
{
    if(object_types[id] != T_GRID) return -1;
    lv_obj_set_grid_dsc_array(objects[id], grid_tracks(columns), grid_tracks(rows));
    return 0;
}

int ml_cell(int id, int column, int column_span, int row, int row_span)
{
    if(!objects[id]) return -1;
    lv_obj_set_grid_cell(objects[id], LV_GRID_ALIGN_STRETCH, column, column_span, LV_GRID_ALIGN_STRETCH, row, row_span);
    return 0;
}

int ml_digits(int id, int count, int separator)
{
    if(object_types[id] != T_SPINBOX) return -1;
    lv_spinbox_set_digit_format(objects[id], count, separator);
    return 0;
}

/* ----------------------------------------------------------------- events */

static void log_line(const char * text)
{
    snprintf(log_lines[log_head], LOG_WIDTH, "%s", text);
    log_head = (log_head + 1) % LOG_LINES;
    if(log_head == log_tail) log_tail = (log_tail + 1) % LOG_LINES;
}

static void on_event(lv_event_t * event)
{
    action_t * action = lv_event_get_user_data(event);
    lv_obj_t * target = action->target >= 0 ? objects[action->target] : NULL;
    switch(action->kind) {
        case A_SCREEN: if(target) lv_screen_load(target); break;
        case A_SET_TEXT: if(target) apply_text(action->target, action->text); break;
        case A_TOGGLE:
            if(target) set_flag(target, LV_OBJ_FLAG_HIDDEN, !lv_obj_has_flag(target, LV_OBJ_FLAG_HIDDEN));
            break;
        case A_SHOW: if(target) set_flag(target, LV_OBJ_FLAG_HIDDEN, 0); break;
        case A_HIDE: if(target) set_flag(target, LV_OBJ_FLAG_HIDDEN, 1); break;
        case A_LOG: log_line(action->text); break;
        default: break;
    }
}

int ml_event(int id, int trigger, int kind, int target, const char * text)
{
    static const lv_event_code_t CODES[] = { LV_EVENT_CLICKED, LV_EVENT_PRESSED, LV_EVENT_RELEASED, LV_EVENT_VALUE_CHANGED };
    if(!objects[id] || trigger < 0 || trigger > TR_VALUE_CHANGED) return -1;
    action_t * action = calloc(1, sizeof(action_t));
    action->kind = kind;
    action->target = target;
    action->text = strdup(text ? text : "");
    action->next = actions;
    actions = action;
    lv_obj_add_event_cb(objects[id], on_event, CODES[trigger], action);
    return 0;
}

const char * ml_next_log(void)
{
    if(log_tail == log_head) return NULL;
    const char * line = log_lines[log_tail];
    log_tail = (log_tail + 1) % LOG_LINES;
    return line;
}

/* ------------------------------------------------------------- run / frame */

int ml_show(int id)
{
    if(!objects[id]) return -1;
    lv_screen_load(objects[id]);
    return 0;
}

/* Draws the active screen now, whatever the timers are doing. */
void ml_render(void)
{
    lv_obj_invalidate(lv_screen_active());
    lv_refr_now(NULL);
}

/* Advances LVGL by `ms`; 1 when the frame buffer changed since the last call. */
int ml_tick(int ms)
{
    lv_tick_inc((uint32_t)ms);
    lv_timer_handler();
    int changed = dirty;
    dirty = 0;
    return changed;
}

void ml_pointer(int x, int y, int down)
{
    unsigned next = (input_head + 1) % INPUT_SLOTS;
    if(next == input_tail) return;
    input_queue[input_head].x = x;
    input_queue[input_head].y = y;
    input_queue[input_head].down = down;
    input_head = next;
}

uint8_t * ml_framebuffer(void)
{
    return framebuffer;
}

/* The object's box on screen: four int32 (x1, y1, x2, y2). */
int ml_coords(int id, int32_t * out)
{
    lv_obj_t * obj = objects[id];
    if(!obj) return -1;
    lv_obj_update_layout(obj);
    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    out[0] = area.x1;
    out[1] = area.y1;
    out[2] = area.x2;
    out[3] = area.y2;
    return 0;
}

/* Where children's (0, 0) falls: the object's box inside its padding. */
int ml_content_origin(int id, int32_t * out)
{
    lv_obj_t * obj = objects[id];
    if(!obj) return -1;
    lv_obj_update_layout(obj);
    lv_area_t area;
    lv_obj_get_content_coords(obj, &area);
    out[0] = area.x1;
    out[1] = area.y1;
    return 0;
}

int ml_version(void)
{
    return LVGL_VERSION_MAJOR * 10000 + LVGL_VERSION_MINOR * 100 + LVGL_VERSION_PATCH;
}
