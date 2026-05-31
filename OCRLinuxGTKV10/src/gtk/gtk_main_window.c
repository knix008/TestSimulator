#include "gtk/gtk_main_window.h"
#include "gtk/gtk_pixbuf_util.h"
#include "gtk/gtk_install_progress.h"
#include "app/ocr_app.h"
#include "util/result_save.h"
#include <cairo/cairo.h>
#include <math.h>
#include <string.h>

typedef struct {
    OcrApp *app;
    GtkWidget *window;
    GtkWidget *engine_combo;
    GtkWidget *mode_combo;
    GtkWidget *status_label;
    GtkWidget *status_progress;
    GtkWidget *open_btn;
    GtkWidget *page_label;
    GtkWidget *prev_btn;
    GtkWidget *next_btn;
    GtkWidget *image_area;
    GtkWidget *box_area;
    GtkWidget *paned_outer;   /* 상·하 분할 (이미지 영역 | OCR 텍스트) */
    GtkWidget *paned_inner;   /* 좌·우 분할 (원본 | 박스) */
    GtkTextView *result_view;
    GtkWidget *ocr_btn;
    GtkWidget *copy_btn;
    GtkWidget *save_text_btn;
    GtkWidget *save_boxes_btn;
    GtkWidget *save_all_btn;
    GtkWidget *clear_btn;
    GdkPixbuf *display_pixbuf;
} GtkMainWindow;

static void save_window_state(GtkMainWindow *mw);
static void show_error(GtkMainWindow *mw, const char *title, const char *msg);
static void open_path(GtkMainWindow *mw, const char *path);

static void update_save_buttons(GtkMainWindow *mw) {
    gboolean has_text = ocr_app_has_result_text(mw->app);
    gboolean has_image = ocr_app_has_image(mw->app);
    gtk_widget_set_sensitive(mw->copy_btn, has_text);
    gtk_widget_set_sensitive(mw->save_text_btn, has_text);
    gtk_widget_set_sensitive(mw->save_boxes_btn, has_text && has_image);
    gtk_widget_set_sensitive(mw->save_all_btn, has_text);
    gtk_widget_set_sensitive(mw->clear_btn, has_text);
}

static void refresh_engine_combo(GtkMainWindow *mw) {
    gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(mw->engine_combo));
    for (gsize i = 0; i < ocr_app_engine_count(mw->app); i++) {
        OcrAppEngineInfo info;
        if (!ocr_app_get_engine_info(mw->app, i, &info)) continue;
        const char *status = info.installed ? "" : " (미설치)";
        char *label = g_strdup_printf("%s%s", info.display_name, status);
        gtk_combo_box_text_append(GTK_COMBO_BOX_TEXT(mw->engine_combo), info.id, label);
        g_free(label);
    }
    const char *active_id = ocr_app_get_active_engine_id(mw->app);
    if (active_id)
        gtk_combo_box_set_active_id(GTK_COMBO_BOX(mw->engine_combo), active_id);
}

static void refresh_mode_combo(GtkMainWindow *mw) {
    PreprocessMode mode = ocr_app_get_preprocess_mode(mw->app);
    int index = (mode == PREPROCESS_MODE_AUTO) ? 0 : (mode == PREPROCESS_MODE_HANDWRITING ? 1 : 2);
    gtk_combo_box_set_active(GTK_COMBO_BOX(mw->mode_combo), index);
}

static void update_page_controls(GtkMainWindow *mw) {
    gsize count = ocr_app_page_count(mw->app);
    if (count <= 1) {
        gtk_widget_set_sensitive(mw->prev_btn, FALSE);
        gtk_widget_set_sensitive(mw->next_btn, FALSE);
        gtk_label_set_text(GTK_LABEL(mw->page_label), count == 0 ? "" : "1 / 1");
        return;
    }
    int page = ocr_app_get_current_page(mw->app);
    char *text = g_strdup_printf("%d / %zu", page + 1, count);
    gtk_label_set_text(GTK_LABEL(mw->page_label), text);
    g_free(text);
    gtk_widget_set_sensitive(mw->prev_btn, ocr_app_has_prev_page(mw->app));
    gtk_widget_set_sensitive(mw->next_btn, ocr_app_has_next_page(mw->app));
}

static void update_status(GtkMainWindow *mw, const char *text) {
    gtk_label_set_text(GTK_LABEL(mw->status_label), text);
}

