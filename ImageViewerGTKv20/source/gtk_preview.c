#include "gtk_preview.h"
#include "assets.h"
#include "gtk_browser.h"
#include "gtk_editor.h"
#include "image_io.h"
#include "utils.h"

#include <cairo/cairo.h>
#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gdk/gdkkeysyms.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#ifdef HAVE_LIBVLC
#include <vlc/vlc.h>
#if defined(GDK_WINDOWING_X11)
#include <gdk/gdkx.h>
#endif
#if defined(GDK_WINDOWING_QUARTZ)
#include <gdk/gdkquartz.h>
#endif
#endif

/* 갤러리 썸네일: 정사각형 이미지 + 아래 파일명 (고정 크기, 빈 공간 채우지 않음) */
#define THUMB_SIZE 128
#define THUMB_LABEL_H 34
#define THUMB_CARD_GAP 4
#define THUMB_NAME_MAX_CHARS 14

typedef struct {
    guint generation;
    char *path;
    gboolean heif_commit;
    gboolean keep_gallery_visible;
} PreviewLoadRequest;

typedef struct {
    guint generation;
    char *path;
    char *edit_path;
    GdkPixbuf *pixbuf;
    GError *error;
    gboolean heif_commit;
} PreviewLoadResult;

typedef struct {
    guint generation;
    char *path;
} ThumbWorkRequest;

typedef struct {
    guint generation;
    char *path;
    GdkPixbuf *pixbuf;
    char *ext_label;
    gboolean use_hif_icon;
} ThumbDecodeResult;

typedef struct {
    guint generation;
    char *edit_path;
    ImageTransform op;
} TransformRequest;

typedef struct {
    guint generation;
    GdkPixbuf *pixbuf;
    GError *error;
} TransformResult;

static void preview_load_request_free(PreviewLoadRequest *req) {
    if (!req) {
        return;
    }
    g_free(req->path);
    g_free(req);
}

static void preview_load_result_free(PreviewLoadResult *res) {
    if (!res) {
        return;
    }
    g_free(res->path);
    g_free(res->edit_path);
    if (res->pixbuf) {
        g_object_unref(res->pixbuf);
    }
    g_clear_error(&res->error);
    g_free(res);
}

static void thumb_work_request_free(ThumbWorkRequest *req) {
    if (!req) {
        return;
    }
    g_free(req->path);
    g_free(req);
}

static void thumb_decode_result_free(ThumbDecodeResult *res) {
    if (!res) {
        return;
    }
    g_free(res->path);
    g_free(res->ext_label);
    if (res->pixbuf) {
        g_object_unref(res->pixbuf);
    }
    g_free(res);
}

static void transform_request_free(TransformRequest *req) {
    if (!req) {
        return;
    }
    g_free(req->edit_path);
    g_free(req);
}

static void transform_result_free(TransformResult *res) {
    if (!res) {
        return;
    }
    if (res->pixbuf) {
        g_object_unref(res->pixbuf);
    }
    g_clear_error(&res->error);
    g_free(res);
}

static gint ptr_str_compare(gconstpointer a, gconstpointer b) {
    return g_ascii_strcasecmp((const char *)a, (const char *)b);
}

static void preview_queue_image_redraw(App *app) {
    if (app->image_da && GTK_IS_WIDGET(app->image_da) &&
        gtk_widget_get_realized(app->image_da)) {
        gtk_widget_queue_draw(app->image_da);
    }
}

static void preview_image_scaled_size(App *app, int *w_out, int *h_out) {
    int iw = 1;
    int ih = 1;
    if (app->image_pixbuf && app->image_nat_w > 0 && app->image_nat_h > 0) {
        iw = MAX(1, (int)(app->image_nat_w * app->zoom_factor));
        ih = MAX(1, (int)(app->image_nat_h * app->zoom_factor));
    }
    if (w_out) {
        *w_out = iw;
    }
    if (h_out) {
        *h_out = ih;
    }
}

/* 드로잉 영역을 max(이미지, 뷰포트) 크기로 설정.
 * 이미지 < 뷰포트: 드로잉 영역이 뷰포트를 채워 on_image_draw 에서 중앙 배치.
 * 이미지 > 뷰포트: 드로잉 영역이 이미지 크기 → GtkScrolledWindow 스크롤바 표시. */
static void preview_update_image_scroll_size(App *app) {
    if (!app->image_da || !app->image_viewport) {
        return;
    }
    int iw, ih;
    preview_image_scaled_size(app, &iw, &ih);

    int vw = gtk_widget_get_allocated_width(app->image_viewport);
    int vh = gtk_widget_get_allocated_height(app->image_viewport);

    gtk_widget_set_size_request(app->image_da, MAX(iw, vw), MAX(ih, vh));
    gtk_widget_queue_resize(app->image_da);
    preview_queue_image_redraw(app);
}

static void preview_image_scroll_reset(App *app) {
    if (!app->image_scrolled) {
        return;
    }
    GtkAdjustment *hadj =
        gtk_scrolled_window_get_hadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));
    GtkAdjustment *vadj =
        gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));
    if (hadj) {
        gtk_adjustment_set_value(hadj, gtk_adjustment_get_lower(hadj));
    }
    if (vadj) {
        gtk_adjustment_set_value(vadj, gtk_adjustment_get_lower(vadj));
    }
}

static void preview_image_scroll_set(GtkAdjustment *adj, double value) {
    if (!adj) {
        return;
    }
    double lower = gtk_adjustment_get_lower(adj);
    double upper = gtk_adjustment_get_upper(adj);
    double page = gtk_adjustment_get_page_size(adj);
    double max_val = MAX(lower, upper - page);
    gtk_adjustment_set_value(adj, CLAMP(value, lower, max_val));
}

