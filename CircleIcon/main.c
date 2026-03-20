/*
 * CircleIcon - 이미지에서 원형 영역을 선택하여 PNG로 저장하는 프로그램
 * 빌드: make
 * 실행: ./circle_icon [이미지파일]
 *
 * 사용법:
 *   - 파일 > 열기 (Ctrl+O): 이미지 불러오기
 *   - 이미지 위에서 클릭+드래그: 원형 영역 선택 (클릭 지점=중심, 드래그 거리=반지름)
 *   - 파일 > 원형 저장 (Ctrl+S): 선택 영역을 투명 배경 PNG로 저장
 */

#include <gtk/gtk.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* -------------------------------------------------------------------------- */
/* 데이터 구조 */
/* -------------------------------------------------------------------------- */

typedef struct {
    GtkWidget *window;
    GtkWidget *drawing_area;
    GtkWidget *status_label;

    GdkPixbuf *original_pixbuf;
    gchar     *current_file;

    /* 원형 선택 (이미지 좌표계) */
    gboolean  is_dragging;
    gboolean  has_selection;
    double    cx, cy;     /* 원의 중심 */
    double    radius;     /* 반지름 */

    /* 드래그 시작점 (위젯 좌표계) */
    double    drag_wx, drag_wy;
} AppData;

/* -------------------------------------------------------------------------- */
/* 좌표 변환 유틸리티 */
/* -------------------------------------------------------------------------- */

/*
 * 현재 drawing_area 크기와 원본 이미지 크기를 기반으로
 * 이미지가 실제로 그려지는 영역(위젯 좌표계)을 계산한다.
 * 이미지는 가로세로 비율을 유지하면서 drawing_area에 맞게 스케일된다.
 */
static void get_display_rect(AppData *app,
                              double *out_x, double *out_y,
                              double *out_w, double *out_h,
                              double *out_scale)
{
    if (!app->original_pixbuf) {
        *out_x = *out_y = *out_w = *out_h = 0.0;
        if (out_scale) *out_scale = 1.0;
        return;
    }

    int ww = gtk_widget_get_allocated_width(app->drawing_area);
    int wh = gtk_widget_get_allocated_height(app->drawing_area);
    int iw = gdk_pixbuf_get_width(app->original_pixbuf);
    int ih = gdk_pixbuf_get_height(app->original_pixbuf);

    double scale = MIN((double)ww / iw, (double)wh / ih);
    double dw    = iw * scale;
    double dh    = ih * scale;

    *out_x = (ww - dw) / 2.0;
    *out_y = (wh - dh) / 2.0;
    *out_w = dw;
    *out_h = dh;
    if (out_scale) *out_scale = scale;
}

/* 위젯 좌표 → 이미지 좌표 */
static void widget_to_image(AppData *app,
                             double wx, double wy,
                             double *ix, double *iy)
{
    double rx, ry, rw, rh, scale;
    get_display_rect(app, &rx, &ry, &rw, &rh, &scale);
    *ix = (wx - rx) / scale;
    *iy = (wy - ry) / scale;
}

/* 이미지 좌표 → 위젯 좌표 */
static void image_to_widget(AppData *app,
                             double ix, double iy,
                             double *wx, double *wy)
{
    double rx, ry, rw, rh, scale;
    get_display_rect(app, &rx, &ry, &rw, &rh, &scale);
    *wx = ix * scale + rx;
    *wy = iy * scale + ry;
}

