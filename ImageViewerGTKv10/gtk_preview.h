#ifndef GTK_PREVIEW_H
#define GTK_PREVIEW_H

#include "gtk_app.h"

void preview_init(App *app);
void preview_show_placeholder(App *app, const char *text);
void preview_show_gallery(App *app, const char *folder);
void preview_show_image(App *app, const char *path);
void preview_commit_heif_file(App *app, const char *path);
void preview_show_video(App *app, const char *path);
void preview_clear(App *app);
void preview_cancel_thumbnails(App *app);
void preview_connect_video_controls(App *app, GtkWidget *play,
                                    GtkWidget *pause, GtkWidget *stop);
void preview_connect_image_toolbar(App *app, GtkWidget *rot_ccw,
                                   GtkWidget *rot_cw, GtkWidget *flip_h);
void preview_set_toolbar_visible(App *app, gboolean visible);

#endif
