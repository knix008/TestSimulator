#include "gtk_editor.h"
#include "gtk_preview.h"
#include "image_effects.h"
#include "image_io.h"
#include "rembg_onnx.h"
#include "utils.h"

#include <cairo/cairo.h>
#include <math.h>
#include <string.h>

#define EDITOR_UNDO_MAX 20
#define ADJ_PREVIEW_MS 180

typedef gboolean (*EffectFn)(GdkPixbuf *);

typedef struct {
    App *app;
    GtkWidget *window;
    GtkWidget *preview_scroll;
    GtkWidget *da;
    GtkWidget *status_lbl;
    GtkWidget *zoom_lbl;
    GtkAdjustment *adj_brightness;
    GtkAdjustment *adj_contrast;
    GtkAdjustment *adj_saturation;
    GtkAdjustment *adj_hue;
    GtkAdjustment *adj_gamma;
    GtkAdjustment *adj_temperature;
    GtkAdjustment *adj_param;
    GtkAdjustment *adj_tolerance;
    GtkWidget *spin_resize_w;
    GtkWidget *spin_resize_h;
    GtkWidget *spin_crop_x;
    GtkWidget *spin_crop_y;
    GtkWidget *spin_crop_w;
    GtkWidget *spin_crop_h;
    GtkWidget *spin_rotate;
    GtkWidget *bg_color_btn;
    GtkWidget *rb_flood;
    GtkWidget *rb_color;
    GtkWidget *btn_undo;
    GtkWidget *btn_redo;
    GtkWidget *progress;
    GtkWidget *progress_lbl;
    GtkWidget *btn_ai_remove;
    GtkWidget *btn_color_remove;
    GtkWidget *cmb_rembg_model;
    GtkWidget *lbl_ai_model_status;
    gboolean bg_busy;

    char *source_path;
    RembgModelId rembg_model;
    GdkPixbuf *original;
    GdkPixbuf *committed;
    GdkPixbuf *display;
    GPtrArray *undo;
    GPtrArray *redo;

    double zoom;
    gboolean pending_initial_fit;
    gboolean dirty;
    gboolean eyedropper;
    guint8 bg_r, bg_g, bg_b;
    int param_effect_idx;
    guint preview_timer_id;
    GMainLoop *loop;
    GCancellable *bg_cancel;
    int bg_tasks;
    gboolean shutting_down;
    char *saved_path;
} EditorCtx;

static gboolean editor_is_active(EditorCtx *ed) {
    return ed && !ed->shutting_down && ed->window && GTK_IS_WIDGET(ed->window);
}

static void editor_update_ai_model_status(EditorCtx *ed);

static void editor_bg_task_begin(EditorCtx *ed) {
    if (ed) {
        ed->bg_tasks++;
    }
}

static void editor_bg_task_end(EditorCtx *ed) {
    if (ed && ed->bg_tasks > 0) {
        ed->bg_tasks--;
    }
}

static void editor_wait_bg_tasks(EditorCtx *ed) {
    if (!ed) {
        return;
    }
    if (ed->bg_cancel) {
        g_cancellable_cancel(ed->bg_cancel);
    }
    while (ed->bg_tasks > 0) {
        g_main_context_iteration(NULL, TRUE);
    }
}

static void editor_free_display(EditorCtx *ed) {
    if (ed->display) {
        g_object_unref(ed->display);
        ed->display = NULL;
    }
}

static void editor_set_display(EditorCtx *ed, GdkPixbuf *pb) {
    editor_free_display(ed);
    ed->display = pb ? g_object_ref(pb) : NULL;
    if (ed->da && GTK_IS_WIDGET(ed->da) && !ed->shutting_down) {
        gtk_widget_queue_draw(ed->da);
    }
}

static void editor_undo_clear(EditorCtx *ed, GPtrArray *stack) {
    (void)ed;
    for (guint i = 0; i < stack->len; i++) {
        GdkPixbuf *p = g_ptr_array_index(stack, i);
        g_object_unref(p);
    }
    g_ptr_array_set_size(stack, 0);
}

static void editor_push_undo(EditorCtx *ed) {
    if (!ed->committed) {
        return;
    }
    ed->dirty = TRUE;
    g_ptr_array_insert(ed->undo, 0, image_effects_clone(ed->committed));
    if (ed->undo->len > EDITOR_UNDO_MAX) {
        GdkPixbuf *old = g_ptr_array_index(ed->undo, EDITOR_UNDO_MAX);
        g_object_unref(old);
        g_ptr_array_remove_index(ed->undo, EDITOR_UNDO_MAX);
    }
    editor_undo_clear(ed, ed->redo);
    gtk_widget_set_sensitive(ed->btn_undo, ed->undo->len > 0);
    gtk_widget_set_sensitive(ed->btn_redo, FALSE);
}

static void editor_set_committed(EditorCtx *ed, GdkPixbuf *pb) {
    if (ed->committed) {
        g_object_unref(ed->committed);
    }
    ed->committed = pb ? g_object_ref(pb) : NULL;
    editor_set_display(ed, ed->committed);
}

static gboolean adjustments_neutral(EditorCtx *ed) {
    return gtk_adjustment_get_value(ed->adj_brightness) == 0 &&
           gtk_adjustment_get_value(ed->adj_contrast) == 0 &&
           gtk_adjustment_get_value(ed->adj_saturation) == 0 &&
           gtk_adjustment_get_value(ed->adj_hue) == 0 &&
           gtk_adjustment_get_value(ed->adj_gamma) == 100 &&
           gtk_adjustment_get_value(ed->adj_temperature) == 0;
}

static GdkPixbuf *editor_build_preview(EditorCtx *ed) {
    if (!ed->committed) {
        return NULL;
    }
    GdkPixbuf *tmp = image_effects_clone(ed->committed);
    if (!tmp) {
        return NULL;
    }
    if (!adjustments_neutral(ed)) {
        image_effects_adjust(
            tmp,
            (int)gtk_adjustment_get_value(ed->adj_brightness),
            (int)gtk_adjustment_get_value(ed->adj_contrast),
            (int)gtk_adjustment_get_value(ed->adj_saturation),
            (int)gtk_adjustment_get_value(ed->adj_hue),
            (int)gtk_adjustment_get_value(ed->adj_gamma),
            (int)gtk_adjustment_get_value(ed->adj_temperature));
    }
    return tmp;
}

static void editor_refresh_preview(EditorCtx *ed) {
    if (!adjustments_neutral(ed)) {
        GdkPixbuf *prev = editor_build_preview(ed);
        editor_set_display(ed, prev);
        if (prev) {
            g_object_unref(prev);
        }
    } else {
        editor_set_display(ed, ed->committed);
    }
}

static gboolean editor_preview_timer_cb(gpointer data) {
    EditorCtx *ed = data;
    ed->preview_timer_id = 0;
    if (!editor_is_active(ed)) {
        return G_SOURCE_REMOVE;
    }
    editor_refresh_preview(ed);
    return G_SOURCE_REMOVE;
}

static void editor_schedule_preview(EditorCtx *ed) {
    if (!editor_is_active(ed)) {
        return;
    }
    if (ed->preview_timer_id) {
        g_source_remove(ed->preview_timer_id);
    }
    ed->preview_timer_id =
        g_timeout_add(ADJ_PREVIEW_MS, editor_preview_timer_cb, ed);
}

static void editor_update_status(EditorCtx *ed, const char *msg) {
    if (!ed->committed) {
        gtk_label_set_text(GTK_LABEL(ed->status_lbl), msg ? msg : "");
        return;
    }
    char *text = g_strdup_printf(
        "%s | %dx%d | %s%s",
        msg ? msg : "준비",
        gdk_pixbuf_get_width(ed->committed),
        gdk_pixbuf_get_height(ed->committed),
        ed->dirty ? "● 미저장 " : "",
        rembg_onnx_is_supported() ? "" : "(ONNX 미빌드)");
    gtk_label_set_text(GTK_LABEL(ed->status_lbl), text);
    g_free(text);
}