/* -------------------------------------------------------------------------- */
/* 그리기 콜백 */
/* -------------------------------------------------------------------------- */

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer data)
{
    AppData *app = (AppData *)data;

    int ww = gtk_widget_get_allocated_width(widget);
    int wh = gtk_widget_get_allocated_height(widget);

    /* 배경 */
    cairo_set_source_rgb(cr, 0.18, 0.18, 0.18);
    cairo_paint(cr);

    /* 이미지 없을 때 안내 문구 */
    if (!app->original_pixbuf) {
        const char *hint = "File > Open (Ctrl+O) 으로 이미지를 여세요";
        cairo_set_source_rgb(cr, 0.65, 0.65, 0.65);
        cairo_select_font_face(cr, "Sans",
                               CAIRO_FONT_SLANT_NORMAL,
                               CAIRO_FONT_WEIGHT_NORMAL);
        cairo_set_font_size(cr, 16.0);
        cairo_text_extents_t ext;
        cairo_text_extents(cr, hint, &ext);
        cairo_move_to(cr,
                      (ww - ext.width)  / 2.0 - ext.x_bearing,
                      (wh - ext.height) / 2.0 - ext.y_bearing);
        cairo_show_text(cr, hint);
        return FALSE;
    }

    /* 이미지 그리기 */
    double rx, ry, rw, rh, scale;
    get_display_rect(app, &rx, &ry, &rw, &rh, &scale);

    cairo_save(cr);
    cairo_translate(cr, rx, ry);
    cairo_scale(cr, scale, scale);
    gdk_cairo_set_source_pixbuf(cr, app->original_pixbuf, 0, 0);
    cairo_paint(cr);
    cairo_restore(cr);

    /* 원형 선택 오버레이 */
    if (app->has_selection || app->is_dragging) {
        double wcx, wcy;
        image_to_widget(app, app->cx, app->cy, &wcx, &wcy);
        double wr = app->radius * scale;

        /* 원 바깥 어둡게 (even-odd fill rule) */
        cairo_save(cr);
        cairo_set_fill_rule(cr, CAIRO_FILL_RULE_EVEN_ODD);
        cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.55);
        cairo_rectangle(cr, rx, ry, rw, rh);
        cairo_arc(cr, wcx, wcy, wr, 0.0, 2.0 * G_PI);
        cairo_fill(cr);
        cairo_restore(cr);

        /* 원 테두리 (흰색 점선) */
        cairo_save(cr);
        cairo_arc(cr, wcx, wcy, wr, 0.0, 2.0 * G_PI);
        cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.9);
        cairo_set_line_width(cr, 2.0);
        double dashes[] = { 8.0, 4.0 };
        cairo_set_dash(cr, dashes, 2, 0.0);
        cairo_stroke(cr);
        cairo_restore(cr);

        /* 중심 십자선 */
        cairo_save(cr);
        cairo_set_source_rgba(cr, 1.0, 1.0, 0.0, 0.85);
        cairo_set_line_width(cr, 1.5);
        cairo_set_dash(cr, NULL, 0, 0.0);
        cairo_move_to(cr, wcx - 10, wcy);
        cairo_line_to(cr, wcx + 10, wcy);
        cairo_move_to(cr, wcx, wcy - 10);
        cairo_line_to(cr, wcx, wcy + 10);
        cairo_stroke(cr);
        cairo_restore(cr);

        /* 반지름 표시 텍스트 */
        if (app->is_dragging || app->has_selection) {
            cairo_save(cr);
            cairo_set_source_rgba(cr, 1.0, 1.0, 0.0, 0.9);
            cairo_select_font_face(cr, "Monospace",
                                   CAIRO_FONT_SLANT_NORMAL,
                                   CAIRO_FONT_WEIGHT_BOLD);
            cairo_set_font_size(cr, 12.0);
            gchar *info = g_strdup_printf("r = %.0fpx", app->radius);
            cairo_move_to(cr, wcx + wr + 6, wcy - 4);
            cairo_show_text(cr, info);
            g_free(info);
            cairo_restore(cr);
        }
    }

    return FALSE;
}

/* -------------------------------------------------------------------------- */
/* 마우스 이벤트 콜백 */
/* -------------------------------------------------------------------------- */

static gboolean on_button_press(GtkWidget *widget,
                                 GdkEventButton *event,
                                 gpointer data)
{
    AppData *app = (AppData *)data;
    if (!app->original_pixbuf) return FALSE;
    if (event->button != 1) return FALSE;

    double ix, iy;
    widget_to_image(app, event->x, event->y, &ix, &iy);

    app->cx        = ix;
    app->cy        = iy;
    app->radius    = 0.0;
    app->drag_wx   = event->x;
    app->drag_wy   = event->y;
    app->is_dragging   = TRUE;
    app->has_selection = FALSE;

    gtk_widget_queue_draw(widget);
    return TRUE;
}