static void hide_ocr_progress(GtkMainWindow *mw) {
    gtk_widget_hide(mw->status_progress);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(mw->status_progress), 0.0);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(mw->status_progress), "");
}

static void set_ocr_progress(GtkMainWindow *mw, int percent, const char *message) {
    gtk_label_set_text(GTK_LABEL(mw->status_label), message);
    gtk_widget_show(mw->status_progress);

    if (percent >= 0) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(mw->status_progress), percent / 100.0);
        char pct_text[8];
        g_snprintf(pct_text, sizeof(pct_text), "%d%%", percent);
        gtk_progress_bar_set_text(GTK_PROGRESS_BAR(mw->status_progress), pct_text);
    } else {
        gtk_progress_bar_pulse(GTK_PROGRESS_BAR(mw->status_progress));
        gtk_progress_bar_set_text(GTK_PROGRESS_BAR(mw->status_progress), "");
    }

    while (gtk_events_pending()) gtk_main_iteration();
}

static void set_ocr_in_progress(GtkMainWindow *mw, gboolean in_progress) {
    gtk_widget_set_sensitive(mw->open_btn, !in_progress);
    gtk_widget_set_sensitive(mw->ocr_btn, !in_progress && ocr_app_has_image(mw->app));
    gtk_widget_set_sensitive(mw->engine_combo, !in_progress);
    gtk_widget_set_sensitive(mw->mode_combo, !in_progress);
    gtk_widget_set_sensitive(mw->prev_btn, !in_progress && ocr_app_has_prev_page(mw->app));
    gtk_widget_set_sensitive(mw->next_btn, !in_progress && ocr_app_has_next_page(mw->app));

    if (!in_progress)
        hide_ocr_progress(mw);
}

static char *format_elapsed(gint64 elapsed_us) {
    double seconds = elapsed_us / 1000000.0;
    if (seconds >= 3600.0) {
        int hours = (int)(seconds / 3600.0);
        int mins = ((int)seconds % 3600) / 60;
        int secs = (int)seconds % 60;
        return g_strdup_printf("%d시간 %d분 %d초", hours, mins, secs);
    }
    if (seconds >= 60.0) {
        int mins = (int)(seconds / 60.0);
        int secs = (int)seconds % 60;
        return g_strdup_printf("%d분 %d초", mins, secs);
    }
    if (seconds >= 10.0)
        return g_strdup_printf("%.1f초", seconds);
    if (seconds < 0.01)
        return g_strdup("0초");
    return g_strdup_printf("%.2f초", seconds);
}

static size_t count_result_words(const OcrResult *result) {
    size_t count = 0;
    if (!result) return 0;
    for (size_t i = 0; i < result->line_count; i++)
        count += result->lines[i].word_count;
    return count;
}

static void ocr_progress_cb(gpointer user_data, const char *message, int percent) {
    set_ocr_progress(user_data, percent, message);
}

static void refresh_result_view(GtkMainWindow *mw) {
    const OcrResult *result = ocr_app_get_result(mw->app);
    const char *text = (result && result->text) ? result->text : "";
    GtkTextBuffer *buf = gtk_text_view_get_buffer(mw->result_view);
    gtk_text_buffer_set_text(buf, text, -1);
    gtk_widget_queue_draw(mw->box_area);
    update_save_buttons(mw);
}

static void refresh_image_view(GtkMainWindow *mw) {
    if (mw->display_pixbuf) {
        g_object_unref(mw->display_pixbuf);
        mw->display_pixbuf = NULL;
    }
    if (ocr_app_has_image(mw->app)) {
        PIX *pix = ocr_app_get_image_copy(mw->app);
        if (pix) {
            mw->display_pixbuf = gtk_pixbuf_from_pix(pix);
            pixDestroy(&pix);
        }
    }
    gtk_widget_set_sensitive(mw->ocr_btn, ocr_app_has_image(mw->app));
    gtk_widget_queue_draw(mw->image_area);
    gtk_widget_queue_draw(mw->box_area);
    update_page_controls(mw);
}