static void preview_image_pan_end(App *app) {
    if (!app->image_panning) {
        return;
    }
    app->image_panning = FALSE;
    GdkDisplay *dpy = gdk_display_get_default();
    if (dpy) {
        GdkSeat *seat = gdk_display_get_default_seat(dpy);
        if (seat) {
            gdk_seat_ungrab(seat);
        }
    }
    if (app->image_viewport && gtk_widget_get_window(app->image_viewport)) {
        gdk_window_set_cursor(gtk_widget_get_window(app->image_viewport), NULL);
    }
    if (app->image_da && gtk_widget_get_window(app->image_da)) {
        gdk_window_set_cursor(gtk_widget_get_window(app->image_da), NULL);
    }
}

static void preview_clear_media(App *app) {
    preview_image_pan_end(app);
    if (app->image_pixbuf) {
        g_object_unref(app->image_pixbuf);
        app->image_pixbuf = NULL;
    }
    g_free(app->image_path);
    app->image_path = NULL;
    g_free(app->image_edit_path);
    app->image_edit_path = NULL;
#ifdef HAVE_LIBVLC
    if (app->vlc_player) {
        libvlc_media_player_stop((libvlc_media_player_t *)app->vlc_player);
        libvlc_media_player_set_media((libvlc_media_player_t *)app->vlc_player, NULL);
    }
    if (app->vlc_media) {
        libvlc_media_release((libvlc_media_t *)app->vlc_media);
        app->vlc_media = NULL;
    }
#endif
    preview_queue_image_redraw(app);
}

static void stack_show(App *app, GtkWidget *page) {
    gtk_stack_set_visible_child(GTK_STACK(app->preview_stack), page);
}

static GdkPixbuf *scale_fit(GdkPixbuf *src, int tw, int th) {
    if (!src || !GDK_IS_PIXBUF(src)) {
        return NULL;
    }
    int sw = gdk_pixbuf_get_width(src);
    int sh = gdk_pixbuf_get_height(src);
    double r = fmin((double)tw / sw, (double)th / sh);
    int w = MAX(1, (int)(sw * r));
    int h = MAX(1, (int)(sh * r));
    GdkPixbuf *scaled = gdk_pixbuf_scale_simple(src, w, h, GDK_INTERP_BILINEAR);
    if (!scaled) {
        return NULL;
    }
    GdkPixbuf *out = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, tw, th);
    if (!out) {
        g_object_unref(scaled);
        return NULL;
    }
    gdk_pixbuf_fill(out, 0x0f0f12ff);
    int x = (tw - w) / 2;
    int y = (th - h) / 2;
    gdk_pixbuf_copy_area(scaled, 0, 0, w, h, out, x, y);
    g_object_unref(scaled);
    return out;
}

static GdkPixbuf *build_video_placeholder(int w, int h) {
    GdkPixbuf *pb = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, w, h);
    gdk_pixbuf_fill(pb, 0x14161cff);
    return pb;
}

/* 갤러리용 확장자 아이콘 (HIF·디코딩 실패 등) */
static GdkPixbuf *build_ext_file_icon(int w, int h, const char *label,
                                      double fill_r, double fill_g, double fill_b,
                                      double edge_r, double edge_g, double edge_b) {
    cairo_surface_t *surface =
        cairo_image_surface_create(CAIRO_FORMAT_ARGB32, w, h);
    cairo_t *cr = cairo_create(surface);

    cairo_set_source_rgb(cr, 0.08, 0.09, 0.11);
    cairo_paint(cr);

    double doc_w = w * 0.52;
    double doc_h = h * 0.58;
    double doc_x = (w - doc_w) / 2.0;
    double doc_y = (h - doc_h) / 2.0 - 4;
    double fold = doc_w * 0.22;

    cairo_set_source_rgb(cr, fill_r, fill_g, fill_b);
    cairo_move_to(cr, doc_x, doc_y);
    cairo_line_to(cr, doc_x + doc_w - fold, doc_y);
    cairo_line_to(cr, doc_x + doc_w, doc_y + fold);
    cairo_line_to(cr, doc_x + doc_w, doc_y + doc_h);
    cairo_line_to(cr, doc_x, doc_y + doc_h);
    cairo_close_path(cr);
    cairo_fill_preserve(cr);
    cairo_set_source_rgb(cr, edge_r, edge_g, edge_b);
    cairo_set_line_width(cr, 1.2);
    cairo_stroke(cr);

    cairo_set_source_rgb(cr, fill_r + 0.09, fill_g + 0.11, fill_b + 0.10);
    cairo_move_to(cr, doc_x + doc_w - fold, doc_y);
    cairo_line_to(cr, doc_x + doc_w - fold, doc_y + fold);
    cairo_line_to(cr, doc_x + doc_w, doc_y + fold);
    cairo_close_path(cr);
    cairo_fill(cr);

    cairo_select_font_face(cr, "Sans", CAIRO_FONT_SLANT_NORMAL,
                           CAIRO_FONT_WEIGHT_BOLD);
    cairo_set_font_size(cr, h * 0.17);
    cairo_text_extents_t ext;
    cairo_text_extents(cr, label, &ext);
    cairo_set_source_rgb(cr, 1.0, 1.0, 1.0);
    cairo_move_to(cr, (w - ext.width) / 2.0 - ext.x_bearing,
                  doc_y + doc_h * 0.62 - ext.height / 2.0);
    cairo_show_text(cr, label);

    cairo_destroy(cr);

    GdkPixbuf *pb = gdk_pixbuf_get_from_surface(surface, 0, 0, w, h);
    cairo_surface_destroy(surface);
    if (!pb) {
        return build_video_placeholder(w, h);
    }
    return pb;
}

static GdkPixbuf *get_ext_gallery_thumb(const char *label,
                                        double fill_r, double fill_g, double fill_b,
                                        double edge_r, double edge_g, double edge_b) {
    static GHashTable *icon_cache;
    if (!icon_cache) {
        icon_cache = g_hash_table_new_full(g_str_hash, g_str_equal, g_free, g_object_unref);
    }
    char *key = g_strdup_printf("%.2f|%.2f|%.2f|%s", fill_r, fill_g, fill_b, label);
    GdkPixbuf *cached = g_hash_table_lookup(icon_cache, key);
    if (cached) {
        g_free(key);
        return g_object_ref(cached);
    }
    GdkPixbuf *icon = build_ext_file_icon(THUMB_SIZE, THUMB_SIZE, label,
                                          fill_r, fill_g, fill_b,
                                          edge_r, edge_g, edge_b);
    g_hash_table_insert(icon_cache, key, g_object_ref(icon));
    return icon;
}

