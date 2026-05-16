#include "preview.h"
#include "browser.h"
#include "image_io.h"
#include "utils.h"

#include <cairo/cairo.h>
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

#define THUMB_W 142
#define THUMB_H 126
static gint ptr_str_compare(gconstpointer a, gconstpointer b) {
    return g_ascii_strcasecmp((const char *)a, (const char *)b);
}

static void stack_show(App *app, GtkWidget *page) {
    gtk_stack_set_visible_child(GTK_STACK(app->preview_stack), page);
}

static GdkPixbuf *scale_fit(GdkPixbuf *src, int tw, int th) {
    int sw = gdk_pixbuf_get_width(src);
    int sh = gdk_pixbuf_get_height(src);
    double r = fmin((double)tw / sw, (double)th / sh);
    int w = MAX(1, (int)(sw * r));
    int h = MAX(1, (int)(sh * r));
    GdkPixbuf *scaled = gdk_pixbuf_scale_simple(src, w, h, GDK_INTERP_BILINEAR);
    GdkPixbuf *out = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, tw, th);
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
    /* simple triangle via cairo on pixbuf not trivial; solid fill is enough */
    return pb;
}

void preview_clear(App *app) {
    preview_cancel_thumbnails(app);
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
    gtk_widget_queue_draw(app->image_da);
}

void preview_cancel_thumbnails(App *app) {
    if (app->thumb_idle_id) {
        g_source_remove(app->thumb_idle_id);
        app->thumb_idle_id = 0;
    }
    if (app->thumb_paths) {
        g_list_free_full(app->thumb_paths, g_free);
        app->thumb_paths = NULL;
    }
    app->thumb_index = 0;

    GList *children = gtk_container_get_children(GTK_CONTAINER(app->gallery_flow));
    for (GList *l = children; l; l = l->next) {
        gtk_widget_destroy(GTK_WIDGET(l->data));
    }
    g_list_free(children);
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
    int vw = gtk_widget_get_allocated_width(widget);
    int vh = gtk_widget_get_allocated_height(widget);
    cairo_set_source_rgb(cr, 0.08, 0.08, 0.1);
    cairo_paint(cr);

    if (!app->image_pixbuf) {
        return FALSE;
    }

    int iw = MAX(1, (int)(app->image_nat_w * app->zoom_factor));
    int ih = MAX(1, (int)(app->image_nat_h * app->zoom_factor));

    GdkPixbuf *scaled = gdk_pixbuf_scale_simple(
        app->image_pixbuf, iw, ih, GDK_INTERP_BILINEAR);

    int x = (iw < vw) ? (vw - iw) / 2 : 0;
    int y = (ih < vh) ? (vh - ih) / 2 : 0;
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
    update_zoom_label(app);
    gtk_widget_queue_draw(app->image_da);
    return TRUE;
}

static void on_thumb_clicked(GtkButton *btn, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(btn), "file-path");
    if (!path) {
        return;
    }
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(GTK_TREE_MODEL(app->file_store), &iter);
    while (valid) {
        gchar *fp = NULL;
        gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter,
                           FILE_COL_PATH, &fp, -1);
        if (fp && g_ascii_strcasecmp(fp, path) == 0) {
            GtkTreePath *tp = gtk_tree_model_get_path(GTK_TREE_MODEL(app->file_store), &iter);
            gtk_tree_view_set_cursor(GTK_TREE_VIEW(app->file_view), tp, NULL, FALSE);
            gtk_tree_path_free(tp);
            g_free(fp);
            return;
        }
        g_free(fp);
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(app->file_store), &iter);
    }
}

static GtkWidget *make_thumb_card(App *app, const char *path, GdkPixbuf *thumb) {
    GtkWidget *img = gtk_image_new_from_pixbuf(thumb);
    gtk_widget_set_size_request(img, THUMB_W, THUMB_H);
    GtkWidget *lbl = gtk_label_new(g_path_get_basename(path));
    gtk_label_set_xalign(GTK_LABEL(lbl), 0.0);
    gtk_label_set_ellipsize(GTK_LABEL(lbl), PANGO_ELLIPSIZE_END);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);

    GtkWidget *btn = gtk_button_new();
    gtk_button_set_relief(GTK_BUTTON(btn), GTK_RELIEF_NONE);
    GtkWidget *inner = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_box_pack_start(GTK_BOX(inner), img, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(inner), lbl, TRUE, TRUE, 0);
    gtk_container_add(GTK_CONTAINER(btn), inner);
    g_object_set_data_full(G_OBJECT(btn), "file-path", g_strdup(path), g_free);
    g_signal_connect(btn, "clicked", G_CALLBACK(on_thumb_clicked), app);

    gtk_flow_box_insert(GTK_FLOW_BOX(app->gallery_flow), btn, -1);
    return btn;
}