static void draw_image_panel(GtkMainWindow *mw, cairo_t *cr, int w, int h, gboolean with_boxes) {
    cairo_set_source_rgb(cr, with_boxes ? 0.08 : 0.12, with_boxes ? 0.08 : 0.12, with_boxes ? 0.08 : 0.12);
    cairo_paint(cr);
    if (!mw->display_pixbuf) return;

    int pw = gdk_pixbuf_get_width(mw->display_pixbuf);
    int ph = gdk_pixbuf_get_height(mw->display_pixbuf);
    double scale = MIN((double)w / pw, (double)h / ph);
    double dw = pw * scale, dh = ph * scale;
    double ox = (w - dw) / 2.0, oy = (h - dh) / 2.0;

    gdk_cairo_set_source_pixbuf(cr, mw->display_pixbuf, ox, oy);
    cairo_paint(cr);

    if (!with_boxes) return;
    const OcrResult *result = ocr_app_get_result(mw->app);
    if (!result) return;

    cairo_set_source_rgba(cr, 0.0, 1.0, 0.2, 0.85);
    cairo_set_line_width(cr, 1.5);
    for (size_t i = 0; i < result->line_count; i++) {
        const OcrLine *line = &result->lines[i];
        for (size_t j = 0; j < line->word_count; j++) {
            const OcrRect *b = &line->words[j].bounds;
            cairo_rectangle(cr, ox + b->x * scale, oy + b->y * scale, b->w * scale, b->h * scale);
            cairo_stroke(cr);
        }
    }
}

static gboolean on_image_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
    (void)widget;
    GtkMainWindow *mw = user_data;
    draw_image_panel(mw, cr, gtk_widget_get_allocated_width(widget),
        gtk_widget_get_allocated_height(widget), FALSE);
    return FALSE;
}

static gboolean on_box_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
    (void)widget;
    GtkMainWindow *mw = user_data;
    draw_image_panel(mw, cr, gtk_widget_get_allocated_width(widget),
        gtk_widget_get_allocated_height(widget), TRUE);
    return FALSE;
}

static void show_error(GtkMainWindow *mw, const char *title, const char *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(mw->window), GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
    gtk_window_set_title(GTK_WINDOW(dlg), title);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static void open_path(GtkMainWindow *mw, const char *path) {
    GError *error = NULL;
    if (ocr_app_open_path(mw->app, path, &error)) {
        refresh_image_view(mw);
        refresh_result_view(mw);
        update_status(mw, path);
    } else {
        show_error(mw, "파일 열기", error ? error->message : "unknown");
        g_clear_error(&error);
    }
}

static void on_open_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    GtkMainWindow *mw = user_data;
    AppSettings *settings = ocr_app_get_settings(mw->app);

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "파일 열기", GTK_WINDOW(mw->window), GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL, "_열기", GTK_RESPONSE_ACCEPT, NULL);

    if (settings && settings->last_directory && settings->last_directory[0])
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dialog), settings->last_directory);

    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "지원 파일");
    gtk_file_filter_add_pattern(filter, "*.png");
    gtk_file_filter_add_pattern(filter, "*.jpg");
    gtk_file_filter_add_pattern(filter, "*.jpeg");
    gtk_file_filter_add_pattern(filter, "*.bmp");
    gtk_file_filter_add_pattern(filter, "*.tif");
    gtk_file_filter_add_pattern(filter, "*.tiff");
    gtk_file_filter_add_pattern(filter, "*.gif");
    gtk_file_filter_add_pattern(filter, "*.webp");
    gtk_file_filter_add_pattern(filter, "*.pdf");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        open_path(mw, path);
        g_free(path);
    }
    gtk_widget_destroy(dialog);
}

static void on_engine_changed(GtkComboBox *combo, gpointer user_data) {
    GtkMainWindow *mw = user_data;
    const char *id = gtk_combo_box_get_active_id(combo);
    if (id) ocr_app_select_engine(mw->app, id);
}

static void on_mode_changed(GtkComboBox *combo, gpointer user_data) {
    GtkMainWindow *mw = user_data;
    int idx = gtk_combo_box_get_active(combo);
    PreprocessMode mode = PREPROCESS_MODE_AUTO;
    if (idx == 1) mode = PREPROCESS_MODE_HANDWRITING;
    else if (idx == 2) mode = PREPROCESS_MODE_NONE;
    ocr_app_set_preprocess_mode(mw->app, mode);
}

static void on_prev_page(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    ocr_app_prev_page(mw->app);
    refresh_image_view(mw);
    refresh_result_view(mw);
}