static void editor_apply_zoom_label(EditorCtx *ed) {
    char *z = g_strdup_printf("%.0f%%", ed->zoom * 100.0);
    gtk_label_set_text(GTK_LABEL(ed->zoom_lbl), z);
    g_free(z);
}

static void editor_fit_zoom(EditorCtx *ed) {
    if (!ed->display || !ed->preview_scroll) {
        return;
    }
    int alloc_w = gtk_widget_get_allocated_width(ed->preview_scroll);
    int alloc_h = gtk_widget_get_allocated_height(ed->preview_scroll);
    if (alloc_w < 32 || alloc_h < 32) {
        return;
    }
    int iw = gdk_pixbuf_get_width(ed->display);
    int ih = gdk_pixbuf_get_height(ed->display);
    double sx = (double)alloc_w / MAX(1, iw);
    double sy = (double)alloc_h / MAX(1, ih);
    ed->zoom = CLAMP(MIN(sx, sy), 0.05, 16.0);
    editor_apply_zoom_label(ed);
    if (ed->da) {
        gtk_widget_queue_draw(ed->da);
    }
}

static void editor_try_initial_fit(EditorCtx *ed) {
    if (!ed->pending_initial_fit || !ed->display || !ed->preview_scroll) {
        return;
    }
    int alloc_w = gtk_widget_get_allocated_width(ed->preview_scroll);
    int alloc_h = gtk_widget_get_allocated_height(ed->preview_scroll);
    if (alloc_w < 32 || alloc_h < 32) {
        return;
    }
    editor_fit_zoom(ed);
    ed->pending_initial_fit = FALSE;
}

static void on_preview_scroll_size_allocate(GtkWidget *widget,
                                            GdkRectangle *allocation,
                                            gpointer data) {
    (void)widget;
    (void)allocation;
    EditorCtx *ed = data;
    if (!editor_is_active(ed)) {
        return;
    }
    editor_try_initial_fit(ed);
}

static gboolean on_editor_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
    (void)widget;
    EditorCtx *ed = data;
    int alloc_w = gtk_widget_get_allocated_width(ed->da);
    int alloc_h = gtk_widget_get_allocated_height(ed->da);
    cairo_set_source_rgb(cr, 0.18, 0.18, 0.2);
    cairo_paint(cr);

    if (!ed->display) {
        return FALSE;
    }

    int iw = gdk_pixbuf_get_width(ed->display);
    int ih = gdk_pixbuf_get_height(ed->display);
    int dw = MAX(1, (int)(iw * ed->zoom));
    int dh = MAX(1, (int)(ih * ed->zoom));
    int ox = (alloc_w - dw) / 2;
    int oy = (alloc_h - dh) / 2;

    gdk_cairo_set_source_pixbuf(cr, ed->display, ox, oy);
    cairo_rectangle(cr, ox, oy, dw, dh);
    cairo_fill(cr);
    return FALSE;
}

static gboolean on_editor_scroll(GtkWidget *widget, GdkEventScroll *ev,
                                 gpointer data) {
    (void)widget;
    EditorCtx *ed = data;
    if (!ed->display) {
        return FALSE;
    }
    if (ev->direction == GDK_SCROLL_UP) {
        ed->zoom = CLAMP(ed->zoom * 1.1, 0.05, 16.0);
    } else if (ev->direction == GDK_SCROLL_DOWN) {
        ed->zoom = CLAMP(ed->zoom / 1.1, 0.05, 16.0);
    } else {
        return FALSE;
    }
    editor_apply_zoom_label(ed);
    gtk_widget_queue_draw(ed->da);
    return TRUE;
}

static void editor_reset_adjust_sliders(EditorCtx *ed) {
    gtk_adjustment_set_value(ed->adj_brightness, 0);
    gtk_adjustment_set_value(ed->adj_contrast, 0);
    gtk_adjustment_set_value(ed->adj_saturation, 0);
    gtk_adjustment_set_value(ed->adj_hue, 0);
    gtk_adjustment_set_value(ed->adj_gamma, 100);
    gtk_adjustment_set_value(ed->adj_temperature, 0);
}

static void editor_mutate(EditorCtx *ed, EffectFn fn, const char *msg) {
    if (!ed->committed || !fn) {
        return;
    }
    editor_push_undo(ed);
    fn(ed->committed);
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
    editor_update_status(ed, msg);
}

static void editor_replace(EditorCtx *ed, GdkPixbuf *new_pb, const char *msg) {
    if (!new_pb) {
        return;
    }
    editor_push_undo(ed);
    editor_set_committed(ed, new_pb);
    g_object_unref(new_pb);
    editor_reset_adjust_sliders(ed);
    editor_update_status(ed, msg);
}

static void on_adj_changed(GtkAdjustment *adj, gpointer data) {
    (void)adj;
    EditorCtx *ed = data;
    editor_schedule_preview(ed);
}

static void on_apply_adjust(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed || adjustments_neutral(ed)) {
        return;
    }
    editor_push_undo(ed);
    image_effects_adjust(
        ed->committed,
        (int)gtk_adjustment_get_value(ed->adj_brightness),
        (int)gtk_adjustment_get_value(ed->adj_contrast),
        (int)gtk_adjustment_get_value(ed->adj_saturation),
        (int)gtk_adjustment_get_value(ed->adj_hue),
        (int)gtk_adjustment_get_value(ed->adj_gamma),
        (int)gtk_adjustment_get_value(ed->adj_temperature));
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
    editor_update_status(ed, "색상 조정 적용됨");
}

static void on_reset_adjust(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
}

static void on_effect_btn(GtkButton *btn, gpointer data) {
    EditorCtx *ed = data;
    EffectFn fn = g_object_get_data(G_OBJECT(btn), "effect-fn");
    const char *name = g_object_get_data(G_OBJECT(btn), "effect-name");
    editor_mutate(ed, fn, name);
}

static void on_param_select(GtkButton *b, gpointer d) {
    EditorCtx *ed = d;
    ed->param_effect_idx =
        GPOINTER_TO_INT(g_object_get_data(G_OBJECT(b), "param-idx"));
    int mins[] = {1, 1, 2, 1, 1, 2, 1, 1};
    int maxs[] = {20, 20, 50, 20, 20, 20, 100, 100};
    int defs[] = {3, 3, 8, 10, 5, 6, 20, 20};
    int i = ed->param_effect_idx;
    if (i < 0 || i > 7) {
        i = 0;
    }
    gtk_adjustment_configure(ed->adj_param, defs[i], mins[i], maxs[i], 1, 1, 0);
}

static void on_param_apply(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed) {
        return;
    }
    int v = (int)gtk_adjustment_get_value(ed->adj_param);
    editor_push_undo(ed);
    switch (ed->param_effect_idx) {
    case 0:
        image_effects_gaussian_blur(ed->committed, v);
        break;
    case 1:
        image_effects_sharpen(ed->committed, v);
        break;
    case 2:
        image_effects_pixelate(ed->committed, v);
        break;
    case 3:
        image_effects_oil_paint(ed->committed, v);
        break;
    case 4:
        image_effects_box_blur(ed->committed, v);
        break;
    case 5:
        image_effects_gaussian_blur(ed->committed, MAX(1, v / 2));
        break;
    case 6:
        image_effects_brightness_factor(ed->committed, 1.0f + v / 100.0f);
        break;
    default:
        image_effects_brightness_factor(ed->committed,
                                        MAX(0.05f, 1.0f - v / 100.0f));
        break;
    }
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
    editor_update_status(ed, "효과 적용됨");
}

