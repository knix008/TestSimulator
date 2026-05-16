#include "gtk_app.h"
#include "gtk_browser.h"
#include "gtk_preview.h"
#include "state.h"
#include "utils.h"

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <string.h>

#if defined(__APPLE__)
#include <limits.h>
#include <mach-o/dyld.h>
#endif

#ifndef APP_ICON_FILE
#define APP_ICON_FILE "daemon_hammer.ico"
#endif

static char *app_resolve_icon_path(void) {
    const char *name = APP_ICON_FILE;

#if defined(__linux__)
    char *exe = g_file_read_link("/proc/self/exe", NULL);
    if (exe) {
        char *dir = g_path_get_dirname(exe);
        char *beside = g_build_filename(dir, name, NULL);
        g_free(dir);
        g_free(exe);
        if (g_file_test(beside, G_FILE_TEST_IS_REGULAR)) {
            return beside;
        }
        g_free(beside);
    }
#elif defined(__APPLE__)
    char exe_buf[PATH_MAX];
    uint32_t size = sizeof(exe_buf);
    if (_NSGetExecutablePath(exe_buf, &size) == 0) {
        char *dir = g_path_get_dirname(exe_buf);
        char *beside = g_build_filename(dir, name, NULL);
        g_free(dir);
        if (g_file_test(beside, G_FILE_TEST_IS_REGULAR)) {
            return beside;
        }
        g_free(beside);
    }
#endif

    if (g_path_is_absolute(name) && g_file_test(name, G_FILE_TEST_IS_REGULAR)) {
        return g_strdup(name);
    }

    if (g_file_test(name, G_FILE_TEST_IS_REGULAR)) {
        return g_canonicalize_filename(name, NULL);
    }

    char *cwd = g_build_filename(g_get_current_dir(), name, NULL);
    if (g_file_test(cwd, G_FILE_TEST_IS_REGULAR)) {
        return cwd;
    }
    g_free(cwd);

    return NULL;
}

static void app_apply_window_icon(GtkWidget *window) {
    char *icon_path = app_resolve_icon_path();
    if (!icon_path) {
        g_warning("앱 아이콘을 찾을 수 없습니다: %s", APP_ICON_FILE);
        return;
    }

    GError *err = NULL;
    GdkPixbuf *icon = gdk_pixbuf_new_from_file(icon_path, &err);
    if (!icon) {
        g_warning("앱 아이콘 로드 실패 (%s): %s", icon_path,
                  err ? err->message : "unknown");
        g_clear_error(&err);
        g_free(icon_path);
        return;
    }

    gtk_window_set_default_icon(icon);
    if (window && GTK_IS_WINDOW(window)) {
        gtk_window_set_icon(GTK_WINDOW(window), icon);
    }

    g_object_unref(icon);
    g_free(icon_path);
}

void gtk_app_show_warning(App *app, const char *message) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING,
        GTK_BUTTONS_OK,
        "%s",
        message);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

void gtk_app_set_folder(App *app, const char *folder) {
    if (!folder || !g_file_test(folder, G_FILE_TEST_IS_DIR)) {
        gtk_app_show_warning(app, "폴더를 찾을 수 없습니다.");
        return;
    }

    g_free(app->current_folder);
    app->current_folder = g_strdup(folder);
    gtk_entry_set_text(GTK_ENTRY(app->folder_entry), folder);
    state_save_last_folder(folder);
    browser_load_root(app, folder);
    browser_show_folder_contents(app, folder, TRUE);
}

static GtkWidget *build_toolbar_folder(App *app, GtkWidget **pick_btn_out) {
    GtkWidget *bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(bar), 6);

    app->folder_entry = gtk_entry_new();
    gtk_editable_set_editable(GTK_EDITABLE(app->folder_entry), FALSE);
    gtk_widget_set_hexpand(app->folder_entry, TRUE);

    GtkWidget *pick = gtk_button_new_with_label("폴더 선택…");
    *pick_btn_out = pick;

    gtk_box_pack_start(GTK_BOX(bar), app->folder_entry, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(bar), pick, FALSE, FALSE, 0);
    return bar;
}