static void on_next_page(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    ocr_app_next_page(mw->app);
    refresh_image_view(mw);
    refresh_result_view(mw);
}

static void run_ocr(GtkMainWindow *mw) {
    if (!ocr_app_has_image(mw->app)) return;

    gint64 started = g_get_monotonic_time();
    set_ocr_in_progress(mw, TRUE);
    set_ocr_progress(mw, 0, "OCR 시작");

    GError *error = NULL;
    set_ocr_progress(mw, 5, "OCR 엔진 준비 중...");
    if (!gtk_install_progress_prepare_engine(GTK_WINDOW(mw->window), mw->app, &error)) {
        show_error(mw, "OCR 엔진", error ? error->message : "준비 실패");
        g_clear_error(&error);
        set_ocr_in_progress(mw, FALSE);
        char *elapsed = format_elapsed(g_get_monotonic_time() - started);
        char *status = g_strdup_printf("OCR 엔진 준비 실패  ·  소요 %s", elapsed);
        update_status(mw, status);
        g_free(status);
        g_free(elapsed);
        refresh_engine_combo(mw);
        return;
    }

    refresh_engine_combo(mw);
    set_ocr_progress(mw, 12, "엔진 준비 완료");

    OcrProgressContext progress = {
        .report = ocr_progress_cb,
        .user_data = mw
    };

    if (!ocr_app_run_ocr_ex(mw->app, &progress, &error)) {
        show_error(mw, "OCR", error ? error->message : "실패");
        g_clear_error(&error);
        set_ocr_in_progress(mw, FALSE);
        char *elapsed = format_elapsed(g_get_monotonic_time() - started);
        char *status = g_strdup_printf("OCR 실패  ·  소요 %s", elapsed);
        update_status(mw, status);
        g_free(status);
        g_free(elapsed);
        return;
    }

    set_ocr_progress(mw, 92, "결과 표시 중...");
    refresh_result_view(mw);

    const OcrResult *result = ocr_app_get_result(mw->app);
    size_t word_count = count_result_words(result);
    size_t char_count = (result && result->text) ? strlen(result->text) : 0;
    char *elapsed = format_elapsed(g_get_monotonic_time() - started);
    char *status = g_strdup_printf(
        "OCR 완료 — %zu줄, %zu단어, %zu자  ·  소요 %s",
        result ? result->line_count : 0, word_count, char_count, elapsed);
    set_ocr_in_progress(mw, FALSE);
    update_status(mw, status);
    g_free(status);
    g_free(elapsed);
}

static void on_ocr_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    run_ocr(user_data);
}

static void on_copy_clicked(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    const OcrResult *r = ocr_app_get_result(mw->app);
    if (!r || !r->text || !r->text[0]) return;
    GtkClipboard *cb = gtk_widget_get_clipboard(mw->window, GDK_SELECTION_CLIPBOARD);
    gtk_clipboard_set_text(cb, r->text, -1);
    update_status(mw, "클립보드에 복사됨");
}

static void remember_save_dir(GtkMainWindow *mw, const char *saved_path) {
    char *dir = g_path_get_dirname(saved_path);
    AppSettings *s = ocr_app_get_settings(mw->app);
    g_free(s->last_directory);
    s->last_directory = dir;
    ocr_app_save_settings(mw->app, NULL);
}

static void on_save_text_clicked(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    const OcrResult *r = ocr_app_get_result(mw->app);
    if (!r || !r->text || !r->text[0]) return;

    char *base = ocr_app_get_result_base_name(mw->app);
    char *default_name = g_strdup_printf("%s_ocr.txt", base);
    g_free(base);

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "텍스트 저장", GTK_WINDOW(mw->window), GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL, "_저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), default_name);
    g_free(default_name);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        GError *error = NULL;
        if (result_save_text_file(path, r->text, &error))
            update_status(mw, "텍스트 저장 완료");
        else
            show_error(mw, "저장", error ? error->message : "실패");
        remember_save_dir(mw, path);
        g_clear_error(&error);
        g_free(path);
    }
    gtk_widget_destroy(dialog);
}

