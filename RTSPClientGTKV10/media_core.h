#ifndef MEDIA_CORE_H
#define MEDIA_CORE_H

#include <glib.h>
#include <gst/gst.h>

typedef void (*MediaLogFunc)(void *userdata, const char *fmt, ...);

typedef struct {
    GstElement *playbin;
    GstElement *video_sink;
    MediaLogFunc logger;
    void *logger_userdata;
    /* googlevideo 재생 시 SoupHTTPSrc가 yt-dlp와 동일한 UA를 쓰도록 (403 방지) */
    gchar *ytdlp_user_agent;
    /* playbin uri가 source-setup 시점에 비어 있을 수 있어, 직전에 설정한 재생 URI를 보관 */
    gchar *last_play_uri;
} MediaCore;

gboolean media_core_init(MediaCore *core, MediaLogFunc logger, void *logger_userdata, gchar **error_out);
void media_core_cleanup(MediaCore *core);

gchar *media_core_resolve_uri(const gchar *source, gchar **error_out);
void media_core_play_uri(MediaCore *core, const gchar *uri);
gboolean media_core_load_and_play(MediaCore *core, const gchar *source, gchar **error_out);
gboolean media_core_is_youtube_supported(void);
gboolean media_core_start_download(const gchar *source, gchar **error_out);

void media_core_set_state(MediaCore *core, GstState state);
void media_core_stop(MediaCore *core);
void media_core_toggle_play_pause(MediaCore *core);
void media_core_set_volume(MediaCore *core, gdouble volume_0_to_1);
gdouble media_core_get_volume(MediaCore *core);

gboolean media_core_query_position(MediaCore *core, gint64 *pos_ns, gint64 *dur_ns);
gboolean media_core_seek_percent(MediaCore *core, gdouble percent, gint64 duration_ns);
gchar *media_core_format_ns(gint64 ns);

gboolean media_core_bus_watch(GstBus *bus, GstMessage *msg, gpointer user_data);

#endif