static GtkWidget *build_left_pane(App *app) {
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);

    GtkWidget *pick_btn = NULL;
    GtkWidget *folder_bar = build_toolbar_folder(app, &pick_btn);
    gtk_box_pack_start(GTK_BOX(vbox), folder_bar, FALSE, FALSE, 0);

    GtkWidget *vpaned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_widget_set_hexpand(vpaned, TRUE);
    gtk_widget_set_vexpand(vpaned, TRUE);

    app->tree_store = gtk_tree_store_new(TREE_N_COLS,
                                         GDK_TYPE_PIXBUF, G_TYPE_STRING, G_TYPE_STRING);
    app->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(app->tree_store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(app->tree_view), TRUE);

    GtkWidget *tree_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(tree_scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(tree_scroll), app->tree_view);
    gtk_paned_pack1(GTK_PANED(vpaned), tree_scroll, FALSE, FALSE);

    app->file_store = gtk_list_store_new(FILE_N_COLS,
                                         GDK_TYPE_PIXBUF, G_TYPE_STRING, G_TYPE_STRING,
                                         G_TYPE_STRING, G_TYPE_STRING);
    app->file_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(app->file_store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(app->file_view), TRUE);

    GtkWidget *file_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 2);
    GtkWidget *file_label = gtk_label_new("파일");
    gtk_label_set_xalign(GTK_LABEL(file_label), 0.0);
    gtk_widget_set_margin_start(file_label, 4);
    gtk_box_pack_start(GTK_BOX(file_box), file_label, FALSE, FALSE, 0);
    GtkWidget *file_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(file_scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(file_scroll), app->file_view);
    gtk_box_pack_start(GTK_BOX(file_box), file_scroll, TRUE, TRUE, 0);
    gtk_paned_pack2(GTK_PANED(vpaned), file_box, TRUE, FALSE);
    gtk_paned_set_position(GTK_PANED(vpaned), 260);

    gtk_box_pack_start(GTK_BOX(vbox), vpaned, TRUE, TRUE, 0);
    browser_init(app);
    browser_connect_pick_button(app, pick_btn);
    return vbox;
}