static void on_save_boxes_clicked(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    PIX *boxes = ocr_app_render_boxes_image(mw->app);
    if (!boxes) return;

    char *base = ocr_app_get_result_base_name(mw->app);
    const char *src = ocr_app_get_file_path(mw->app);
    char *default_name = result_save_build_boxes_filename(base, src);
    g_free(base);

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "박스 이미지 저장", GTK_WINDOW(mw->window), GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL, "_저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), default_name);
    g_free(default_name);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        GError *error = NULL;
        if (result_save_pix_file(path, boxes, &error))
            update_status(mw, "박스 이미지 저장 완료");
        else
            show_error(mw, "저장", error ? error->message : "실패");
        remember_save_dir(mw, path);
        g_clear_error(&error);
        g_free(path);
    }
    pixDestroy(&boxes);
    gtk_widget_destroy(dialog);
}

static void on_save_all_clicked(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    on_save_text_clicked(b, user_data);
    if (ocr_app_has_result_text(mw->app))
        on_save_boxes_clicked(b, user_data);
}

static void on_clear_clicked(GtkButton *b, gpointer user_data) {
    (void)b;
    GtkMainWindow *mw = user_data;
    ocr_app_clear_result(mw->app);
    refresh_result_view(mw);
    update_status(mw, "지워짐");
}

static void on_drag_data_received(GtkWidget *widget, GdkDragContext *ctx, gint x, gint y,
    GtkSelectionData *data, guint info, guint time, gpointer user_data) {
    (void)widget; (void)x; (void)y; (void)info;
    GtkMainWindow *mw = user_data;
    if (gtk_selection_data_get_length(data) <= 0) return;
    gchar **uris = gtk_selection_data_get_uris(data);
    if (uris && uris[0]) {
        char *path = g_filename_from_uri(uris[0], NULL, NULL);
        if (path) {
            open_path(mw, path);
            g_free(path);
        }
    }
    g_strfreev(uris);
    gtk_drag_finish(ctx, TRUE, FALSE, time);
}

static gboolean on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer user_data) {
    (void)widget;
    GtkMainWindow *mw = user_data;
    if ((event->state & GDK_CONTROL_MASK) && event->keyval == GDK_KEY_o) {
        on_open_clicked(NULL, mw);
        return TRUE;
    }
    if ((event->state & GDK_CONTROL_MASK) && event->keyval == GDK_KEY_s) {
        on_save_text_clicked(NULL, mw);
        return TRUE;
    }
    if (event->keyval == GDK_KEY_F5 && gtk_widget_get_sensitive(mw->ocr_btn)) {
        run_ocr(mw);
        return TRUE;
    }
    return FALSE;
}

static void apply_window_settings(GtkMainWindow *mw) {
    AppSettings *s = ocr_app_get_settings(mw->app);
    if (!s) return;
    if (s->window_width >= 800 && s->window_height >= 500)
        gtk_window_set_default_size(GTK_WINDOW(mw->window), s->window_width, s->window_height);
    if (s->window_x >= 0 && s->window_y >= 0) {
        gtk_window_move(GTK_WINDOW(mw->window), s->window_x, s->window_y);
    }
    if (s->window_maximized)
        gtk_window_maximize(GTK_WINDOW(mw->window));
}

static void apply_splitter_settings(GtkMainWindow *mw) {
    AppSettings *s = ocr_app_get_settings(mw->app);
    if (!s) return;
    if (s->outer_splitter_pos > 100)
        gtk_paned_set_position(GTK_PANED(mw->paned_outer), s->outer_splitter_pos);
    if (s->inner_splitter_pos > 100)
        gtk_paned_set_position(GTK_PANED(mw->paned_inner), s->inner_splitter_pos);
}

static void save_window_state(GtkMainWindow *mw) {
    AppSettings *s = ocr_app_get_settings(mw->app);
    if (!s) return;

    GtkWindow *win = GTK_WINDOW(mw->window);
    s->window_maximized = (gdk_window_get_state(gtk_widget_get_window(mw->window))
        & GDK_WINDOW_STATE_MAXIMIZED) != 0;

    if (!s->window_maximized) {
        gint w, h, x, y;
        gtk_window_get_size(win, &w, &h);
        gtk_window_get_position(win, &x, &y);
        s->window_width = w;
        s->window_height = h;
        s->window_x = x;
        s->window_y = y;
    }

    s->outer_splitter_pos = gtk_paned_get_position(GTK_PANED(mw->paned_outer));
    s->inner_splitter_pos = gtk_paned_get_position(GTK_PANED(mw->paned_inner));
    ocr_app_save_settings(mw->app, NULL);
}