static gboolean thumb_idle_cb(gpointer data) {
    App *app = data;
    if (!app->thumb_paths) {
        app->thumb_idle_id = 0;
        return G_SOURCE_REMOVE;
    }

    guint total = g_list_length(app->thumb_paths);
    if (app->thumb_index >= total) {
        char *msg = g_strdup_printf("썸네일 로딩 완료: %u개", total);
        app_update_status_file(app, msg);
        g_free(msg);
        app->thumb_idle_id = 0;
        return G_SOURCE_REMOVE;
    }

    const char *path = g_list_nth_data(app->thumb_paths, app->thumb_index);
    GdkPixbuf *thumb = NULL;
    GError *err = NULL;
    const char *dot = strrchr(path, '.');
    const char *ext = dot ? dot : "";

    if (utils_is_image_ext(ext)) {
        GdkPixbuf *src = image_io_load_pixbuf(path, &err);
        if (src) {
            thumb = scale_fit(src, THUMB_W, THUMB_H);
            g_object_unref(src);
        }
        g_clear_error(&err);
    }
    if (!thumb) {
        thumb = build_video_placeholder(THUMB_W, THUMB_H);
    }

    make_thumb_card(app, path, thumb);
    g_object_unref(thumb);

    app->thumb_index++;
    char *st = g_strdup_printf("썸네일 로딩 중... %u/%u", app->thumb_index, total);
    app_update_status_file(app, st);
    g_free(st);

    return G_SOURCE_CONTINUE;
}

void preview_show_gallery(App *app, const char *folder) {
    preview_clear(app);
    preview_cancel_thumbnails(app);

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

    preview_set_toolbar_visible(app, FALSE);
    app->thumb_paths = g_list_sort(app->thumb_paths, ptr_str_compare);
    app->thumb_index = 0;
    stack_show(app, app->gallery_scrolled);
    app->thumb_idle_id = g_idle_add(thumb_idle_cb, app);
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
              "libheif 및 gdk-pixbuf HEIF 플러그인을 설치해 주세요.\n"
              "(make install-deps)"
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
    app->zoom_factor = calc_fit_zoom(app);
    update_zoom_label(app);
    gtk_widget_queue_draw(app->image_da);
}

void preview_show_image(App *app, const char *path) {
    preview_clear(app);
    preview_set_toolbar_visible(app, TRUE);

    gboolean is_heif = utils_is_heif_path(path);
    char *edit_path = NULL;

    if (is_heif) {
        edit_path = image_io_heif_jpg_path(path);
        if (!edit_path) {
            GError *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                      "HEIF 디코딩 실패");
            show_image_error_dialog(app, path, err);
            g_error_free(err);
            preview_show_placeholder(app, "HIF/HEIF 변환 실패");
            return;
        }
    } else {
        edit_path = g_strdup(path);
    }

    GError *err = NULL;
    GdkPixbuf *pb = gdk_pixbuf_new_from_file(edit_path, &err);
    if (!pb) {
        show_image_error_dialog(app, path, err);
        g_clear_error(&err);
        g_free(edit_path);
        preview_show_placeholder(app, "이미지를 열 수 없습니다.");
        return;
    }

    app->image_path = g_strdup(path);
    app->image_edit_path = edit_path;
    set_image_pixbuf(app, pb);

    stack_show(app, app->image_page);

    if (is_heif && g_file_test(path, G_FILE_TEST_EXISTS)) {
        if (image_io_move_heif_to_subdir(path) && app->current_folder) {
            browser_refresh_views(app);
        }
    }
}

static void on_transform_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    App *app = data;
    if (!app->image_edit_path || !app->image_pixbuf) {
        return;
    }

    ImageTransform op = GPOINTER_TO_INT(
        g_object_get_data(G_OBJECT(btn), "transform-op"));

    GError *err = NULL;
    GdkPixbuf *pb = image_io_apply_transform_file(app->image_edit_path, op, &err);
    if (!pb) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_WARNING,
            GTK_BUTTONS_OK,
            "회전/대칭 저장에 실패했습니다.");
        if (err) {
            gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                     "%s", err->message);
        }
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        g_clear_error(&err);
        return;
    }
    g_clear_error(&err);
    set_image_pixbuf(app, pb);
}

void preview_connect_image_toolbar(App *app, GtkWidget *rot_ccw,
                                   GtkWidget *rot_cw, GtkWidget *flip_h) {
    g_object_set_data(G_OBJECT(rot_ccw), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_ROTATE_CCW));
    g_object_set_data(G_OBJECT(rot_cw), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_ROTATE_CW));
    g_object_set_data(G_OBJECT(flip_h), "transform-op",
                      GINT_TO_POINTER(IMAGE_TRANSFORM_FLIP_HORIZONTAL));
    g_signal_connect(rot_ccw, "clicked", G_CALLBACK(on_transform_clicked), app);
    g_signal_connect(rot_cw, "clicked", G_CALLBACK(on_transform_clicked), app);
    g_signal_connect(flip_h, "clicked", G_CALLBACK(on_transform_clicked), app);
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

void preview_init(App *app) {
    g_signal_connect(app->image_da, "draw", G_CALLBACK(on_image_draw), app);
    g_signal_connect(app->image_viewport, "scroll-event", G_CALLBACK(on_image_scroll), app);

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
