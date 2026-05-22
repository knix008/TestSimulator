#ifndef SESSION_SETTINGS_H
#define SESSION_SETTINGS_H

#include <glib.h>

typedef struct SessionSettings SessionSettings;

SessionSettings *session_settings_new(void);
void session_settings_free(SessionSettings *settings);
void session_settings_load(SessionSettings *settings);
void session_settings_save(SessionSettings *settings,
                           const char *left_path,
                           const char *right_path,
                           gint splitter_distance);

const char *session_settings_get_left_path(SessionSettings *settings);
const char *session_settings_get_right_path(SessionSettings *settings);
gint session_settings_get_splitter_distance(SessionSettings *settings);

#endif