static gboolean on_motion_notify(GtkWidget *widget,
                                  GdkEventMotion *event,
                                  gpointer data)
{
    AppData *app = (AppData *)data;
    if (!app->is_dragging) return FALSE;

    double dx = event->x - app->drag_wx;
    double dy = event->y - app->drag_wy;
    double wr = sqrt(dx * dx + dy * dy);

    double rx, ry, rw, rh, scale;
    get_display_rect(app, &rx, &ry, &rw, &rh, &scale);
    app->radius = wr / scale;

    gtk_widget_queue_draw(widget);
    return TRUE;
}

static gboolean on_button_release(GtkWidget *widget,
                                   GdkEventButton *event,
                                   gpointer data)
{
    AppData *app = (AppData *)data;
    if (!app->is_dragging) return FALSE;
    if (event->button != 1) return FALSE;

    double dx = event->x - app->drag_wx;
    double dy = event->y - app->drag_wy;
    double wr = sqrt(dx * dx + dy * dy);

    double rx, ry, rw, rh, scale;
    get_display_rect(app, &rx, &ry, &rw, &rh, &scale);
    app->radius    = wr / scale;
    app->is_dragging = FALSE;

    if (app->radius >= 3.0) {
        app->has_selection = TRUE;
        int iw = gdk_pixbuf_get_width(app->original_pixbuf);
        int ih = gdk_pixbuf_get_height(app->original_pixbuf);
        gchar *msg = g_strdup_printf(
            "선택됨 — 중심: (%.0f, %.0f)  반지름: %.0fpx  |  이미지 크기: %d × %d",
            app->cx, app->cy, app->radius, iw, ih);
        gtk_label_set_text(GTK_LABEL(app->status_label), msg);
        g_free(msg);
    } else {
        app->has_selection = FALSE;
        gtk_label_set_text(GTK_LABEL(app->status_label),
                           "드래그하여 원형 영역을 선택하세요 (클릭=중심, 드래그=반지름)");
    }

    gtk_widget_queue_draw(widget);
    return TRUE;
}

/* -------------------------------------------------------------------------- */
/* 파일 열기 */
/* -------------------------------------------------------------------------- */

static void on_open_file(GtkMenuItem *item, gpointer data)
{
    (void)item;
    AppData *app = (AppData *)data;

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "이미지 열기", GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL,
        "_열기", GTK_RESPONSE_ACCEPT,
        NULL);

    /* 이미지 파일 필터 */
    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "이미지 파일");
    gtk_file_filter_add_mime_type(filter, "image/png");
    gtk_file_filter_add_mime_type(filter, "image/jpeg");
    gtk_file_filter_add_mime_type(filter, "image/bmp");
    gtk_file_filter_add_mime_type(filter, "image/gif");
    gtk_file_filter_add_mime_type(filter, "image/tiff");
    gtk_file_filter_add_mime_type(filter, "image/webp");
    gtk_file_filter_add_pattern(filter, "*.png");
    gtk_file_filter_add_pattern(filter, "*.jpg");
    gtk_file_filter_add_pattern(filter, "*.jpeg");
    gtk_file_filter_add_pattern(filter, "*.bmp");
    gtk_file_filter_add_pattern(filter, "*.gif");
    gtk_file_filter_add_pattern(filter, "*.tiff");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    GtkFileFilter *all = gtk_file_filter_new();
    gtk_file_filter_set_name(all, "모든 파일");
    gtk_file_filter_add_pattern(all, "*");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), all);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        gchar *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));

        GError    *error  = NULL;
        GdkPixbuf *pixbuf = gdk_pixbuf_new_from_file(filename, &error);

        if (pixbuf) {
            if (app->original_pixbuf) g_object_unref(app->original_pixbuf);
            app->original_pixbuf = pixbuf;
            g_free(app->current_file);
            app->current_file  = g_strdup(filename);
            app->has_selection = FALSE;
            app->is_dragging   = FALSE;

            gchar *title = g_strdup_printf("CircleIcon — %s", filename);
            gtk_window_set_title(GTK_WINDOW(app->window), title);
            g_free(title);

            gchar *msg = g_strdup_printf(
                "이미지 로드 완료: %d × %d px  |  드래그하여 원형 영역을 선택하세요",
                gdk_pixbuf_get_width(pixbuf),
                gdk_pixbuf_get_height(pixbuf));
            gtk_label_set_text(GTK_LABEL(app->status_label), msg);
            g_free(msg);

            gtk_widget_queue_draw(app->drawing_area);
        } else {
            GtkWidget *err = gtk_message_dialog_new(
                GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
                GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "이미지 로드 실패:\n%s", error->message);
            gtk_dialog_run(GTK_DIALOG(err));
            gtk_widget_destroy(err);
            g_error_free(error);
        }
        g_free(filename);
    }

    gtk_widget_destroy(dialog);
}