static void on_resize_apply(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed) {
        return;
    }
    int w = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_resize_w));
    int h = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_resize_h));
    GdkPixbuf *n = image_effects_resize(ed->committed, w, h);
    editor_replace(ed, n, "크기 조정됨");
}

static void on_rotate_btn(GtkButton *btn, gpointer data) {
    EditorCtx *ed = data;
    gpointer deg_ptr = g_object_get_data(G_OBJECT(btn), "rotate-deg");
    double deg = deg_ptr ? (double)GPOINTER_TO_INT(deg_ptr)
                          : gtk_spin_button_get_value(GTK_SPIN_BUTTON(ed->spin_rotate));
    GdkPixbuf *n = image_effects_rotate(ed->committed, deg);
    editor_replace(ed, n, "회전됨");
}

static void on_flip_btn(GtkButton *btn, gpointer data) {
    EditorCtx *ed = data;
    gboolean horiz = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(btn), "flip-h"));
    GdkPixbuf *n = horiz ? image_effects_flip_h(ed->committed)
                         : image_effects_flip_v(ed->committed);
    editor_replace(ed, n, "뒤집기됨");
}

static void on_crop_apply(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed) {
        return;
    }
    int x = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_crop_x));
    int y = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_crop_y));
    int w = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_crop_w));
    int h = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(ed->spin_crop_h));
    int iw = gdk_pixbuf_get_width(ed->committed);
    int ih = gdk_pixbuf_get_height(ed->committed);
    if (x + w > iw || y + h > ih) {
        gtk_app_show_warning(ed->app, "자르기 범위가 이미지 크기를 벗어납니다.");
        return;
    }
    GdkPixbuf *n = image_effects_crop(ed->committed, x, y, w, h);
    editor_replace(ed, n, "자르기됨");
}

static gboolean on_bg_color_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
    EditorCtx *ed = data;
    GtkAllocation alloc;
    gtk_widget_get_allocation(widget, &alloc);
    cairo_set_source_rgb(cr, ed->bg_r / 255.0, ed->bg_g / 255.0, ed->bg_b / 255.0);
    cairo_rectangle(cr, 0, 0, alloc.width, alloc.height);
    cairo_fill(cr);
    return FALSE;
}

static void editor_update_bg_color_btn(EditorCtx *ed) {
    if (ed->bg_color_btn) {
        gtk_widget_queue_draw(ed->bg_color_btn);
    }
}

static void on_bg_color_pick(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    GtkWidget *dlg = gtk_color_chooser_dialog_new("배경 색상", GTK_WINDOW(ed->window));
    GdkRGBA c = {(double)ed->bg_r / 255.0, (double)ed->bg_g / 255.0,
                 (double)ed->bg_b / 255.0, 1.0};
    gtk_color_chooser_set_rgba(GTK_COLOR_CHOOSER(dlg), &c);
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_OK) {
        gtk_color_chooser_get_rgba(GTK_COLOR_CHOOSER(dlg), &c);
        ed->bg_r = (guint8)(c.red * 255);
        ed->bg_g = (guint8)(c.green * 255);
        ed->bg_b = (guint8)(c.blue * 255);
        editor_update_bg_color_btn(ed);
    }
    gtk_widget_destroy(dlg);
}

static void on_eyedropper(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    ed->eyedropper = !ed->eyedropper;
    gtk_widget_set_tooltip_text(ed->da,
                                ed->eyedropper ? "배경 색을 클릭하세요" : NULL);
}

static gboolean on_editor_click(GtkWidget *widget, GdkEventButton *ev,
                                gpointer data) {
    (void)widget;
    EditorCtx *ed = data;
    if (!ed->eyedropper || !ed->committed || ev->button != 1) {
        return FALSE;
    }
    int alloc_w = gtk_widget_get_allocated_width(ed->da);
    int alloc_h = gtk_widget_get_allocated_height(ed->da);
    int iw = gdk_pixbuf_get_width(ed->committed);
    int ih = gdk_pixbuf_get_height(ed->committed);
    int dw = MAX(1, (int)(iw * ed->zoom));
    int dh = MAX(1, (int)(ih * ed->zoom));
    int ox = (alloc_w - dw) / 2;
    int oy = (alloc_h - dh) / 2;
    int ix = (int)((ev->x - ox) / ed->zoom);
    int iy = (int)((ev->y - oy) / ed->zoom);
    if (ix < 0 || iy < 0 || ix >= iw || iy >= ih) {
        return TRUE;
    }
    guchar *px = gdk_pixbuf_get_pixels(ed->committed);
    int rs = gdk_pixbuf_get_rowstride(ed->committed);
    int nc = gdk_pixbuf_get_n_channels(ed->committed);
    guchar *p = px + iy * rs + ix * nc;
    ed->bg_r = p[0];
    ed->bg_g = p[1];
    ed->bg_b = p[2];
    editor_update_bg_color_btn(ed);
    ed->eyedropper = FALSE;
    return TRUE;
}

typedef struct {
    EditorCtx *ed;
    int percent;
    char *message;
} EditorProgressIdle;

static void editor_hide_progress_widgets(EditorCtx *ed) {
    if (!editor_is_active(ed)) {
        return;
    }
    if (ed->progress && GTK_IS_WIDGET(ed->progress)) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(ed->progress), 0.0);
        gtk_widget_hide(ed->progress);
    }
    if (ed->progress_lbl && GTK_IS_WIDGET(ed->progress_lbl)) {
        gtk_label_set_text(GTK_LABEL(ed->progress_lbl), "");
        gtk_widget_hide(ed->progress_lbl);
    }
}

static void editor_set_busy(EditorCtx *ed, const char *status) {
    if (!editor_is_active(ed) || ed->bg_busy) {
        return;
    }
    ed->bg_busy = TRUE;
    if (ed->btn_ai_remove) {
        gtk_widget_set_sensitive(ed->btn_ai_remove, FALSE);
    }
    if (ed->btn_color_remove) {
        gtk_widget_set_sensitive(ed->btn_color_remove, FALSE);
    }
    if (ed->window) {
        GdkWindow *win = gtk_widget_get_window(ed->window);
        if (win) {
            GdkDisplay *disp = gdk_window_get_display(win);
            GdkCursor *cur = gdk_cursor_new_for_display(disp, GDK_WATCH);
            gdk_window_set_cursor(win, cur);
            g_object_unref(cur);
        }
    }
    if (ed->app && status) {
        gtk_app_update_status_file(ed->app, status);
    }
    if (ed->progress && GTK_IS_WIDGET(ed->progress)) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(ed->progress), 0.0);
        gtk_widget_show(ed->progress);
    }
    if (ed->progress_lbl && GTK_IS_WIDGET(ed->progress_lbl)) {
        gtk_widget_show(ed->progress_lbl);
    }
}

static void editor_clear_busy(EditorCtx *ed) {
    if (!ed) {
        return;
    }
    ed->bg_busy = FALSE;
    if (!editor_is_active(ed)) {
        return;
    }
    if (ed->btn_ai_remove) {
        gtk_widget_set_sensitive(ed->btn_ai_remove, TRUE);
    }
    if (ed->btn_color_remove) {
        gtk_widget_set_sensitive(ed->btn_color_remove, TRUE);
    }
    if (ed->window) {
        GdkWindow *win = gtk_widget_get_window(ed->window);
        if (win) {
            gdk_window_set_cursor(win, NULL);
        }
    }
    editor_hide_progress_widgets(ed);
}