static GdkPixbuf *get_hif_gallery_thumb(void) {
    GdkPixbuf *src = assets_load_icon("file-heif.png", THUMB_SIZE);
    if (src) {
        GdkPixbuf *thumb = scale_fit(src, THUMB_SIZE, THUMB_SIZE);
        g_object_unref(src);
        if (thumb) {
            return thumb;
        }
    }
    return get_ext_gallery_thumb("HIF", 0.26, 0.67, 0.55, 0.18, 0.48, 0.40);
}

void preview_clear(App *app) {
    app->preview_op_gen++;
    preview_cancel_thumbnails(app);
    preview_clear_media(app);
}

void preview_cancel_thumbnails(App *app) {
    app->thumb_generation++;
    if (app->thumb_idle_id) {
        g_source_remove(app->thumb_idle_id);
        app->thumb_idle_id = 0;
    }
    if (app->thumb_paths) {
        g_list_free_full(app->thumb_paths, g_free);
        app->thumb_paths = NULL;
    }
    app->thumb_index = 0;

    app->gallery_selected_btn = NULL;
    if (app->gallery_flow && GTK_IS_FLOW_BOX(app->gallery_flow)) {
        GtkFlowBox *flow = GTK_FLOW_BOX(app->gallery_flow);
        GtkFlowBoxChild *child;
        while ((child = gtk_flow_box_get_child_at_index(flow, 0)) != NULL) {
            gtk_widget_destroy(GTK_WIDGET(child));
        }
    }
}

void preview_set_toolbar_visible(App *app, gboolean visible) {
    if (!app->image_toolbar) {
        return;
    }
    if (visible) {
        gtk_widget_show(app->image_toolbar);
    } else {
        gtk_widget_hide(app->image_toolbar);
    }
}

void preview_show_placeholder(App *app, const char *text) {
    preview_clear(app);
    preview_set_toolbar_visible(app, FALSE);
    gtk_label_set_text(GTK_LABEL(app->placeholder_label), text);
    stack_show(app, app->placeholder_label);
}

static gboolean on_image_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
    App *app = data;
    int da_w = gtk_widget_get_allocated_width(widget);
    int da_h = gtk_widget_get_allocated_height(widget);
    cairo_set_source_rgb(cr, 0.08, 0.08, 0.1);
    cairo_paint(cr);

    if (!app->image_pixbuf) {
        return FALSE;
    }

    int iw, ih;
    preview_image_scaled_size(app, &iw, &ih);

    GdkPixbuf *scaled = gdk_pixbuf_scale_simple(
        app->image_pixbuf, iw, ih, GDK_INTERP_BILINEAR);
    if (!scaled) {
        return FALSE;
    }

    /* 드로잉 영역(= max(이미지, 뷰포트)) 안에서 이미지를 중앙 배치 */
    int x = (da_w - iw) / 2;
    int y = (da_h - ih) / 2;
    gdk_cairo_set_source_pixbuf(cr, scaled, x, y);
    cairo_paint(cr);
    g_object_unref(scaled);
    return FALSE;
}

static double calc_fit_zoom(App *app) {
    int vw = gtk_widget_get_allocated_width(app->image_viewport);
    int vh = gtk_widget_get_allocated_height(app->image_viewport);
    if (vw < 1) {
        vw = 400;
    }
    if (vh < 1) {
        vh = 300;
    }
    double sx = (double)vw / app->image_nat_w;
    double sy = (double)vh / app->image_nat_h;
    double fit = fmin(sx, sy);
    return CLAMP(fit, 0.05, 16.0);
}

static void update_zoom_label(App *app) {
    if (!app->image_pixbuf) {
        gtk_label_set_text(GTK_LABEL(app->zoom_label), "—");
        return;
    }
    int g = utils_gcd(app->image_nat_w, app->image_nat_h);
    char *txt = g_strdup_printf(
        "%.1f%% · %d:%d · %d×%d",
        app->zoom_factor * 100.0,
        app->image_nat_w / g, app->image_nat_h / g,
        app->image_nat_w, app->image_nat_h);
    gtk_label_set_text(GTK_LABEL(app->zoom_label), txt);
    g_free(txt);
}

static gboolean on_image_scroll(GtkWidget *w, GdkEventScroll *ev, gpointer data) {
    (void)w;
    App *app = data;
    if (!app->image_pixbuf) {
        return FALSE;
    }
    double step = (ev->direction == GDK_SCROLL_UP || ev->delta_y < 0) ? 1.1 : 1.0 / 1.1;
    app->zoom_factor = CLAMP(app->zoom_factor * step, 0.05, 16.0);
    app->zoom_fit_mode = FALSE;
    update_zoom_label(app);
    preview_update_image_scroll_size(app);
    return TRUE;
}

static gboolean on_image_pan_press(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    if (event->type != GDK_BUTTON_PRESS || event->button != 1) {
        return FALSE;
    }

    App *app = data;
    if (!app->image_pixbuf || !app->image_scrolled) {
        return FALSE;
    }

    GtkAdjustment *hadj =
        gtk_scrolled_window_get_hadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));
    GtkAdjustment *vadj =
        gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));
    if (!hadj || !vadj) {
        return FALSE;
    }

    app->image_panning = TRUE;
    app->pan_start_x = (int)event->x_root;
    app->pan_start_y = (int)event->y_root;
    app->pan_start_h = gtk_adjustment_get_value(hadj);
    app->pan_start_v = gtk_adjustment_get_value(vadj);

    GdkWindow *win = gtk_widget_get_window(widget);
    if (win) {
        GdkDevice *device = gdk_event_get_device((GdkEvent *)event);
        GdkSeat *seat = device ? gdk_device_get_seat(device)
                               : gdk_display_get_default_seat(gdk_window_get_display(win));
        if (seat) {
            gdk_seat_grab(seat, win, GDK_SEAT_CAPABILITY_POINTER, FALSE, NULL, NULL, NULL,
                          NULL);
        }
        GdkCursor *cur =
            gdk_cursor_new_for_display(gdk_window_get_display(win), GDK_FLEUR);
        gdk_window_set_cursor(win, cur);
        g_object_unref(cur);
    }
    return TRUE;
}

