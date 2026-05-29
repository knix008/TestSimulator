#pragma once

#include <gtk/gtk.h>
#include "settings.h"
#include "ftp_server.h"
#include "sftp_server.h"

typedef struct _AppState AppState;

AppState *app_state_new(void);
void      app_state_free(AppState *app);

GtkWidget *build_main_window(AppState *app);
