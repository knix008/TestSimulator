#ifndef RTSP_SERVER_H
#define RTSP_SERVER_H

#include "app_context.h"

gboolean rtsp_server_start(App *app, const char *mount_point, const char *port, const char *video_file_path);
void rtsp_server_stop(App *app);
gboolean rtsp_server_is_running(const App *app);
gboolean rtsp_server_set_source(App *app, const char *video_file_path, const char *mount_point);

#endif