static gboolean on_image_pan_motion(GtkWidget *widget, GdkEventMotion *event, gpointer data) {
    (void)widget;
    App *app = data;
    if (!app->image_panning || !app->image_scrolled) {
        return FALSE;
    }

    GtkAdjustment *hadj =
        gtk_scrolled_window_get_hadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));
    GtkAdjustment *vadj =
        gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(app->image_scrolled));

    int dx = (int)event->x_root - app->pan_start_x;
    int dy = (int)event->y_root - app->pan_start_y;
    preview_image_scroll_set(hadj, app->pan_start_h - dx);
    preview_image_scroll_set(vadj, app->pan_start_v - dy);
    return TRUE;
}

static gboolean on_image_pan_release(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    (void)widget;
    if (event->type != GDK_BUTTON_RELEASE || event->button != 1) {
        return FALSE;
    }

    App *app = data;
    if (!app->image_panning) {
        return FALSE;
    }
    preview_image_pan_end(app);
    return TRUE;
}

static gboolean on_thumb_button_press(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    if (event->type != GDK_BUTTON_PRESS) {
        return FALSE;
    }
    if (event->button != 1 && event->button != 3) {
        return FALSE;
    }

    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(widget), "file-path");
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return FALSE;
    }

    browser_set_gallery_thumb_highlight(app, widget);

    if (event->button == 1) {
        browser_sync_file_list_to_path(app, path);
        browser_show_file_for_path(app, path, TRUE);
    } else {
        browser_show_file_actions_menu(app, path, (GdkEvent *)event);
    }
    return TRUE;
}

static char *thumb_format_basename(const char *path) {
    const char *base = g_path_get_basename(path);
    if (!base || !*base) {
        return g_strdup("");
    }

    glong n_chars = g_utf8_strlen(base, -1);
    if (n_chars <= THUMB_NAME_MAX_CHARS) {
        return g_strdup(base);
    }

    const char *end = g_utf8_offset_to_pointer(base, THUMB_NAME_MAX_CHARS);
    size_t byte_len = (size_t)(end - base);
    char *out = g_malloc(byte_len + 4);
    memcpy(out, base, byte_len);
    memcpy(out + byte_len, "...", 4);
    return out;
}

static void thumb_card_configure_no_expand(GtkWidget *btn) {
    gtk_widget_set_hexpand(btn, FALSE);
    gtk_widget_set_vexpand(btn, FALSE);
    gtk_widget_set_halign(btn, GTK_ALIGN_START);
    gtk_widget_set_valign(btn, GTK_ALIGN_START);
}