/* -------------------------------------------------------------------------- */
/* 원형 크롭 저장 */
/* -------------------------------------------------------------------------- */

static void on_save_circle(GtkMenuItem *item, gpointer data)
{
    (void)item;
    AppData *app = (AppData *)data;

    if (!app->original_pixbuf) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_WARNING, GTK_BUTTONS_OK,
            "먼저 이미지를 열어주세요.");
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        return;
    }

    if (!app->has_selection) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_WARNING, GTK_BUTTONS_OK,
            "먼저 원형 영역을 선택해주세요.\n"
            "이미지 위에서 클릭+드래그하면 원이 그려집니다.");
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        return;
    }

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "원형 이미지 저장 (PNG)", GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL);

    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), "circle_icon.png");

    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "PNG 파일 (*.png)");
    gtk_file_filter_add_pattern(filter, "*.png");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        gchar *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));

        /* .png 확장자 없으면 붙이기 */
        gchar *save_path;
        if (!g_str_has_suffix(filename, ".png") &&
            !g_str_has_suffix(filename, ".PNG")) {
            save_path = g_strconcat(filename, ".png", NULL);
        } else {
            save_path = g_strdup(filename);
        }

        double cx = app->cx;
        double cy = app->cy;
        double r  = app->radius;

        /* 출력 이미지 크기: 지름 × 지름 */
        int size = (int)(r * 2.0 + 0.5);
        if (size < 1) size = 1;

        /*
         * ARGB32 cairo 서피스 생성 후 원 클리핑으로 투명 배경 적용.
         * gdk_cairo_set_source_pixbuf(cr, pixbuf, dx, dy) 호출 시
         *   원본 이미지의 (0,0)이 서피스의 (dx, dy)에 매핑된다.
         * 원 중심 (cx, cy)를 서피스 중심 (r, r)로 옮기려면:
         *   dx = r - cx,  dy = r - cy
         */
        cairo_surface_t *surface =
            cairo_image_surface_create(CAIRO_FORMAT_ARGB32, size, size);
        cairo_t *cr = cairo_create(surface);

        /* 완전 투명으로 초기화 */
        cairo_set_operator(cr, CAIRO_OPERATOR_SOURCE);
        cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.0);
        cairo_paint(cr);

        /* 원 클리핑 */
        cairo_arc(cr, r, r, r, 0.0, 2.0 * G_PI);
        cairo_clip(cr);

        /* 원본 이미지 붙여넣기 */
        gdk_cairo_set_source_pixbuf(cr, app->original_pixbuf, r - cx, r - cy);
        cairo_paint(cr);

        cairo_destroy(cr);

        /* PNG 저장 */
        cairo_status_t status = cairo_surface_write_to_png(surface, save_path);
        cairo_surface_destroy(surface);

        if (status == CAIRO_STATUS_SUCCESS) {
            gchar *msg = g_strdup_printf(
                "저장 완료: %s  (%d × %d px, 투명 배경 PNG)",
                save_path, size, size);
            gtk_label_set_text(GTK_LABEL(app->status_label), msg);
            g_free(msg);

            GtkWidget *dlg = gtk_message_dialog_new(
                GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
                GTK_MESSAGE_INFO, GTK_BUTTONS_OK,
                "저장 완료!\n\n경로: %s\n크기: %d × %d px\n형식: PNG (투명 배경)",
                save_path, size, size);
            gtk_dialog_run(GTK_DIALOG(dlg));
            gtk_widget_destroy(dlg);
        } else {
            GtkWidget *dlg = gtk_message_dialog_new(
                GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
                GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "저장 실패: %s", cairo_status_to_string(status));
            gtk_dialog_run(GTK_DIALOG(dlg));
            gtk_widget_destroy(dlg);
        }

        g_free(filename);
        g_free(save_path);
    }

    gtk_widget_destroy(dialog);
}