static void on_destroy(GtkWidget *widget, gpointer user_data) {
    (void)widget;
    GtkMainWindow *mw = user_data;
    save_window_state(mw);
    if (mw->display_pixbuf) g_object_unref(mw->display_pixbuf);
    g_free(mw);
    gtk_main_quit();
}

static GtkWidget *make_tool_button(const char *label, GCallback cb, gpointer data) {
    GtkWidget *btn = GTK_WIDGET(gtk_tool_button_new(NULL, label));
    g_signal_connect(btn, "clicked", cb, data);
    return btn;
}

GtkWidget *gtk_main_window_create(OcrApp *app) {
    GtkMainWindow *mw = g_new0(GtkMainWindow, 1);
    mw->app = app;

    mw->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(mw->window), "OCRLinuxGTKV10");
    g_signal_connect(mw->window, "destroy", G_CALLBACK(on_destroy), mw);
    g_signal_connect(mw->window, "key-press-event", G_CALLBACK(on_key_press), mw);

    gtk_drag_dest_set(mw->window, GTK_DEST_DEFAULT_ALL, NULL, 0, GDK_ACTION_COPY);
    gtk_drag_dest_add_uri_targets(mw->window);
    g_signal_connect(mw->window, "drag-data-received", G_CALLBACK(on_drag_data_received), mw);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(mw->window), vbox);

    GtkWidget *toolbar = gtk_toolbar_new();
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), GTK_TOOL_ITEM(make_tool_button("열기", G_CALLBACK(on_open_clicked), mw)), -1);
    mw->open_btn = GTK_WIDGET(gtk_toolbar_get_nth_item(GTK_TOOLBAR(toolbar), 0));

    mw->prev_btn = make_tool_button("◀", G_CALLBACK(on_prev_page), mw);
    gtk_widget_set_sensitive(mw->prev_btn, FALSE);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), GTK_TOOL_ITEM(mw->prev_btn), -1);

    mw->page_label = gtk_label_new("");
    GtkToolItem *page_item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(page_item), mw->page_label);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), page_item, -1);

    mw->next_btn = make_tool_button("▶", G_CALLBACK(on_next_page), mw);
    gtk_widget_set_sensitive(mw->next_btn, FALSE);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), GTK_TOOL_ITEM(mw->next_btn), -1);

    mw->ocr_btn = make_tool_button("OCR (F5)", G_CALLBACK(on_ocr_clicked), mw);
    gtk_widget_set_sensitive(mw->ocr_btn, FALSE);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), GTK_TOOL_ITEM(mw->ocr_btn), -1);

    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), gtk_separator_tool_item_new(), -1);

    GtkToolItem *engine_label_item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(engine_label_item), gtk_label_new("엔진:"));
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), engine_label_item, -1);

    mw->engine_combo = gtk_combo_box_text_new();
    g_signal_connect(mw->engine_combo, "changed", G_CALLBACK(on_engine_changed), mw);
    GtkToolItem *engine_item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(engine_item), mw->engine_combo);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), engine_item, -1);

    GtkToolItem *mode_label_item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(mode_label_item), gtk_label_new("전처리:"));
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), mode_label_item, -1);

    mw->mode_combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->mode_combo), "자동");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->mode_combo), "손글씨");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->mode_combo), "없음");
    g_signal_connect(mw->mode_combo, "changed", G_CALLBACK(on_mode_changed), mw);
    GtkToolItem *mode_item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(mode_item), mw->mode_combo);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), mode_item, -1);

    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    /* 상단: 원본(좌) | 박스(우)  —  하단: OCR 텍스트 */
    mw->paned_outer = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_box_pack_start(GTK_BOX(vbox), mw->paned_outer, TRUE, TRUE, 0);

    mw->paned_inner = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_add1(GTK_PANED(mw->paned_outer), mw->paned_inner);

    GtkWidget *orig_frame = gtk_frame_new("원본");
    gtk_frame_set_label_align(GTK_FRAME(orig_frame), 0.0, 0.5);
    mw->image_area = gtk_drawing_area_new();
    g_signal_connect(mw->image_area, "draw", G_CALLBACK(on_image_draw), mw);
    gtk_container_add(GTK_CONTAINER(orig_frame), mw->image_area);
    gtk_paned_add1(GTK_PANED(mw->paned_inner), orig_frame);

    GtkWidget *box_frame = gtk_frame_new("박스");
    gtk_frame_set_label_align(GTK_FRAME(box_frame), 0.0, 0.5);
    mw->box_area = gtk_drawing_area_new();
    g_signal_connect(mw->box_area, "draw", G_CALLBACK(on_box_draw), mw);
    gtk_container_add(GTK_CONTAINER(box_frame), mw->box_area);
    gtk_paned_add2(GTK_PANED(mw->paned_inner), box_frame);

    GtkWidget *bottom_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_paned_add2(GTK_PANED(mw->paned_outer), bottom_box);

    GtkWidget *action_bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start(action_bar, 6);
    gtk_widget_set_margin_end(action_bar, 6);
    gtk_widget_set_margin_top(action_bar, 4);
    mw->copy_btn = gtk_button_new_with_label("복사");
    mw->save_text_btn = gtk_button_new_with_label("텍스트 저장");
    mw->save_boxes_btn = gtk_button_new_with_label("박스 이미지");
    mw->save_all_btn = gtk_button_new_with_label("모두 저장");
    mw->clear_btn = gtk_button_new_with_label("지우기");
    g_signal_connect(mw->copy_btn, "clicked", G_CALLBACK(on_copy_clicked), mw);
    g_signal_connect(mw->save_text_btn, "clicked", G_CALLBACK(on_save_text_clicked), mw);
    g_signal_connect(mw->save_boxes_btn, "clicked", G_CALLBACK(on_save_boxes_clicked), mw);
    g_signal_connect(mw->save_all_btn, "clicked", G_CALLBACK(on_save_all_clicked), mw);
    g_signal_connect(mw->clear_btn, "clicked", G_CALLBACK(on_clear_clicked), mw);
    gtk_box_pack_start(GTK_BOX(action_bar), mw->copy_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(action_bar), mw->save_text_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(action_bar), mw->save_boxes_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(action_bar), mw->save_all_btn, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(action_bar), mw->clear_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(bottom_box), action_bar, FALSE, FALSE, 0);

    GtkWidget *result_frame = gtk_frame_new("OCR 결과");
    gtk_frame_set_label_align(GTK_FRAME(result_frame), 0.0, 0.5);
    gtk_box_pack_start(GTK_BOX(bottom_box), result_frame, TRUE, TRUE, 0);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    mw->result_view = GTK_TEXT_VIEW(gtk_text_view_new());
    gtk_text_view_set_editable(mw->result_view, FALSE);
    gtk_text_view_set_monospace(mw->result_view, TRUE);
    gtk_text_view_set_wrap_mode(mw->result_view, GTK_WRAP_WORD_CHAR);
    gtk_container_add(GTK_CONTAINER(scroll), GTK_WIDGET(mw->result_view));
    gtk_container_add(GTK_CONTAINER(result_frame), scroll);

    GtkWidget *status_bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_margin_start(status_bar, 6);
    gtk_widget_set_margin_end(status_bar, 6);
    gtk_widget_set_margin_top(status_bar, 2);
    gtk_widget_set_margin_bottom(status_bar, 4);

    mw->status_label = gtk_label_new("파일을 열거나 드래그하여 OCR을 실행하세요.");
    gtk_label_set_xalign(GTK_LABEL(mw->status_label), 0.0);
    gtk_label_set_yalign(GTK_LABEL(mw->status_label), 0.5);
    gtk_label_set_ellipsize(GTK_LABEL(mw->status_label), PANGO_ELLIPSIZE_END);
    gtk_widget_set_hexpand(mw->status_label, TRUE);
    gtk_box_pack_start(GTK_BOX(status_bar), mw->status_label, TRUE, TRUE, 0);

    mw->status_progress = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(mw->status_progress), TRUE);
    gtk_widget_set_size_request(mw->status_progress, 200, -1);
    gtk_widget_set_no_show_all(mw->status_progress, TRUE);
    gtk_widget_hide(mw->status_progress);
    gtk_box_pack_end(GTK_BOX(status_bar), mw->status_progress, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(vbox), status_bar, FALSE, FALSE, 0);

    refresh_engine_combo(mw);
    refresh_mode_combo(mw);
    update_save_buttons(mw);
    apply_window_settings(mw);

    gtk_widget_show_all(mw->window);
    apply_splitter_settings(mw);
    return mw->window;
}