static GtkWidget *make_thumb_card(App *app, const char *path, GdkPixbuf *thumb) {
    if (!thumb || !GDK_IS_PIXBUF(thumb) || !app->gallery_flow ||
        !GTK_IS_FLOW_BOX(app->gallery_flow)) {
        return NULL;
    }

    const int card_w = THUMB_SIZE;
    const int card_h = THUMB_SIZE + THUMB_LABEL_H + THUMB_CARD_GAP;

    GtkWidget *img = gtk_image_new_from_pixbuf(thumb);
    gtk_widget_set_size_request(img, THUMB_SIZE, THUMB_SIZE);
    gtk_widget_set_halign(img, GTK_ALIGN_CENTER);
    gtk_widget_set_hexpand(img, FALSE);
    gtk_widget_set_vexpand(img, FALSE);

    char *name = thumb_format_basename(path);
    GtkWidget *lbl = gtk_label_new(name);
    g_free(name);
    gtk_label_set_xalign(GTK_LABEL(lbl), 0.5);
    gtk_label_set_justify(GTK_LABEL(lbl), GTK_JUSTIFY_CENTER);
    gtk_label_set_line_wrap(GTK_LABEL(lbl), TRUE);
    gtk_label_set_line_wrap_mode(GTK_LABEL(lbl), PANGO_WRAP_WORD_CHAR);
    gtk_label_set_max_width_chars(GTK_LABEL(lbl), THUMB_NAME_MAX_CHARS);
    gtk_widget_set_size_request(lbl, THUMB_SIZE, THUMB_LABEL_H);
    gtk_widget_set_halign(lbl, GTK_ALIGN_CENTER);
    gtk_widget_set_hexpand(lbl, FALSE);
    gtk_widget_set_vexpand(lbl, FALSE);

    GtkWidget *btn = gtk_button_new();
    gtk_button_set_relief(GTK_BUTTON(btn), GTK_RELIEF_NONE);
    gtk_widget_set_size_request(btn, card_w, card_h);

    GtkWidget *inner = gtk_box_new(GTK_ORIENTATION_VERTICAL, THUMB_CARD_GAP);
    gtk_widget_set_halign(inner, GTK_ALIGN_CENTER);
    gtk_widget_set_hexpand(inner, FALSE);
    gtk_widget_set_vexpand(inner, FALSE);
    gtk_box_pack_start(GTK_BOX(inner), img, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(inner), lbl, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(btn), inner);
    g_object_set_data_full(G_OBJECT(btn), "file-path", g_strdup(path), g_free);
    gtk_widget_add_events(btn, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(btn, "button-press-event", G_CALLBACK(on_thumb_button_press), app);

    gtk_flow_box_insert(GTK_FLOW_BOX(app->gallery_flow), btn, -1);
    thumb_card_configure_no_expand(btn);
    gtk_widget_show_all(btn);
    return btn;
}

static GdkPixbuf *decode_gallery_thumb_bg(const char *path, char **ext_label_out,
                                          gboolean *use_hif_icon_out) {
    *ext_label_out = NULL;
    *use_hif_icon_out = FALSE;

    const char *dot = strrchr(path, '.');
    const char *ext = dot ? dot : "";

    if (utils_is_hif_path(path)) {
        *use_hif_icon_out = TRUE;
        return NULL;
    }
    if (utils_is_image_ext(ext)) {
        GError *err = NULL;
        GdkPixbuf *src = image_io_load_pixbuf(path, &err);
        if (src) {
            GdkPixbuf *thumb = scale_fit(src, THUMB_SIZE, THUMB_SIZE);
            g_object_unref(src);
            return thumb;
        }
        g_clear_error(&err);
        *ext_label_out = utils_ext_display_label(path);
        return NULL;
    }
    if (utils_is_video_ext(ext)) {
        return build_video_placeholder(THUMB_SIZE, THUMB_SIZE);
    }
    return NULL;
}

static void thumb_decode_worker(GTask *task, gpointer source, gpointer data,
                              GCancellable *cancel) {
    (void)source;
    (void)cancel;
    ThumbWorkRequest *req = data;
    ThumbDecodeResult *res = g_new0(ThumbDecodeResult, 1);
    res->generation = req->generation;
    res->path = g_strdup(req->path);
    res->pixbuf = decode_gallery_thumb_bg(req->path, &res->ext_label, &res->use_hif_icon);
    g_task_return_pointer(task, res, (GDestroyNotify)thumb_decode_result_free);
}

static void thumb_start_next(App *app);

static void thumb_decode_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    ThumbDecodeResult *res = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!res) {
        g_clear_error(&task_err);
        thumb_start_next(app);
        return;
    }

    if (res->generation != app->thumb_generation || !app->thumb_paths ||
        !app->gallery_flow || !GTK_IS_FLOW_BOX(app->gallery_flow)) {
        thumb_decode_result_free(res);
        return;
    }

    GdkPixbuf *thumb = NULL;
    if (res->use_hif_icon) {
        thumb = get_hif_gallery_thumb();
    } else if (res->pixbuf) {
        thumb = res->pixbuf;
        res->pixbuf = NULL;
    } else if (res->ext_label) {
        const char *icon_file = assets_icon_file_for_path(res->path);
        GdkPixbuf *src = assets_load_icon(icon_file, THUMB_SIZE);
        if (src) {
            thumb = scale_fit(src, THUMB_SIZE, THUMB_SIZE);
            g_object_unref(src);
        }
        if (!thumb) {
            thumb = get_ext_gallery_thumb(res->ext_label, 0.35, 0.45, 0.65, 0.22, 0.30,
                                          0.48);
        }
    }

    if (thumb && GDK_IS_PIXBUF(thumb)) {
        make_thumb_card(app, res->path, thumb);
        g_object_unref(thumb);
    }

    app->thumb_index++;
    guint total = g_list_length(app->thumb_paths);
    char *st = g_strdup_printf("썸네일 로딩 중... %u/%u", app->thumb_index, total);
    gtk_app_update_status_file(app, st);
    g_free(st);

    thumb_decode_result_free(res);
    thumb_start_next(app);
}

static void thumb_start_next(App *app) {
    if (!app->thumb_paths || !app->gallery_flow || !GTK_IS_FLOW_BOX(app->gallery_flow)) {
        return;
    }

    guint total = g_list_length(app->thumb_paths);
    if (app->thumb_index >= total) {
        char *msg = g_strdup_printf("썸네일 로딩 완료: %u개", total);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
        return;
    }

    const char *path = g_list_nth_data(app->thumb_paths, app->thumb_index);

    ThumbWorkRequest *req = g_new(ThumbWorkRequest, 1);
    req->generation = app->thumb_generation;
    req->path = g_strdup(path);

    /* App 은 GObject 가 아님 — source 에 넣으면 g_object_ref CRITICAL 발생 */
    GTask *task = g_task_new(NULL, NULL, thumb_decode_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)thumb_work_request_free);
    g_task_run_in_thread(task, thumb_decode_worker);
    g_object_unref(task);
}

static void preview_show_gallery_internal(App *app, const char *folder, gboolean quiet) {
    if (!quiet) {
        app->preview_op_gen++;
    }
    preview_cancel_thumbnails(app);
    preview_clear_media(app);
    preview_set_toolbar_visible(app, FALSE);
    stack_show(app, app->gallery_scrolled);
    gtk_widget_show_all(app->gallery_scrolled);

    GDir *dir = g_dir_open(folder, 0, NULL);
    if (!dir) {
        preview_show_placeholder(app, "폴더를 읽을 수 없습니다.");
        return;
    }

    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') {
            continue;
        }
        char *path = g_build_filename(folder, name, NULL);
        if (g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
            const char *dot = strrchr(path, '.');
            const char *ext = dot ? dot : "";
            if (utils_is_previewable_ext(ext)) {
                app->thumb_paths = g_list_append(app->thumb_paths, path);
            } else {
                g_free(path);
            }
        } else {
            g_free(path);
        }
    }
    g_dir_close(dir);

    if (!app->thumb_paths) {
        preview_show_placeholder(app, "이 폴더에 미리보기 가능한 파일이 없습니다.");
        return;
    }

    app->thumb_paths = g_list_sort(app->thumb_paths, ptr_str_compare);
    app->thumb_index = 0;

    if (!quiet) {
        gtk_app_update_status_file(app, "썸네일을 불러오는 중…");
    }
    thumb_start_next(app);
}

void preview_show_gallery(App *app, const char *folder) {
    preview_show_gallery_internal(app, folder, FALSE);
}

void preview_refresh_gallery(App *app, const char *folder) {
    preview_show_gallery_internal(app, folder, TRUE);
}

