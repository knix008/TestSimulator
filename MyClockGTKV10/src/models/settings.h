#pragma once
#include "app_state.h"

void     settings_defaults(AppSettings *s);
void     settings_load(AppSettings *s);
void     settings_save(const AppSettings *s);
gboolean settings_autostart_get(void);
void     settings_autostart_set(gboolean enable);