static gboolean editor_progress_idle_cb(gpointer data) {
    EditorProgressIdle *p = data;
    EditorCtx *ed = p->ed;
    if (!editor_is_active(ed)) {
        g_free(p->message);
        g_free(p);
        return G_SOURCE_REMOVE;
    }
    char *status = g_strdup_printf("%d%% — %s", p->percent,
                                   p->message ? p->message : "");
    if (ed->progress_lbl && GTK_IS_WIDGET(ed->progress_lbl)) {
        gtk_label_set_text(GTK_LABEL(ed->progress_lbl), status);
        gtk_widget_show(ed->progress_lbl);
    }
    if (ed->progress && GTK_IS_WIDGET(ed->progress)) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(ed->progress),
                                      p->percent / 100.0);
        gtk_widget_show(ed->progress);
    }
    if (ed->app) {
        gtk_app_update_status_file(ed->app, status);
    }
    editor_update_status(ed, status);
    g_free(status);
    g_free(p->message);
    g_free(p);
    return G_SOURCE_REMOVE;
}

static void editor_report_progress(int percent, const char *message, gpointer data) {
    EditorCtx *ed = data;
    if (!ed || ed->shutting_down) {
        return;
    }
    EditorProgressIdle *p = g_new(EditorProgressIdle, 1);
    p->ed = ed;
    p->percent = percent;
    p->message = g_strdup(message ? message : "");
    g_idle_add(editor_progress_idle_cb, p);
}

typedef struct {
    EditorCtx *ed;
    GdkPixbuf *input;
    RembgModelId model;
} RembgWork;

typedef struct {
    EditorCtx *ed;
    GdkPixbuf *img;
    guint8 r, g, b;
    int tolerance;
    gboolean flood;
} ColorBgWork;

static void color_bg_work_free(ColorBgWork *w) {
    if (!w) {
        return;
    }
    if (w->img) {
        g_object_unref(w->img);
    }
    g_free(w);
}

static void color_bg_worker(GTask *task, gpointer source, gpointer data,
                            GCancellable *cancel) {
    (void)source;
    ColorBgWork *w = data;
    if (g_cancellable_is_cancelled(cancel)) {
        g_task_return_new_error(task, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                                "작업이 취소되었습니다");
        return;
    }
    gboolean ok;
    if (w->flood) {
        ok = image_effects_remove_bg_flood(w->img, w->r, w->g, w->b, w->tolerance,
                                           editor_report_progress, w->ed);
    } else {
        ok = image_effects_remove_bg_color(w->img, w->r, w->g, w->b, w->tolerance,
                                           editor_report_progress, w->ed);
    }
    if (ok) {
        g_task_return_pointer(task, g_object_ref(w->img), g_object_unref);
    } else {
        g_task_return_new_error(task, G_IO_ERROR, G_IO_ERROR_FAILED,
                                "색상 배경 제거 실패");
    }
}

static void color_bg_done(GObject *src, GAsyncResult *res, gpointer data) {
    (void)src;
    EditorCtx *ed = data;
    GError *err = NULL;
    GdkPixbuf *out = g_task_propagate_pointer(G_TASK(res), &err);
    editor_clear_busy(ed);
    editor_bg_task_end(ed);
    if (!editor_is_active(ed)) {
        if (out) {
            g_object_unref(out);
        }
        g_clear_error(&err);
        return;
    }
    if (!out) {
        if (!err || err->code != G_IO_ERROR_CANCELLED) {
            gtk_app_show_warning(ed->app, err ? err->message : "색상 배경 제거 실패");
        }
        g_clear_error(&err);
        editor_update_status(ed, "배경 제거 실패");
        return;
    }
    editor_replace(ed, out, "색상 배경 제거 완료");
    g_object_unref(out);
    editor_refresh_preview(ed);
}

static void on_color_remove_bg(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed || ed->bg_busy) {
        return;
    }
    int tol = (int)gtk_adjustment_get_value(ed->adj_tolerance);
    gboolean flood = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(ed->rb_flood));

    ColorBgWork *w = g_new(ColorBgWork, 1);
    w->ed = ed;
    w->r = ed->bg_r;
    w->g = ed->bg_g;
    w->b = ed->bg_b;
    w->tolerance = tol;
    w->flood = flood;
    w->img = image_effects_clone(ed->committed);

    editor_set_busy(ed, "색상 배경 제거 준비 중…");
    editor_report_progress(0, "색상 배경 제거 준비 중…", ed);

    editor_bg_task_begin(ed);
    GTask *task = g_task_new(NULL, ed->bg_cancel, color_bg_done, ed);
    g_task_set_task_data(task, w, (GDestroyNotify)color_bg_work_free);
    g_task_run_in_thread(task, color_bg_worker);
    g_object_unref(task);
}

static void rembg_work_free(RembgWork *w) {
    if (!w) {
        return;
    }
    if (w->input) {
        g_object_unref(w->input);
    }
    g_free(w);
}

static void rembg_worker(GTask *task, gpointer source, gpointer data,
                         GCancellable *cancel) {
    (void)source;
    RembgWork *w = data;
    if (g_cancellable_is_cancelled(cancel)) {
        g_task_return_new_error(task, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                                "작업이 취소되었습니다");
        return;
    }
    GError *err = NULL;
    if (!rembg_onnx_ensure_model(w->model, editor_report_progress, w->ed, &err)) {
        g_task_return_error(task, err);
        return;
    }
    GdkPixbuf *out =
        rembg_onnx_remove_background(w->input, w->model, editor_report_progress,
                                     w->ed, &err);
    if (out) {
        g_task_return_pointer(task, out, g_object_unref);
    } else {
        g_task_return_error(task, err);
    }
}

static void rembg_done(GObject *src, GAsyncResult *res, gpointer data) {
    (void)src;
    EditorCtx *ed = data;

    GError *err = NULL;
    GdkPixbuf *out = g_task_propagate_pointer(G_TASK(res), &err);

    editor_clear_busy(ed);
    editor_bg_task_end(ed);

    if (!out) {
        if (editor_is_active(ed)) {
            if (!err || err->code != G_IO_ERROR_CANCELLED) {
                gtk_app_show_warning(ed->app,
                                     err ? err->message : "AI 배경 제거 실패");
            }
            editor_update_status(ed, "AI 배경 제거 실패");
            editor_update_ai_model_status(ed);
        }
        g_clear_error(&err);
        return;
    }
    if (editor_is_active(ed)) {
        editor_replace(ed, out, "AI 배경 제거 완료");
        editor_update_ai_model_status(ed);
        editor_refresh_preview(ed);
    }
    g_object_unref(out);
}

static RembgModelId editor_get_rembg_model(EditorCtx *ed) {
    if (!ed->cmb_rembg_model) {
        return REMBG_MODEL_U2NET;
    }
    GtkTreeIter iter;
    if (!gtk_combo_box_get_active_iter(GTK_COMBO_BOX(ed->cmb_rembg_model),
                                       &iter)) {
        return REMBG_MODEL_U2NET;
    }
    int id = REMBG_MODEL_U2NET;
    gtk_tree_model_get(gtk_combo_box_get_model(GTK_COMBO_BOX(ed->cmb_rembg_model)),
                       &iter, 0, &id, -1);
    return (RembgModelId)id;
}

static void editor_update_ai_model_status(EditorCtx *ed) {
    if (!ed->lbl_ai_model_status) {
        return;
    }
    RembgModelId mid = editor_get_rembg_model(ed);
    if (!rembg_onnx_is_supported()) {
        gtk_label_set_text(GTK_LABEL(ed->lbl_ai_model_status),
                           "ONNX Runtime 없음 — ONNXRUNTIME_ROOT 로 다시 빌드");
        return;
    }
    if (rembg_onnx_model_installed(mid)) {
        char *t = g_strdup_printf("%s 준비됨",
                                  rembg_onnx_model_display_name(mid));
        gtk_label_set_text(GTK_LABEL(ed->lbl_ai_model_status), t);
        g_free(t);
    } else {
        char *t = g_strdup_printf("%s 없음 — AI 실행 시 다운로드",
                                  rembg_onnx_model_display_name(mid));
        gtk_label_set_text(GTK_LABEL(ed->lbl_ai_model_status), t);
    }
}