static void show_image_error_dialog(App *app, const char *path, GError *err) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING,
        GTK_BUTTONS_OK,
        "%s",
        utils_is_heif_path(path)
            ? "HIF/HEIF 파일을 변환할 수 없습니다.\n\n"
              "libheif-dev 설치 후 make install-deps && make 로\n"
              "다시 빌드해 주세요."
            : "이미지를 열 수 없습니다.");
    if (err && err->message) {
        gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                 "%s", err->message);
    }
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static void set_image_pixbuf(App *app, GdkPixbuf *pb) {
    if (app->image_pixbuf) {
        g_object_unref(app->image_pixbuf);
    }
    app->image_pixbuf = pb;
    app->image_nat_w = gdk_pixbuf_get_width(pb);
    app->image_nat_h = gdk_pixbuf_get_height(pb);
    app->zoom_fit_mode = TRUE;
    app->zoom_factor = calc_fit_zoom(app);
    update_zoom_label(app);
    preview_update_image_scroll_size(app);
    preview_image_scroll_reset(app);
}

static void preview_load_worker(GTask *task, gpointer source, gpointer data,
                                GCancellable *cancel) {
    (void)source;
    (void)cancel;
    PreviewLoadRequest *req = data;
    PreviewLoadResult *res = g_new0(PreviewLoadResult, 1);
    res->generation = req->generation;
    res->heif_commit = req->heif_commit;
    res->path = g_strdup(req->path);

    if (req->heif_commit) {
        res->edit_path = image_io_heif_jpg_path(req->path);
        if (!res->edit_path) {
            res->error = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                     "HEIF 디코딩 실패");
        } else {
            res->pixbuf = gdk_pixbuf_new_from_file(res->edit_path, &res->error);
            if (g_file_test(req->path, G_FILE_TEST_EXISTS)) {
                image_io_move_heif_to_subdir(req->path);
            }
        }
    } else if (utils_is_heif_path(req->path)) {
        char *existing_jpg = image_io_heif_existing_jpg_path(req->path);
        if (existing_jpg) {
            res->pixbuf = gdk_pixbuf_new_from_file(existing_jpg, &res->error);
            res->edit_path = existing_jpg;
        } else {
            res->pixbuf = image_io_load_pixbuf(req->path, &res->error);
        }
    } else {
        res->edit_path = g_strdup(req->path);
        res->pixbuf = gdk_pixbuf_new_from_file(req->path, &res->error);
    }

    g_task_return_pointer(task, res, (GDestroyNotify)preview_load_result_free);
}

static void preview_load_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    PreviewLoadResult *res = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!res) {
        g_clear_error(&task_err);
        return;
    }

    if (res->heif_commit) {
        if (res->generation != app->heif_commit_gen) {
            preview_load_result_free(res);
            return;
        }
    } else if (res->generation != app->preview_op_gen) {
        preview_load_result_free(res);
        return;
    }

    if (!res->pixbuf) {
        show_image_error_dialog(app, res->path, res->error);
        if (res->heif_commit) {
            gtk_app_update_status_file(app, "HIF/HEIF 변환에 실패했습니다.");
            if (app->current_folder) {
                preview_refresh_gallery(app, app->current_folder);
            } else {
                preview_show_placeholder(app, "HIF/HEIF 변환 실패");
            }
        } else {
            preview_show_placeholder(app,
                                   utils_is_heif_path(res->path)
                                       ? "HIF/HEIF 미리보기 실패 (libheif 필요)"
                                       : "이미지를 열 수 없습니다.");
        }
        preview_load_result_free(res);
        return;
    }

    if (res->heif_commit) {
        char *jpg_path = res->edit_path;
        if (jpg_path && g_file_test(jpg_path, G_FILE_TEST_EXISTS)) {
            g_free(app->selected_file);
            app->selected_file = g_strdup(jpg_path);
            browser_refresh_after_heif_commit(app, jpg_path, res->path);
        } else if (app->current_folder) {
            preview_refresh_gallery(app, app->current_folder);
        }
        preview_load_result_free(res);
        return;
    }

    g_free(app->image_path);
    g_free(app->image_edit_path);
    app->image_path = g_strdup(res->path);
    app->image_edit_path = g_steal_pointer(&res->edit_path);

    preview_set_toolbar_visible(app, app->image_edit_path != NULL);

    GdkPixbuf *pb = g_steal_pointer(&res->pixbuf);
    set_image_pixbuf(app, pb);
    stack_show(app, app->image_page);

    char *basename = g_path_get_basename(res->path);
    gtk_app_update_status_file(app, basename);
    g_free(basename);

    preview_load_result_free(res);
}

static void preview_start_load(App *app, const char *path, gboolean heif_commit,
                               gboolean keep_gallery_visible) {
    PreviewLoadRequest *req = g_new(PreviewLoadRequest, 1);
    if (heif_commit) {
        app->heif_commit_gen++;
        req->generation = app->heif_commit_gen;
        if (!keep_gallery_visible) {
            app->preview_op_gen++;
            preview_clear_media(app);
        }
    } else {
        app->preview_op_gen++;
        req->generation = app->preview_op_gen;
        preview_clear_media(app);
    }
    req->path = g_strdup(path);
    req->heif_commit = heif_commit;
    req->keep_gallery_visible = keep_gallery_visible;

    if (heif_commit) {
        gtk_app_update_status_file(app, "HIF/HEIF 변환 중…");
        if (!keep_gallery_visible) {
            preview_show_placeholder(app, "변환 중입니다…");
        }
    } else {
        gtk_app_update_status_file(app, "이미지를 불러오는 중…");
    }

    GTask *task = g_task_new(NULL, NULL, preview_load_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)preview_load_request_free);
    g_task_run_in_thread(task, preview_load_worker);
    g_object_unref(task);
}

void preview_show_image(App *app, const char *path) {
    if (browser_is_context_menu_event(app)) {
        return;
    }
    preview_cancel_thumbnails(app);
    preview_clear_media(app);
    preview_start_load(app, path, FALSE, FALSE);
}

