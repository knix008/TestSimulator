#ifndef BROWSER_H
#define BROWSER_H

#include "app.h"

#define BROWSER_DUMMY "..."

enum {
    TREE_COL_NAME = 0,
    TREE_COL_PATH,
    TREE_N_COLS
};

enum {
    FILE_COL_NAME = 0,
    FILE_COL_SIZE,
    FILE_COL_MODIFIED,
    FILE_COL_PATH,
    FILE_N_COLS
};

void browser_init(App *app);
void browser_load_root(App *app, const char *folder);
void browser_select_folder_in_tree(App *app, const char *folder);
void browser_connect_pick_button(App *app, GtkWidget *btn);
void browser_refresh_folder_view(App *app);
void browser_refresh_views(App *app);
void browser_start_folder_watch(App *app);
void browser_stop_folder_watch(App *app);

#endif