static void on_rembg_model_changed(GtkComboBox *combo, gpointer data) {
    (void)combo;
    EditorCtx *ed = data;
    rembg_onnx_invalidate_session();
    editor_update_ai_model_status(ed);
}

static void on_ai_remove_bg(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed) {
        return;
    }
    if (!rembg_onnx_is_supported()) {
        gtk_app_show_warning(
            ed->app,
            "ONNX Runtime 없이 빌드되었습니다.\n\n"
            "1) https://github.com/microsoft/onnxruntime/releases 에서\n"
            "   Linux x64 패키지를 받아 압축 해제\n"
            "2) ONNXRUNTIME_ROOT=/경로/to/onnxruntime make\n\n"
            "예: ONNXRUNTIME_ROOT=$PWD/third_party/onnxruntime make");
        return;
    }

    if (ed->bg_busy) {
        return;
    }

    RembgModelId model = editor_get_rembg_model(ed);

    RembgWork *w = g_new(RembgWork, 1);
    w->ed = ed;
    w->model = model;
    w->input = image_effects_clone(ed->committed);

    editor_set_busy(ed, "AI 배경 제거 준비 중…");
    editor_report_progress(0, "AI 배경 제거 준비 중…", ed);

    editor_bg_task_begin(ed);
    GTask *task = g_task_new(NULL, ed->bg_cancel, rembg_done, ed);
    g_task_set_task_data(task, w, (GDestroyNotify)rembg_work_free);
    g_task_run_in_thread(task, rembg_worker);
    g_object_unref(task);
}

static void on_undo(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (ed->undo->len == 0 || !ed->committed) {
        return;
    }
    g_ptr_array_insert(ed->redo, 0, image_effects_clone(ed->committed));
    GdkPixbuf *prev = g_ptr_array_index(ed->undo, 0);
    g_ptr_array_remove_index(ed->undo, 0);
    editor_set_committed(ed, prev);
    g_object_unref(prev);
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
    gtk_widget_set_sensitive(ed->btn_undo, ed->undo->len > 0);
    gtk_widget_set_sensitive(ed->btn_redo, ed->redo->len > 0);
    editor_update_status(ed, "실행 취소");
}

static void on_redo(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (ed->redo->len == 0 || !ed->committed) {
        return;
    }
    g_ptr_array_insert(ed->undo, 0, image_effects_clone(ed->committed));
    GdkPixbuf *next = g_ptr_array_index(ed->redo, 0);
    g_ptr_array_remove_index(ed->redo, 0);
    editor_set_committed(ed, next);
    g_object_unref(next);
    editor_reset_adjust_sliders(ed);
    editor_refresh_preview(ed);
    gtk_widget_set_sensitive(ed->btn_undo, TRUE);
    gtk_widget_set_sensitive(ed->btn_redo, ed->redo->len > 0);
    editor_update_status(ed, "다시 실행");
}

static void on_reset_all(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->original) {
        return;
    }
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(ed->window), GTK_DIALOG_MODAL, GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_YES_NO, "모든 변경을 취소하고 원본으로 돌아가시겠습니까?");
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_YES) {
        editor_push_undo(ed);
        editor_set_committed(ed, ed->original);
        editor_reset_adjust_sliders(ed);
        editor_refresh_preview(ed);
        editor_update_status(ed, "원본으로 초기화");
    }
    gtk_widget_destroy(dlg);
}

static gboolean editor_save_to(EditorCtx *ed, const char *path) {
    GdkPixbuf *to_save = ed->committed;
    GdkPixbuf *tmp = NULL;
    if (!adjustments_neutral(ed)) {
        tmp = editor_build_preview(ed);
        to_save = tmp;
    }
    if (!to_save) {
        return FALSE;
    }
    GError *err = NULL;
    gboolean ok = image_io_save_pixbuf(to_save, path, 95, &err);
    if (!ok) {
        gtk_app_show_warning(ed->app, err ? err->message : "저장 실패");
    }
    g_clear_error(&err);
    if (tmp) {
        g_object_unref(tmp);
    }
    return ok;
}

static void on_save(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed || !ed->source_path) {
        return;
    }
    if (editor_save_to(ed, ed->source_path)) {
        ed->dirty = FALSE;
        ed->saved_path = g_strdup(ed->source_path);
        editor_update_status(ed, "저장됨");
    }
}

static void on_save_as(GtkButton *btn, gpointer data) {
    (void)btn;
    EditorCtx *ed = data;
    if (!ed->committed) {
        return;
    }
    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "다른 이름으로 저장", GTK_WINDOW(ed->window),
        GTK_FILE_CHOOSER_ACTION_SAVE, "_취소", GTK_RESPONSE_CANCEL, "_저장",
        GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(
        GTK_FILE_CHOOSER(dlg), TRUE);
    char *base = g_path_get_basename(ed->source_path);
    char *dot = strrchr(base, '.');
    if (dot) {
        *dot = '\0';
    }
    char *suggest = g_strdup_printf("%s_편집.png", base);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), suggest);
    g_free(suggest);
    g_free(base);

    GtkFileFilter *flt = gtk_file_filter_new();
    gtk_file_filter_set_name(flt, "PNG 이미지");
    gtk_file_filter_add_pattern(flt, "*.png");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), flt);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (path && editor_save_to(ed, path)) {
            ed->dirty = FALSE;
            g_free(ed->source_path);
            ed->source_path = path;
            path = NULL;
            g_free(ed->saved_path);
            ed->saved_path = g_strdup(ed->source_path);
            editor_update_status(ed, "저장됨");
        }
        g_free(path);
    }
    gtk_widget_destroy(dlg);
}

static GtkWidget *editor_add_scale(GtkWidget *parent, const char *label,
                                   GtkAdjustment *adj) {
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(parent), gtk_label_new(label), FALSE, FALSE, 0);
    GtkWidget *scale = gtk_scale_new(GTK_ORIENTATION_HORIZONTAL, adj);
    gtk_widget_set_hexpand(scale, TRUE);
    gtk_box_pack_start(GTK_BOX(box), scale, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(parent), box, FALSE, FALSE, 0);
    return scale;
}

static GtkWidget *editor_build_adjust_tab(EditorCtx *ed) {
    GtkWidget *v = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(v), 8);
    ed->adj_brightness = gtk_adjustment_new(0, -100, 100, 1, 10, 0);
    ed->adj_contrast = gtk_adjustment_new(0, -100, 100, 1, 10, 0);
    ed->adj_saturation = gtk_adjustment_new(0, -100, 100, 1, 10, 0);
    ed->adj_hue = gtk_adjustment_new(0, -180, 180, 1, 15, 0);
    ed->adj_gamma = gtk_adjustment_new(100, 50, 200, 1, 10, 0);
    ed->adj_temperature = gtk_adjustment_new(0, -100, 100, 1, 10, 0);
    editor_add_scale(v, "밝기", ed->adj_brightness);
    editor_add_scale(v, "대비", ed->adj_contrast);
    editor_add_scale(v, "채도", ed->adj_saturation);
    editor_add_scale(v, "색조", ed->adj_hue);
    editor_add_scale(v, "감마", ed->adj_gamma);
    editor_add_scale(v, "색온도", ed->adj_temperature);
    g_signal_connect(ed->adj_brightness, "value-changed", G_CALLBACK(on_adj_changed), ed);
    g_signal_connect(ed->adj_contrast, "value-changed", G_CALLBACK(on_adj_changed), ed);
    g_signal_connect(ed->adj_saturation, "value-changed", G_CALLBACK(on_adj_changed), ed);
    g_signal_connect(ed->adj_hue, "value-changed", G_CALLBACK(on_adj_changed), ed);
    g_signal_connect(ed->adj_gamma, "value-changed", G_CALLBACK(on_adj_changed), ed);
    g_signal_connect(ed->adj_temperature, "value-changed", G_CALLBACK(on_adj_changed), ed);
    GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *b1 = gtk_button_new_with_label("적용");
    GtkWidget *b2 = gtk_button_new_with_label("초기화");
    g_signal_connect(b1, "clicked", G_CALLBACK(on_apply_adjust), ed);
    g_signal_connect(b2, "clicked", G_CALLBACK(on_reset_adjust), ed);
    gtk_box_pack_start(GTK_BOX(row), b1, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(row), b2, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(v), row, FALSE, FALSE, 0);
    return v;
}

