#ifndef GTK_BROWSER_H
#define GTK_BROWSER_H

#include "gtk_app.h"

#define BROWSER_DUMMY "..."

enum {
    TREE_COL_ICON = 0,
    TREE_COL_NAME,
    TREE_COL_PATH,
    TREE_N_COLS
};

enum {
    FILE_COL_ICON = 0,
    FILE_COL_NAME,
    FILE_COL_SIZE,
    FILE_COL_MODIFIED,
    FILE_COL_PATH,
    FILE_N_COLS
};

void browser_init(App *app);
void browser_connect_shortcuts(App *app);
void browser_load_root(App *app, const char *folder);
void browser_select_folder_in_tree(App *app, const char *folder);
void browser_connect_pick_button(App *app, GtkWidget *btn);
void browser_refresh_folder_view(App *app);
void browser_revalidate_file_selection(App *app);
void browser_show_folder_contents(App *app, const char *folder, gboolean show_gallery);
/* 파일 목록·갤러리에서 파일 선택 시 미리보기 표시 */
void browser_show_file_for_path(App *app, const char *path, gboolean via_mouse);
void browser_refresh_after_heif_commit(App *app, const char *jpg_path,
                                       const char *heif_source_path);
void browser_refresh_views(App *app);
void browser_start_folder_watch(App *app);
void browser_stop_folder_watch(App *app);

/* app.h 에서도 선언 — 구현은 gtk_browser.c */
void app_refresh_file_list(App *app, const char *folder, gboolean show_gallery_after,
                           const char *select_path_after);

#endif
