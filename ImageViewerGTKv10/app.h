#ifndef APP_H
#define APP_H

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
    GtkWidget *zoom_label;
    GtkWidget *video_box;
    GtkWidget *video_frame;
    GtkWidget *video_time_label;
    GtkWidget *video_percent_label;
    GtkWidget *seek_scale;
    GtkWidget *video_overlay_label;

    char *current_folder;
    char *selected_file;

    GFileMonitor *folder_monitor;
    guint folder_refresh_pending;

    GdkPixbuf *image_pixbuf;
    char *image_path;
    char *image_edit_path;
    double zoom_factor;
    int image_nat_w;
    int image_nat_h;
    gboolean image_panning;
    int pan_start_x;
    int pan_start_y;
    double pan_start_h;
    double pan_start_v;

    guint thumb_idle_id;
    GList *thumb_paths;
    guint thumb_index;

    guint video_timer_id;
    gboolean video_seeking;

#ifdef HAVE_LIBVLC
    void *vlc_inst;
    void *vlc_player;
    void *vlc_media;
#endif
};

App *app_create(int argc, char **argv);
void app_run(App *app);
void app_destroy(App *app);

void app_set_folder(App *app, const char *folder);
void app_refresh_file_list(App *app, const char *folder);
void app_update_status_dir(App *app, const char *folder);
void app_update_status_file(App *app, const char *message);

#endif