static gboolean fx_posterize(GdkPixbuf *p) {
    return image_effects_posterize(p, 4);
}
static gboolean fx_emboss(GdkPixbuf *p) {
    return image_effects_emboss(p);
}
static gboolean fx_solarize(GdkPixbuf *p) {
    return image_effects_solarize(p, 128);
}

static GtkWidget *editor_add_effect_btn(GtkWidget *grid, int col, int row,
                                        const char *label, EffectFn fn,
                                        EditorCtx *ed) {
    GtkWidget *btn = gtk_button_new_with_label(label);
    g_object_set_data(G_OBJECT(btn), "effect-fn", fn);
    g_object_set_data(G_OBJECT(btn), "effect-name", (gpointer)label);
    g_signal_connect(btn, "clicked", G_CALLBACK(on_effect_btn), ed);
    gtk_grid_attach(GTK_GRID(grid), btn, col, row, 1, 1);
    return btn;
}

static GtkWidget *editor_build_effects_tab(EditorCtx *ed) {
    GtkWidget *v = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(v), 8);
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 4);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 4);
    editor_add_effect_btn(grid, 0, 0, "흑백", image_effects_grayscale, ed);
    editor_add_effect_btn(grid, 1, 0, "세피아", image_effects_sepia, ed);
    editor_add_effect_btn(grid, 0, 1, "반전", image_effects_invert, ed);
    editor_add_effect_btn(grid, 1, 1, "비네트", image_effects_vignette, ed);
    editor_add_effect_btn(grid, 0, 2, "엣지", image_effects_detect_edges, ed);
    editor_add_effect_btn(grid, 1, 2, "폴라로이드", image_effects_polaroid, ed);
    editor_add_effect_btn(grid, 0, 3, "글로우", image_effects_glow, ed);
    editor_add_effect_btn(grid, 1, 3, "고대비", image_effects_high_contrast_bw, ed);
    editor_add_effect_btn(grid, 0, 4, "포스터", fx_posterize, ed);
    editor_add_effect_btn(grid, 1, 4, "엠보스", fx_emboss, ed);
    editor_add_effect_btn(grid, 0, 5, "솔라라이즈", fx_solarize, ed);
    gtk_box_pack_start(GTK_BOX(v), grid, FALSE, FALSE, 0);

    ed->adj_param = gtk_adjustment_new(5, 1, 20, 1, 1, 0);
    editor_add_scale(v, "강도", ed->adj_param);
    GtkWidget *param_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    const char *labels[] = {"블러", "선명", "픽셀", "유화", "박스", "소프트",
                            "밝게", "어둡게"};
    for (int i = 0; i < 8; i++) {
        GtkWidget *b = gtk_button_new_with_label(labels[i]);
        g_object_set_data(G_OBJECT(b), "param-idx", GINT_TO_POINTER(i));
        g_signal_connect(b, "clicked", G_CALLBACK(on_param_select), ed);
        gtk_box_pack_start(GTK_BOX(param_row), b, TRUE, TRUE, 0);
    }
    gtk_box_pack_start(GTK_BOX(v), param_row, FALSE, FALSE, 0);
    GtkWidget *apply = gtk_button_new_with_label("강도 효과 적용");
    g_signal_connect(apply, "clicked", G_CALLBACK(on_param_apply), ed);
    gtk_box_pack_start(GTK_BOX(v), apply, FALSE, FALSE, 0);
    return v;
}

static GtkWidget *editor_add_spin(GtkWidget *parent, const char *label, int max_val,
                                  GtkWidget **out) {
    GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(row), gtk_label_new(label), FALSE, FALSE, 0);
    GtkAdjustment *adj = gtk_adjustment_new(1, 1, max_val, 1, 10, 0);
    *out = gtk_spin_button_new(adj, 1, 0);
    gtk_box_pack_start(GTK_BOX(row), *out, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(parent), row, FALSE, FALSE, 0);
    return row;
}

static GtkWidget *editor_build_transform_tab(EditorCtx *ed) {
    GtkWidget *v = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(v), 8);
    editor_add_spin(v, "너비", 16000, &ed->spin_resize_w);
    editor_add_spin(v, "높이", 16000, &ed->spin_resize_h);
    GtkWidget *rb = gtk_button_new_with_label("크기 적용");
    g_signal_connect(rb, "clicked", G_CALLBACK(on_resize_apply), ed);
    gtk_box_pack_start(GTK_BOX(v), rb, FALSE, FALSE, 0);

    GtkWidget *rot_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *r1 = gtk_button_new_with_label("↺ 90°");
    GtkWidget *r2 = gtk_button_new_with_label("↻ 90°");
    GtkWidget *r3 = gtk_button_new_with_label("180°");
    g_object_set_data(G_OBJECT(r1), "rotate-deg", GINT_TO_POINTER(-90));
    g_object_set_data(G_OBJECT(r2), "rotate-deg", GINT_TO_POINTER(90));
    g_object_set_data(G_OBJECT(r3), "rotate-deg", GINT_TO_POINTER(180));
    g_signal_connect(r1, "clicked", G_CALLBACK(on_rotate_btn), ed);
    g_signal_connect(r2, "clicked", G_CALLBACK(on_rotate_btn), ed);
    g_signal_connect(r3, "clicked", G_CALLBACK(on_rotate_btn), ed);
    gtk_box_pack_start(GTK_BOX(rot_row), r1, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(rot_row), r2, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(rot_row), r3, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(v), rot_row, FALSE, FALSE, 0);

    editor_add_spin(v, "회전(°)", 360, &ed->spin_rotate);
    GtkWidget *rot_custom = gtk_button_new_with_label("회전 적용");
    g_signal_connect(rot_custom, "clicked", G_CALLBACK(on_rotate_btn), ed);

    GtkWidget *flip_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *fh = gtk_button_new_with_label("좌우");
    GtkWidget *fv = gtk_button_new_with_label("상하");
    g_object_set_data(G_OBJECT(fh), "flip-h", GINT_TO_POINTER(1));
    g_object_set_data(G_OBJECT(fv), "flip-h", GINT_TO_POINTER(0));
    g_signal_connect(fh, "clicked", G_CALLBACK(on_flip_btn), ed);
    g_signal_connect(fv, "clicked", G_CALLBACK(on_flip_btn), ed);
    gtk_box_pack_start(GTK_BOX(flip_row), fh, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(flip_row), fv, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(v), flip_row, FALSE, FALSE, 0);

    editor_add_spin(v, "자르기 X", 16000, &ed->spin_crop_x);
    editor_add_spin(v, "자르기 Y", 16000, &ed->spin_crop_y);
    editor_add_spin(v, "자르기 W", 16000, &ed->spin_crop_w);
    editor_add_spin(v, "자르기 H", 16000, &ed->spin_crop_h);
    GtkWidget *crop = gtk_button_new_with_label("자르기 적용");
    g_signal_connect(crop, "clicked", G_CALLBACK(on_crop_apply), ed);
    gtk_box_pack_start(GTK_BOX(v), crop, FALSE, FALSE, 0);
    return v;
}

