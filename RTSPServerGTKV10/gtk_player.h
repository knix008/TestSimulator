#ifndef GTK_PLAYER_H
#define GTK_PLAYER_H

#include "app_context.h"

gboolean gtk_player_init(App *app);
void gtk_player_build_ui(App *app);
void gtk_player_start(App *app);
gboolean gtk_player_open_file(App *app, const char *video_file_path);
void gtk_player_cleanup(App *app);

#endif
