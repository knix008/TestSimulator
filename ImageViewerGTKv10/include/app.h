#ifndef APP_H
#define APP_H

#include <glib.h>

typedef struct App App;

App *app_create(int argc, char **argv);
void app_run(App *app);
void app_destroy(App *app);

void app_set_folder(App *app, const char *folder);
void app_refresh_file_list(App *app, const char *folder, gboolean show_gallery_after,
                           const char *select_path_after);
void app_update_status_dir(App *app, const char *folder);
void app_update_status_file(App *app, const char *message);

#endif