/* -------------------------------------------------------------------------- */
/* 툴바 버튼 연결 */
/* -------------------------------------------------------------------------- */

static void on_toolbar_open(GtkToolButton *btn, gpointer data)
{
    (void)btn;
    on_open_file(NULL, data);
}

static void on_toolbar_save(GtkToolButton *btn, gpointer data)
{
    (void)btn;
    on_save_circle(NULL, data);
}

/* -------------------------------------------------------------------------- */
/* main */
/* -------------------------------------------------------------------------- */

int main(int argc, char *argv[])
{
    gtk_init(&argc, &argv);

    AppData app;
    memset(&app, 0, sizeof(app));

    /* ── 메인 윈도우 ───────────────────────────────────────────────────── */
    app.window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(app.window), "CircleIcon");
    gtk_window_set_default_size(GTK_WINDOW(app.window), 960, 700);
    g_signal_connect(app.window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(app.window), vbox);

    /* ── 메뉴바 ────────────────────────────────────────────────────────── */
    GtkWidget *menubar   = gtk_menu_bar_new();
    GtkWidget *file_menu = gtk_menu_new();
    GtkWidget *file_item = gtk_menu_item_new_with_mnemonic("_파일");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file_item), file_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), file_item);

    GtkWidget *open_item = gtk_menu_item_new_with_mnemonic("_열기");
    g_signal_connect(open_item, "activate", G_CALLBACK(on_open_file), &app);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), open_item);

    GtkWidget *save_item = gtk_menu_item_new_with_mnemonic("원형으로 _저장");
    g_signal_connect(save_item, "activate", G_CALLBACK(on_save_circle), &app);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), save_item);

    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
                          gtk_separator_menu_item_new());

    GtkWidget *quit_item = gtk_menu_item_new_with_mnemonic("_종료");
    g_signal_connect(quit_item, "activate", G_CALLBACK(gtk_main_quit), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), quit_item);

    gtk_box_pack_start(GTK_BOX(vbox), menubar, FALSE, FALSE, 0);

    /* ── 단축키 ────────────────────────────────────────────────────────── */
    GtkAccelGroup *accel = gtk_accel_group_new();
    gtk_window_add_accel_group(GTK_WINDOW(app.window), accel);
    gtk_widget_add_accelerator(open_item, "activate", accel,
                               GDK_KEY_o, GDK_CONTROL_MASK, GTK_ACCEL_VISIBLE);
    gtk_widget_add_accelerator(save_item, "activate", accel,
                               GDK_KEY_s, GDK_CONTROL_MASK, GTK_ACCEL_VISIBLE);
    gtk_widget_add_accelerator(quit_item, "activate", accel,
                               GDK_KEY_q, GDK_CONTROL_MASK, GTK_ACCEL_VISIBLE);

    /* ── 툴바 ──────────────────────────────────────────────────────────── */
    GtkWidget *toolbar = gtk_toolbar_new();
    gtk_toolbar_set_style(GTK_TOOLBAR(toolbar), GTK_TOOLBAR_BOTH_HORIZ);

    GtkToolItem *tbtn_open = gtk_tool_button_new(
        gtk_image_new_from_icon_name("document-open", GTK_ICON_SIZE_SMALL_TOOLBAR),
        "열기");
    gtk_tool_item_set_tooltip_text(tbtn_open, "이미지 열기 (Ctrl+O)");
    g_signal_connect(tbtn_open, "clicked", G_CALLBACK(on_toolbar_open), &app);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tbtn_open, -1);

    GtkToolItem *tbtn_save = gtk_tool_button_new(
        gtk_image_new_from_icon_name("document-save", GTK_ICON_SIZE_SMALL_TOOLBAR),
        "원형 저장");
    gtk_tool_item_set_tooltip_text(tbtn_save, "원형 영역을 PNG로 저장 (Ctrl+S)");
    g_signal_connect(tbtn_save, "clicked", G_CALLBACK(on_toolbar_save), &app);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tbtn_save, -1);

    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    /* ── Drawing Area ──────────────────────────────────────────────────── */
    app.drawing_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(app.drawing_area, TRUE);
    gtk_widget_set_vexpand(app.drawing_area, TRUE);
    gtk_widget_add_events(app.drawing_area,
                          GDK_BUTTON_PRESS_MASK   |
                          GDK_BUTTON_RELEASE_MASK |
                          GDK_POINTER_MOTION_MASK |
                          GDK_POINTER_MOTION_HINT_MASK);

    g_signal_connect(app.drawing_area, "draw",
                     G_CALLBACK(on_draw), &app);
    g_signal_connect(app.drawing_area, "button-press-event",
                     G_CALLBACK(on_button_press), &app);
    g_signal_connect(app.drawing_area, "button-release-event",
                     G_CALLBACK(on_button_release), &app);
    g_signal_connect(app.drawing_area, "motion-notify-event",
                     G_CALLBACK(on_motion_notify), &app);

    gtk_box_pack_start(GTK_BOX(vbox), app.drawing_area, TRUE, TRUE, 0);

    /* ── 상태 표시줄 ───────────────────────────────────────────────────── */
    GtkWidget *status_frame = gtk_frame_new(NULL);
    gtk_frame_set_shadow_type(GTK_FRAME(status_frame), GTK_SHADOW_IN);

    app.status_label = gtk_label_new(
        "파일 > 열기 (Ctrl+O) 로 이미지를 불러온 후, 클릭+드래그하여 원형 영역을 선택하세요");
    gtk_label_set_xalign(GTK_LABEL(app.status_label), 0.0);
    gtk_widget_set_margin_start(app.status_label, 8);
    gtk_widget_set_margin_end(app.status_label, 8);
    gtk_widget_set_margin_top(app.status_label, 4);
    gtk_widget_set_margin_bottom(app.status_label, 4);
    gtk_container_add(GTK_CONTAINER(status_frame), app.status_label);

    gtk_box_pack_start(GTK_BOX(vbox), status_frame, FALSE, FALSE, 0);

    /* ── 커맨드라인에서 파일 인수 처리 ───────────────────────────────── */
    if (argc >= 2) {
        GError    *error  = NULL;
        GdkPixbuf *pixbuf = gdk_pixbuf_new_from_file(argv[1], &error);
        if (pixbuf) {
            app.original_pixbuf = pixbuf;
            app.current_file    = g_strdup(argv[1]);
            gchar *title = g_strdup_printf("CircleIcon — %s", argv[1]);
            gtk_window_set_title(GTK_WINDOW(app.window), title);
            g_free(title);
            gchar *msg = g_strdup_printf(
                "이미지 로드 완료: %d × %d px  |  드래그하여 원형 영역을 선택하세요",
                gdk_pixbuf_get_width(pixbuf), gdk_pixbuf_get_height(pixbuf));
            gtk_label_set_text(GTK_LABEL(app.status_label), msg);
            g_free(msg);
        } else {
            fprintf(stderr, "파일 열기 실패: %s\n", error->message);
            g_error_free(error);
        }
    }

    /* ── 표시 및 메인 루프 ────────────────────────────────────────────── */
    gtk_widget_show_all(app.window);
    gtk_main();

    /* 정리 */
    if (app.original_pixbuf) g_object_unref(app.original_pixbuf);
    g_free(app.current_file);

    return 0;
}