void preview_commit_heif_file(App *app, const char *path) {
    if (browser_is_context_menu_event(app)) {
        return;
    }
    if (!utils_is_heif_path(path)) {
        preview_show_image(app, path);
        return;
    }

    /* 갤러리·목록 유지: preview_clear()는 썸네일을 모두 지우므로 호출하지 않음 */
    preview_start_load(app, path, TRUE, TRUE);
}

static void transform_worker(GTask *task, gpointer source, gpointer data, GCancellable *cancel) {
    (void)source;
    (void)cancel;
    TransformRequest *req = data;
    TransformResult *res = g_new0(TransformResult, 1);
    res->generation = req->generation;
    res->pixbuf = image_io_apply_transform_file(req->edit_path, req->op, &res->error);
    g_task_return_pointer(task, res, (GDestroyNotify)transform_result_free);
}

static void transform_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    TransformResult *res = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!res) {
        g_clear_error(&task_err);
        return;
    }

    if (res->generation != app->preview_op_gen) {
        transform_result_free(res);
        return;
    }

    if (!res->pixbuf) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_WARNING,
            GTK_BUTTONS_OK,
            "회전/대칭 저장에 실패했습니다.");
        if (res->error) {
            gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                     "%s", res->error->message);
        }
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        transform_result_free(res);
        return;
    }

    set_image_pixbuf(app, res->pixbuf);
    res->pixbuf = NULL;
    transform_result_free(res);
}

static void on_transform_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    App *app = data;
    if (!app->image_edit_path || !app->image_pixbuf) {
        return;
    }

    ImageTransform op = GPOINTER_TO_INT(
        g_object_get_data(G_OBJECT(btn), "transform-op"));

    app->preview_op_gen++;

    TransformRequest *req = g_new(TransformRequest, 1);
    req->generation = app->preview_op_gen;
    req->edit_path = g_strdup(app->image_edit_path);
    req->op = op;

    gtk_app_update_status_file(app, "이미지 저장 중…");

    GTask *task = g_task_new(NULL, NULL, transform_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)transform_request_free);
    g_task_run_in_thread(task, transform_worker);
    g_object_unref(task);
}

static void on_open_editor_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    App *app = data;
    const char *path = app->image_edit_path ? app->image_edit_path : app->image_path;
    if (!path || !g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
        return;
    }
    char *saved = NULL;
    if (gtk_editor_open(app, path, &saved)) {
        if (saved) {
            preview_show_image(app, saved);
            browser_refresh_views(app);
            g_free(saved);
        }
    }
}

void preview_connect_image_toolbar(App *app, GtkWidget *rot_ccw,
                                   GtkWidget *rot_cw, GtkWidget *flip_h,
                                   GtkWidget *btn_edit) {
    g_object_set_data(G_OBJECT(rot_ccw), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_ROTATE_CCW));
    g_object_set_data(G_OBJECT(rot_cw), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_ROTATE_CW));
    g_object_set_data(G_OBJECT(flip_h), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_FLIP_HORIZONTAL));
    g_signal_connect(rot_ccw, "clicked", G_CALLBACK(on_transform_clicked), app);
    g_signal_connect(rot_cw, "clicked", G_CALLBACK(on_transform_clicked), app);
    g_signal_connect(flip_h, "clicked", G_CALLBACK(on_transform_clicked), app);
    g_signal_connect(btn_edit, "clicked", G_CALLBACK(on_open_editor_clicked), app);
}

#ifdef HAVE_LIBVLC
static char *format_time_ms(libvlc_time_t ms) {
    if (ms < 0) {
        ms = 0;
    }
    int sec = (int)(ms / 1000);
    int m = sec / 60;
    int s = sec % 60;
    char *out = g_malloc(16);
    g_snprintf(out, 16, "%02d:%02d", m, s);
    return out;
}

static void vlc_attach(App *app) {
    GtkWidget *area = app->video_frame;
    GdkWindow *win = gtk_widget_get_window(area);
    if (!win) {
        return;
    }
#if defined(GDK_WINDOWING_X11)
    if (GDK_IS_X11_WINDOW(win)) {
        libvlc_media_player_set_xwindow(
            (libvlc_media_player_t *)app->vlc_player,
            gdk_x11_window_get_xid(win));
    }
#elif defined(GDK_WINDOWING_QUARTZ)
    libvlc_media_player_set_nsobject(
        (libvlc_media_player_t *)app->vlc_player,
        (void *)gdk_quartz_window_get_nsview(win));
#endif
}

static gboolean video_tick(gpointer data) {
    App *app = data;
    if (!app->vlc_player) {
        return G_SOURCE_CONTINUE;
    }
    libvlc_media_player_t *mp = (libvlc_media_player_t *)app->vlc_player;
    libvlc_time_t len = libvlc_media_player_get_length(mp);
    libvlc_time_t pos = libvlc_media_player_get_time(mp);

    if (len > 0 && !app->video_seeking) {
        double p = (double)pos / (double)len;
        gtk_range_set_value(GTK_RANGE(app->seek_scale), p * 1000.0);
        char *a = format_time_ms(pos);
        char *b = format_time_ms(len);
        char *t = g_strdup_printf("%s / %s", a, b);
        g_free(a);
        g_free(b);
        gtk_label_set_text(GTK_LABEL(app->video_time_label), t);
        g_free(t);
        char *pc = g_strdup_printf("%.1f %%", p * 100.0);
        gtk_label_set_text(GTK_LABEL(app->video_percent_label), pc);
        g_free(pc);
    }
    return G_SOURCE_CONTINUE;
}

#endif

