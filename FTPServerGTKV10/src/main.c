#include <gtk/gtk.h>
#include <locale.h>
#include "log_manager.h"
#include "main_window.h"
#include "settings.h"
#include "platform.h"

int main(int argc, char *argv[]) {
    setlocale(LC_ALL, "");

    g_setenv("GSETTINGS_BACKEND", "memory", TRUE);
    gtk_init(&argc, &argv);

    char *cfg_dir  = settings_get_config_dir();
    make_dirs(cfg_dir, 0700);
    char *log_path = path_join(cfg_dir, "ftpserver.log");
    free(cfg_dir);
    log_manager_init(log_path);
    free(log_path);

    AppState  *app = app_state_new();
    GtkWidget *win = build_main_window(app);
    (void)win;

    gtk_main();

    app_state_free(app);
    log_manager_shutdown();
    return 0;
}