static GtkWidget *build_preview_pane(App *app) {
    app->preview_stack = gtk_stack_new();

    app->placeholder_label = gtk_label_new(
        "폴더와 파일을 선택하면 여기에 표시됩니다.");
    gtk_label_set_justify(GTK_LABEL(app->placeholder_label), GTK_JUSTIFY_CENTER);
    gtk_widget_set_valign(app->placeholder_label, GTK_ALIGN_CENTER);
    gtk_stack_add_named(GTK_STACK(app->preview_stack),
                        app->placeholder_label, "placeholder");

    app->gallery_flow = gtk_flow_box_new();
    gtk_flow_box_set_selection_mode(GTK_FLOW_BOX(app->gallery_flow), GTK_SELECTION_NONE);
    gtk_flow_box_set_homogeneous(GTK_FLOW_BOX(app->gallery_flow), FALSE);
    gtk_flow_box_set_max_children_per_line(GTK_FLOW_BOX(app->gallery_flow), G_MAXUINT);
    gtk_flow_box_set_row_spacing(GTK_FLOW_BOX(app->gallery_flow), 10);
    gtk_flow_box_set_column_spacing(GTK_FLOW_BOX(app->gallery_flow), 10);
    gtk_widget_set_valign(app->gallery_flow, GTK_ALIGN_START);
    gtk_widget_set_margin_start(app->gallery_flow, 8);
    gtk_widget_set_margin_end(app->gallery_flow, 8);
    gtk_widget_set_margin_top(app->gallery_flow, 8);
    gtk_widget_set_margin_bottom(app->gallery_flow, 8);
    app->gallery_scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(app->gallery_scrolled),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(app->gallery_scrolled), app->gallery_flow);
    gtk_stack_add_named(GTK_STACK(app->preview_stack),
                        app->gallery_scrolled, "gallery");

    app->image_da = gtk_drawing_area_new();
    gtk_widget_set_hexpand(app->image_da, FALSE);
    gtk_widget_set_vexpand(app->image_da, FALSE);
    gtk_widget_add_events(app->image_da,
                          GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK |
                              GDK_POINTER_MOTION_MASK);
    app->image_viewport = gtk_viewport_new(NULL, NULL);
    gtk_widget_add_events(app->image_viewport,
                          GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK |
                              GDK_POINTER_MOTION_MASK);
    gtk_container_add(GTK_CONTAINER(app->image_viewport), app->image_da);
    app->image_scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(app->image_scrolled),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(app->image_scrolled), app->image_viewport);

    GtkWidget *image_overlay = gtk_overlay_new();
    gtk_container_add(GTK_CONTAINER(image_overlay), app->image_scrolled);
    app->zoom_label = gtk_label_new("—");
    gtk_widget_set_halign(app->zoom_label, GTK_ALIGN_START);
    gtk_widget_set_valign(app->zoom_label, GTK_ALIGN_START);
    gtk_widget_set_margin_start(app->zoom_label, 8);
    gtk_widget_set_margin_top(app->zoom_label, 8);
    gtk_overlay_add_overlay(GTK_OVERLAY(image_overlay), app->zoom_label);

    app->image_toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_widget_set_size_request(app->image_toolbar, -1, 44);
    GtkWidget *tb_spacer = gtk_label_new(NULL);
    gtk_widget_set_hexpand(tb_spacer, TRUE);
    gtk_box_pack_start(GTK_BOX(app->image_toolbar), tb_spacer, TRUE, TRUE, 0);

    GtkWidget *btn_rot_cw = gtk_button_new_with_label("↻");
    GtkWidget *btn_rot_ccw = gtk_button_new_with_label("↺");
    GtkWidget *btn_flip = gtk_button_new_with_label("⇔");
    gtk_widget_set_tooltip_text(btn_rot_ccw, "반시계 회전");
    gtk_widget_set_tooltip_text(btn_rot_cw, "시계 방향 회전");
    gtk_widget_set_tooltip_text(btn_flip, "좌우 대칭");
    gtk_box_pack_end(GTK_BOX(app->image_toolbar), btn_flip, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(app->image_toolbar), btn_rot_ccw, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(app->image_toolbar), btn_rot_cw, FALSE, FALSE, 0);

    app->image_page = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_box_pack_start(GTK_BOX(app->image_page), app->image_toolbar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(app->image_page), image_overlay, TRUE, TRUE, 0);
    gtk_stack_add_named(GTK_STACK(app->preview_stack), app->image_page, "image");

    app->video_frame = gtk_frame_new(NULL);
    gtk_frame_set_shadow_type(GTK_FRAME(app->video_frame), GTK_SHADOW_NONE);
    gtk_widget_set_hexpand(app->video_frame, TRUE);
    gtk_widget_set_vexpand(app->video_frame, TRUE);

    app->video_time_label = gtk_label_new("00:00 / 00:00");
    app->video_percent_label = gtk_label_new("0.0 %");
    app->seek_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0, 1000, 1);
    gtk_scale_set_draw_value(GTK_SCALE(app->seek_scale), FALSE);

    GtkWidget *btn_play = gtk_button_new_with_label("재생");
    GtkWidget *btn_pause = gtk_button_new_with_label("일시정지");
    GtkWidget *btn_stop = gtk_button_new_with_label("정지");
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(btn_row), btn_play, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(btn_row), btn_pause, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(btn_row), btn_stop, FALSE, FALSE, 0);

    GtkWidget *timeline = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_box_pack_start(GTK_BOX(timeline), app->seek_scale, TRUE, TRUE, 0);
    GtkWidget *time_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(time_row), app->video_time_label, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(time_row), app->video_percent_label, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(timeline), time_row, FALSE, FALSE, 0);

    app->video_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_box_pack_start(GTK_BOX(app->video_box), app->video_frame, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(app->video_box), timeline, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(app->video_box), btn_row, FALSE, FALSE, 0);

    app->video_overlay_label = gtk_label_new("");
    gtk_widget_set_halign(app->video_overlay_label, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(app->video_overlay_label, GTK_ALIGN_CENTER);
    GtkWidget *video_overlay = gtk_overlay_new();
    gtk_container_add(GTK_CONTAINER(video_overlay), app->video_box);
    gtk_overlay_add_overlay(GTK_OVERLAY(video_overlay), app->video_overlay_label);
    gtk_stack_add_named(GTK_STACK(app->preview_stack), video_overlay, "video");

    preview_init(app);
    preview_connect_image_toolbar(app, btn_rot_ccw, btn_rot_cw, btn_flip);
    preview_connect_video_controls(app, btn_play, btn_pause, btn_stop);

    gtk_stack_set_visible_child(GTK_STACK(app->preview_stack), app->placeholder_label);
    return app->preview_stack;
}

