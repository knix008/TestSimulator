#ifndef YOUTUBE_SERVICE_H
#define YOUTUBE_SERVICE_H

#include <glib.h>

gboolean youtube_service_is_url(const gchar *src);
gboolean youtube_service_is_supported(void);
gchar *youtube_service_resolve_playback_url(const gchar *source, gchar **error_out);
gboolean youtube_service_start_download(const gchar *source, gchar **error_out);

#endif