static GtkWidget *editor_add_section_label(GtkWidget *parent, const char *text) {
    GtkWidget *lbl = gtk_label_new(text);
    gtk_label_set_xalign(GTK_LABEL(lbl), 0.0);
    PangoAttrList *attrs = pango_attr_list_new();
    pango_attr_list_insert(attrs, pango_attr_weight_new(PANGO_WEIGHT_BOLD));
    gtk_label_set_attributes(GTK_LABEL(lbl), attrs);
    pango_attr_list_unref(attrs);
    gtk_box_pack_start(GTK_BOX(parent), lbl, FALSE, FALSE, 0);
    return lbl;
}

static GtkWidget *editor_build_bg_tab(EditorCtx *ed) {
    GtkWidget *v = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(v), 8);

    /* ── AI (rembg) — 우선 ───────────────────────────────────────── */
    editor_add_section_label(v, "AI 배경 제거 (rembg)");

    GtkWidget *model_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(model_row), gtk_label_new("모델"), FALSE, FALSE, 0);
    ed->cmb_rembg_model = gtk_combo_box_new();
    GtkListStore *model_store = gtk_list_store_new(2, G_TYPE_INT, G_TYPE_STRING);
    for (int i = 0; i < REMBG_MODEL_COUNT; i++) {
        GtkTreeIter it;
        gtk_list_store_append(model_store, &it);
        gtk_list_store_set(model_store, &it, 0, i,
                          1, rembg_onnx_model_display_name((RembgModelId)i), -1);
    }
    gtk_combo_box_set_model(GTK_COMBO_BOX(ed->cmb_rembg_model),
                            GTK_TREE_MODEL(model_store));
    g_object_unref(model_store);
    GtkCellRenderer *cell = gtk_cell_renderer_text_new();
    gtk_cell_layout_pack_start(GTK_CELL_LAYOUT(ed->cmb_rembg_model), cell, TRUE);
    gtk_cell_layout_set_attributes(GTK_CELL_LAYOUT(ed->cmb_rembg_model), cell,
                                   "text", 1, NULL);
    gtk_combo_box_set_active(GTK_COMBO_BOX(ed->cmb_rembg_model), 0);
    g_signal_connect(ed->cmb_rembg_model, "changed",
                     G_CALLBACK(on_rembg_model_changed), ed);
    gtk_box_pack_start(GTK_BOX(model_row), ed->cmb_rembg_model, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(v), model_row, FALSE, FALSE, 0);

    ed->lbl_ai_model_status = gtk_label_new("");
    gtk_label_set_xalign(GTK_LABEL(ed->lbl_ai_model_status), 0.0);
    gtk_label_set_line_wrap(GTK_LABEL(ed->lbl_ai_model_status), TRUE);
    gtk_box_pack_start(GTK_BOX(v), ed->lbl_ai_model_status, FALSE, FALSE, 0);
    editor_update_ai_model_status(ed);

    ed->btn_ai_remove = gtk_button_new_with_label("AI 배경 제거");
    g_signal_connect(ed->btn_ai_remove, "clicked", G_CALLBACK(on_ai_remove_bg), ed);
    gtk_box_pack_start(GTK_BOX(v), ed->btn_ai_remove, FALSE, FALSE, 0);

    ed->progress = gtk_progress_bar_new();
    ed->progress_lbl = gtk_label_new("");
    gtk_box_pack_start(GTK_BOX(v), ed->progress, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(v), ed->progress_lbl, FALSE, FALSE, 0);
    gtk_widget_set_no_show_all(ed->progress, TRUE);
    gtk_widget_set_no_show_all(ed->progress_lbl, TRUE);

    gtk_box_pack_start(GTK_BOX(v), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL),
                       FALSE, FALSE, 0);

    /* ── 색상 기반 ───────────────────────────────────────────────── */
    editor_add_section_label(v, "색상 기반");

    ed->bg_color_btn = gtk_button_new();
    gtk_widget_set_size_request(ed->bg_color_btn, 48, 28);
    ed->bg_r = 255;
    ed->bg_g = 255;
    ed->bg_b = 255;
    g_signal_connect(ed->bg_color_btn, "draw", G_CALLBACK(on_bg_color_draw), ed);
    g_signal_connect(ed->bg_color_btn, "clicked", G_CALLBACK(on_bg_color_pick), ed);

    GtkWidget *color_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(color_row), gtk_label_new("배경 색"), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(color_row), ed->bg_color_btn, FALSE, FALSE, 0);
    GtkWidget *drop = gtk_button_new_with_label("스포이드");
    g_signal_connect(drop, "clicked", G_CALLBACK(on_eyedropper), ed);
    gtk_box_pack_start(GTK_BOX(color_row), drop, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(v), color_row, FALSE, FALSE, 0);

    ed->adj_tolerance = gtk_adjustment_new(30, 0, 128, 1, 5, 0);
    editor_add_scale(v, "허용치", ed->adj_tolerance);

    ed->rb_flood = gtk_radio_button_new_with_label(NULL, "가장자리 확장");
    ed->rb_color = gtk_radio_button_new_with_label_from_widget(
        GTK_RADIO_BUTTON(ed->rb_flood), "색상 대치");
    gtk_box_pack_start(GTK_BOX(v), ed->rb_flood, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(v), ed->rb_color, FALSE, FALSE, 0);

    ed->btn_color_remove = gtk_button_new_with_label("색상 배경 제거");
    g_signal_connect(ed->btn_color_remove, "clicked", G_CALLBACK(on_color_remove_bg),
                     ed);
    gtk_box_pack_start(GTK_BOX(v), ed->btn_color_remove, FALSE, FALSE, 0);

    return v;
}

static void on_editor_window_destroy(GtkWidget *widget, gpointer data) {
    (void)widget;
    EditorCtx *ed = data;
    if (!ed || ed->shutting_down) {
        return;
    }
    ed->shutting_down = TRUE;
    ed->window = NULL;
    ed->da = NULL;
    ed->preview_scroll = NULL;
    ed->status_lbl = NULL;
    ed->zoom_lbl = NULL;
    ed->btn_ai_remove = NULL;
    ed->btn_color_remove = NULL;
    ed->progress = NULL;
    ed->progress_lbl = NULL;
    ed->cmb_rembg_model = NULL;
    ed->lbl_ai_model_status = NULL;
    if (ed->bg_cancel) {
        g_cancellable_cancel(ed->bg_cancel);
    }
    if (ed->preview_timer_id) {
        g_source_remove(ed->preview_timer_id);
        ed->preview_timer_id = 0;
    }
    if (ed->loop && g_main_loop_is_running(ed->loop)) {
        g_main_loop_quit(ed->loop);
    }
}

static void editor_destroy(EditorCtx *ed) {
    if (!ed) {
        return;
    }
    ed->shutting_down = TRUE;
    editor_wait_bg_tasks(ed);
    if (ed->bg_cancel) {
        g_object_unref(ed->bg_cancel);
        ed->bg_cancel = NULL;
    }
    if (ed->preview_timer_id) {
        g_source_remove(ed->preview_timer_id);
        ed->preview_timer_id = 0;
    }
    if (ed->loop) {
        if (g_main_loop_is_running(ed->loop)) {
            g_main_loop_quit(ed->loop);
        }
        g_main_loop_unref(ed->loop);
        ed->loop = NULL;
    }
    editor_free_display(ed);
    if (ed->committed) {
        g_object_unref(ed->committed);
    }
    if (ed->original) {
        g_object_unref(ed->original);
    }
    editor_undo_clear(ed, ed->undo);
    editor_undo_clear(ed, ed->redo);
    g_ptr_array_free(ed->undo, TRUE);
    g_ptr_array_free(ed->redo, TRUE);
    g_free(ed->source_path);
    g_free(ed->saved_path);
    g_free(ed);
}

