#ifndef GTK_APP_H
#define GTK_APP_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gio/gio.h>
#include <glib.h>
#include <gtk/gtk.h>

typedef struct App App;

struct App {
    GtkWidget *window;
    GtkWidget *folder_entry;
    GtkWidget *tree_view;
    GtkTreeStore *tree_store;
    GtkWidget *file_view;
    GtkListStore *file_store;
    GtkWidget *status_dir;
    GtkWidget *status_file;

    GtkWidget *preview_stack;
    GtkWidget *placeholder_label;
    GtkWidget *gallery_scrolled;
    GtkWidget *gallery_flow;
    GtkWidget *image_scrolled;
    GtkWidget *image_viewport;
    GtkWidget *image_da;
    GtkWidget *image_page;
    GtkWidget *image_toolbar;
    GtkWidget *btn_image_edit;
    GtkWidget *zoom_label;
    GtkWidget *video_box;
    GtkWidget *video_frame;
    GtkWidget *video_time_label;
    GtkWidget *video_percent_label;
    GtkWidget *seek_scale;
    GtkWidget *video_overlay_label;

    char *current_folder;
    char *selected_file;
    gboolean file_select_via_mouse;
    gboolean file_selection_skip_preview;
    gboolean tree_selection_skip_navigate;
    gboolean context_menu_in_progress;
    GtkWidget *gallery_selected_btn;

    /* 파일 작업 클립보드 (복사·잘라내기/붙여넣기) */
    char *fs_clipboard_path;
    gboolean fs_clipboard_is_dir;
    gboolean fs_clipboard_cut;

    GFileMonitor *folder_monitor;
    guint folder_refresh_pending;
    guint folder_scan_gen;
    guint preview_op_gen;
    guint heif_commit_gen;

    GdkPixbuf *image_pixbuf;
    char *image_path;
    char *image_edit_path;
    double zoom_factor;
    gboolean zoom_fit_mode;   /* TRUE: 뷰포트 크기 변경 시 자동 재맞춤 */
    int image_nat_w;
    int image_nat_h;
    gboolean image_panning;
    int pan_start_x;
    int pan_start_y;
    double pan_start_h;
    double pan_start_v;

    guint thumb_idle_id;
    guint thumb_generation;
    GList *thumb_paths;
    guint thumb_index;

    guint video_timer_id;
    gboolean video_seeking;

    /* HIF 커밋 직후 폴더 감시 이벤트 1회 억제 (이미 동기 스캔 완료) */
    gboolean heif_commit_refresh_pending;

#ifdef HAVE_LIBVLC
    void *vlc_inst;
    void *vlc_player;
    void *vlc_media;
#endif
};

App *gtk_app_create(int argc, char **argv);
void gtk_app_run(App *app);
void gtk_app_destroy(App *app);

void gtk_app_set_folder(App *app, const char *folder);
void gtk_app_update_status_dir(App *app, const char *folder);
void gtk_app_update_status_file(App *app, const char *message);
void gtk_app_show_warning(App *app, const char *message);

#endif