void preview_show_video(App *app, const char *path) {
    preview_clear(app);
    preview_set_toolbar_visible(app, FALSE);
#ifndef HAVE_LIBVLC
    (void)path;
    preview_show_placeholder(app,
        "동영상 재생을 위해 libvlc-dev 패키지를 설치한 뒤 다시 빌드하세요.\n"
        "  make install-deps && make");
    return;
#else
    if (!app->vlc_inst) {
        preview_show_placeholder(app, "VLC 엔진을 초기화할 수 없습니다.");
        return;
    }

    if (app->vlc_media) {
        libvlc_media_player_stop((libvlc_media_player_t *)app->vlc_player);
        libvlc_media_release((libvlc_media_t *)app->vlc_media);
        app->vlc_media = NULL;
    }

    app->vlc_media = libvlc_media_new_path((libvlc_instance_t *)app->vlc_inst, path);
    if (!app->vlc_media) {
        preview_show_placeholder(app, "동영상을 열 수 없습니다.");
        return;
    }

    libvlc_media_player_set_media((libvlc_media_player_t *)app->vlc_player,
                                  (libvlc_media_t *)app->vlc_media);
    stack_show(app, app->video_box);
    gtk_widget_show_all(app->video_box);
    vlc_attach(app);
    libvlc_media_player_play((libvlc_media_player_t *)app->vlc_player);

    if (!app->video_timer_id) {
        app->video_timer_id = g_timeout_add(250, video_tick, app);
    }
#endif
}

#ifdef HAVE_LIBVLC
static void on_video_realize(GtkWidget *w, gpointer data) {
    (void)w;
    vlc_attach((App *)data);
}

static void on_seek_changed(GtkRange *range, gpointer data) {
    App *app = data;
    if (!app->vlc_player) {
        return;
    }
    double v = gtk_range_get_value(range) / 1000.0;
    libvlc_time_t len = libvlc_media_player_get_length((libvlc_media_player_t *)app->vlc_player);
    if (len > 0) {
        libvlc_media_player_set_time((libvlc_media_player_t *)app->vlc_player,
                                     (libvlc_time_t)(len * v));
    }
}

static void on_seek_press(GtkWidget *w, gpointer data) {
    (void)w;
    ((App *)data)->video_seeking = TRUE;
}

static void on_seek_release(GtkWidget *w, gpointer data) {
    (void)w;
    App *app = data;
    app->video_seeking = FALSE;
    on_seek_changed(GTK_RANGE(app->seek_scale), app);
}

static void on_video_play(GtkButton *b, gpointer data) {
    (void)b;
    App *app = data;
    if (app->vlc_player) {
        libvlc_media_player_play((libvlc_media_player_t *)app->vlc_player);
        gtk_label_set_text(GTK_LABEL(app->video_overlay_label), "▶");
        gtk_widget_show(app->video_overlay_label);
    }
}

static void on_video_pause(GtkButton *b, gpointer data) {
    (void)b;
    App *app = data;
    if (app->vlc_player) {
        libvlc_media_player_pause((libvlc_media_player_t *)app->vlc_player);
        gtk_label_set_text(GTK_LABEL(app->video_overlay_label), "⏸");
        gtk_widget_show(app->video_overlay_label);
    }
}

static void on_video_stop(GtkButton *b, gpointer data) {
    (void)b;
    App *app = data;
    if (app->vlc_player) {
        libvlc_media_player_stop((libvlc_media_player_t *)app->vlc_player);
        gtk_range_set_value(GTK_RANGE(app->seek_scale), 0);
        gtk_label_set_text(GTK_LABEL(app->video_time_label), "00:00 / 00:00");
        gtk_label_set_text(GTK_LABEL(app->video_percent_label), "0.0 %");
    }
}
#endif

static void preview_connect_image_pan(App *app, GtkWidget *widget) {
    g_signal_connect(widget, "button-press-event", G_CALLBACK(on_image_pan_press), app);
    g_signal_connect(widget, "button-release-event", G_CALLBACK(on_image_pan_release), app);
    g_signal_connect(widget, "motion-notify-event", G_CALLBACK(on_image_pan_motion), app);
}

/* 뷰포트 크기 변경(창 리사이즈 등) 시 fit 모드이면 줌 재계산 */
static void on_viewport_size_allocate(GtkWidget *widget, GdkRectangle *alloc,
                                       gpointer data) {
    (void)widget;
    (void)alloc;
    App *app = data;
    if (!app->zoom_fit_mode || !app->image_pixbuf) {
        return;
    }
    double new_fit = calc_fit_zoom(app);
    if (fabs(new_fit - app->zoom_factor) < 1e-9) {
        return;
    }
    app->zoom_factor = new_fit;
    update_zoom_label(app);
    preview_update_image_scroll_size(app);
}

void preview_init(App *app) {
    g_signal_connect(app->image_da, "draw", G_CALLBACK(on_image_draw), app);
    g_signal_connect(app->image_viewport, "scroll-event", G_CALLBACK(on_image_scroll), app);
    g_signal_connect(app->image_viewport, "size-allocate",
                     G_CALLBACK(on_viewport_size_allocate), app);
    preview_connect_image_pan(app, app->image_da);
    preview_connect_image_pan(app, app->image_viewport);

#ifdef HAVE_LIBVLC
    const char *vlc_args[] = {"--intf", "dummy", "--quiet"};
    app->vlc_inst = libvlc_new(2, vlc_args);
    if (app->vlc_inst) {
        app->vlc_player = libvlc_media_player_new((libvlc_instance_t *)app->vlc_inst);
    }
    g_signal_connect(app->video_frame, "realize", G_CALLBACK(on_video_realize), app);
    g_signal_connect(app->seek_scale, "value-changed", G_CALLBACK(on_seek_changed), app);
    g_signal_connect(app->seek_scale, "button-press-event", G_CALLBACK(on_seek_press), app);
    g_signal_connect(app->seek_scale, "button-release-event", G_CALLBACK(on_seek_release), app);
#endif
}

void preview_connect_video_controls(App *app, GtkWidget *play,
                                    GtkWidget *pause, GtkWidget *stop) {
#ifdef HAVE_LIBVLC
    g_signal_connect(play, "clicked", G_CALLBACK(on_video_play), app);
    g_signal_connect(pause, "clicked", G_CALLBACK(on_video_pause), app);
    g_signal_connect(stop, "clicked", G_CALLBACK(on_video_stop), app);
#else
    (void)app;
    (void)play;
    (void)pause;
    (void)stop;
#endif
}