static GtkWidget *build_status(App *app) {
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 2);
    app->status_dir = gtk_label_new("디렉토리 정보");
    app->status_file = gtk_label_new("파일을 선택하면 정보가 표시됩니다.");
    gtk_label_set_xalign(GTK_LABEL(app->status_dir), 0.0);
    gtk_label_set_xalign(GTK_LABEL(app->status_file), 0.0);
    gtk_label_set_ellipsize(GTK_LABEL(app->status_dir), PANGO_ELLIPSIZE_END);
    gtk_label_set_ellipsize(GTK_LABEL(app->status_file), PANGO_ELLIPSIZE_END);
    gtk_widget_set_margin_start(app->status_dir, 6);
    gtk_widget_set_margin_end(app->status_dir, 6);
    gtk_widget_set_margin_start(app->status_file, 6);
    gtk_widget_set_margin_end(app->status_file, 6);
    gtk_box_pack_start(GTK_BOX(box), app->status_dir, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(box), app->status_file, FALSE, FALSE, 0);
    return box;
}

App *gtk_app_create(int argc, char **argv) {
    gtk_init(&argc, &argv);

    App *app = g_new0(App, 1);
    app->zoom_factor = 1.0;

    app->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(app->window), "ImageViewer GTK");
    gtk_window_set_default_size(GTK_WINDOW(app->window), 1200, 720);
    g_signal_connect(app->window, "destroy", G_CALLBACK(gtk_main_quit), NULL);
    app_apply_window_icon(app->window);

    GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(app->window), root);

    GtkWidget *main_paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(root), main_paned, TRUE, TRUE, 0);

    GtkWidget *left = build_left_pane(app);
    gtk_paned_pack1(GTK_PANED(main_paned), left, FALSE, FALSE);

    GtkWidget *right = build_preview_pane(app);
    gtk_paned_pack2(GTK_PANED(main_paned), right, TRUE, FALSE);
    gtk_paned_set_position(GTK_PANED(main_paned), 380);

    browser_connect_shortcuts(app);

    GtkWidget *status = build_status(app);
    gtk_box_pack_start(GTK_BOX(root), status, FALSE, FALSE, 0);

    char *folder = state_load_last_folder();
    if (!folder) {
        folder = utils_get_default_pictures_dir();
    }
    gtk_app_set_folder(app, folder);
    g_free(folder);

    return app;
}

void gtk_app_run(App *app) {
    gtk_widget_show_all(app->window);
    gtk_main();
}

void gtk_app_destroy(App *app) {
    if (!app) {
        return;
    }
    browser_stop_folder_watch(app);
    preview_clear(app);
    preview_cancel_thumbnails(app);
    if (app->video_timer_id) {
        g_source_remove(app->video_timer_id);
    }
    g_free(app->current_folder);
    g_free(app->selected_file);
    g_free(app->fs_clipboard_path);
    g_free(app->image_edit_path);
    g_free(app);
}

void gtk_app_update_status_dir(App *app, const char *folder) {
    (void)app;
    (void)folder;
}

void gtk_app_update_status_file(App *app, const char *message) {
    gtk_label_set_text(GTK_LABEL(app->status_file), message);
}

/* app.h 공개 API — GTK 구현으로 위임 */
App *app_create(int argc, char **argv) {
    return gtk_app_create(argc, argv);
}

void app_run(App *app) {
    gtk_app_run(app);
}

void app_destroy(App *app) {
    gtk_app_destroy(app);
}

void app_set_folder(App *app, const char *folder) {
    gtk_app_set_folder(app, folder);
}

void app_update_status_dir(App *app, const char *folder) {
    gtk_app_update_status_dir(app, folder);
}

void app_update_status_file(App *app, const char *message) {
    gtk_app_update_status_file(app, message);
}