static gboolean on_editor_delete(GtkWidget *widget, GdkEvent *ev, gpointer data) {
    (void)ev;
    EditorCtx *ed = data;
    if (ed->shutting_down) {
        return FALSE;
    }
    if (ed->dirty) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(ed->window), GTK_DIALOG_MODAL, GTK_MESSAGE_QUESTION,
            GTK_BUTTONS_YES_NO,
            "저장되지 않은 변경 사항이 있습니다.\n저장하시겠습니까?");
        gtk_message_dialog_format_secondary_text(
            GTK_MESSAGE_DIALOG(dlg), "아니오를 누르면 저장하지 않고 닫습니다.");
        gint r = gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        if (r == GTK_RESPONSE_YES) {
            on_save(NULL, ed);
        }
    }
    gtk_widget_destroy(widget);
    return FALSE;
}

gboolean gtk_editor_open(App *app, const char *image_path, char **saved_path_out) {
    if (!app || !image_path || !g_file_test(image_path, G_FILE_TEST_IS_REGULAR)) {
        return FALSE;
    }

    GError *err = NULL;
    GdkPixbuf *loaded = image_io_load_pixbuf(image_path, &err);
    if (!loaded) {
        gtk_app_show_warning(app, err ? err->message : "이미지를 열 수 없습니다.");
        g_clear_error(&err);
        return FALSE;
    }

    EditorCtx *ed = g_new0(EditorCtx, 1);
    ed->app = app;
    ed->source_path = g_strdup(image_path);
    ed->original = image_effects_clone(loaded);
    ed->committed = image_effects_clone(loaded);
    g_object_unref(loaded);
    ed->undo = g_ptr_array_new();
    ed->redo = g_ptr_array_new();
    ed->zoom = 1.0;
    ed->param_effect_idx = 0;
    ed->bg_cancel = g_cancellable_new();

    char *title = g_strdup_printf("이미지 편집기 — %s", g_path_get_basename(image_path));
    ed->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(ed->window), title);
    g_free(title);
    gtk_window_set_default_size(GTK_WINDOW(ed->window), 1100, 720);
    gtk_window_set_transient_for(GTK_WINDOW(ed->window), GTK_WINDOW(app->window));
    gtk_window_set_modal(GTK_WINDOW(ed->window), TRUE);
    g_signal_connect(ed->window, "delete-event", G_CALLBACK(on_editor_delete), ed);
    g_signal_connect(ed->window, "destroy", G_CALLBACK(on_editor_window_destroy), ed);

    GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(ed->window), root);

    GtkWidget *toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(toolbar), 4);
    GtkWidget *btn_save = gtk_button_new_with_label("저장");
    GtkWidget *btn_save_as = gtk_button_new_with_label("다른 이름으로");
    ed->btn_undo = gtk_button_new_with_label("실행 취소");
    ed->btn_redo = gtk_button_new_with_label("다시 실행");
    GtkWidget *btn_reset = gtk_button_new_with_label("원본으로");
    gtk_widget_set_sensitive(ed->btn_undo, FALSE);
    gtk_widget_set_sensitive(ed->btn_redo, FALSE);
    g_signal_connect(btn_save, "clicked", G_CALLBACK(on_save), ed);
    g_signal_connect(btn_save_as, "clicked", G_CALLBACK(on_save_as), ed);
    g_signal_connect(ed->btn_undo, "clicked", G_CALLBACK(on_undo), ed);
    g_signal_connect(ed->btn_redo, "clicked", G_CALLBACK(on_redo), ed);
    g_signal_connect(btn_reset, "clicked", G_CALLBACK(on_reset_all), ed);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_save, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_save_as, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), ed->btn_undo, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), ed->btn_redo, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_reset, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(root), toolbar, FALSE, FALSE, 0);

    GtkWidget *hpaned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(root), hpaned, TRUE, TRUE, 0);

    GtkWidget *tools = gtk_notebook_new();
    gtk_notebook_append_page(GTK_NOTEBOOK(tools), editor_build_adjust_tab(ed),
                             gtk_label_new("색상"));
    gtk_notebook_append_page(GTK_NOTEBOOK(tools), editor_build_effects_tab(ed),
                             gtk_label_new("효과"));
    gtk_notebook_append_page(GTK_NOTEBOOK(tools), editor_build_transform_tab(ed),
                             gtk_label_new("변환"));
    gtk_notebook_append_page(GTK_NOTEBOOK(tools), editor_build_bg_tab(ed),
                             gtk_label_new("배경"));

    GtkWidget *tools_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(tools_scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_min_content_width(GTK_SCROLLED_WINDOW(tools_scroll),
                                              320);
    gtk_container_add(GTK_CONTAINER(tools_scroll), tools);
    gtk_paned_pack1(GTK_PANED(hpaned), tools_scroll, FALSE, FALSE);

    ed->preview_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(ed->preview_scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    ed->da = gtk_drawing_area_new();
    gtk_widget_add_events(ed->da, GDK_BUTTON_PRESS_MASK | GDK_SCROLL_MASK);
    g_signal_connect(ed->da, "draw", G_CALLBACK(on_editor_draw), ed);
    g_signal_connect(ed->da, "scroll-event", G_CALLBACK(on_editor_scroll), ed);
    g_signal_connect(ed->da, "button-press-event", G_CALLBACK(on_editor_click), ed);
    gtk_container_add(GTK_CONTAINER(ed->preview_scroll), ed->da);
    g_signal_connect(ed->preview_scroll, "size-allocate",
                     G_CALLBACK(on_preview_scroll_size_allocate), ed);
    gtk_paned_pack2(GTK_PANED(hpaned), ed->preview_scroll, TRUE, FALSE);
    gtk_paned_set_position(GTK_PANED(hpaned), 360);

    int iw = gdk_pixbuf_get_width(ed->committed);
    int ih = gdk_pixbuf_get_height(ed->committed);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(ed->spin_resize_w), iw);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(ed->spin_resize_h), ih);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(ed->spin_crop_w), iw);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(ed->spin_crop_h), ih);

    GtkWidget *bottom = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    ed->status_lbl = gtk_label_new("");
    ed->zoom_lbl = gtk_label_new("100%");
    gtk_label_set_xalign(GTK_LABEL(ed->status_lbl), 0.0);
    gtk_box_pack_start(GTK_BOX(bottom), ed->status_lbl, TRUE, TRUE, 0);
    gtk_box_pack_end(GTK_BOX(bottom), ed->zoom_lbl, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(root), bottom, FALSE, FALSE, 0);

    editor_refresh_preview(ed);
    editor_update_status(ed, "준비");

    ed->pending_initial_fit = TRUE;
    ed->loop = g_main_loop_new(NULL, FALSE);
    gtk_widget_show_all(ed->window);
    while (g_main_context_pending(NULL)) {
        gtk_main_iteration();
    }
    editor_try_initial_fit(ed);

    g_main_loop_run(ed->loop);

    editor_wait_bg_tasks(ed);

    gboolean ok = ed->saved_path != NULL;
    if (ok && saved_path_out) {
        *saved_path_out = g_strdup(ed->saved_path);
    }
    editor_destroy(ed);
    return ok;
}
