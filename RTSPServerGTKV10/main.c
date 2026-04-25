#include "app_context.h"
#include "gtk_player.h"
#include "rtsp_server.h"

#define RTSP_MOUNT_POINT "/stream"

static gboolean on_media_opened_update_rtsp(const char *video_file_path, gpointer user_data) {
    App *app = (App *)user_data;
    if (!rtsp_server_is_running(app)) {
        return TRUE;
    }
    const char *mount = RTSP_MOUNT_POINT;
    if (app->rtsp_mount_entry) {
        const char *ui_mount = gtk_entry_get_text(GTK_ENTRY(app->rtsp_mount_entry));
        if (ui_mount && *ui_mount) {
            mount = ui_mount;
        }
    }
    return rtsp_server_set_source(app, video_file_path, mount);
}

int main(int argc, char *argv[]) {
    gst_init(&argc, &argv);
    gtk_init(&argc, &argv);

    App app = {0};
    if (!gtk_player_init(&app)) {
        g_printerr("Failed to initialize GTK player\n");
        return 1;
    }
    app.on_media_opened = on_media_opened_update_rtsp;
    app.on_media_opened_user_data = &app;

    gtk_player_build_ui(&app);

    if (argc >= 2) {
        if (gtk_player_open_file(&app, argv[1])) {
            gtk_player_start(&app);
        } else {
            g_printerr("Warning: failed to open startup file: %s\n", argv[1]);
        }
    }

    gtk_main();

    rtsp_server_stop(&app);
    gtk_player_cleanup(&app);
    return 0;
}
