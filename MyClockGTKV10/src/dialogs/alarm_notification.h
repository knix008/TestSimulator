#pragma once
#include <gtk/gtk.h>

void alarm_notification_show(GtkWindow *parent,
                             const char *time_str,
                             const char *label,
                             const char *header_str);
