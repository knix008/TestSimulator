#ifndef APP_UI_H
#define APP_UI_H

#include "media_core.h"

typedef struct AppUi AppUi;

AppUi *app_ui_create(MediaCore *media);
void app_ui_run(AppUi *ui);
void app_ui_destroy(AppUi *ui);

#endif
