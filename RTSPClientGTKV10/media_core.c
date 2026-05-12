#include "media_core.h"
#include "youtube_service.h"

#include <string.h>

static gchar *query_ytdlp_dump_user_agent(void) {
    if (!g_find_program_in_path("yt-dlp")) {
        return NULL;
    }
    gchar *argv[] = {"yt-dlp", "--ignore-config", "--dump-user-agent", NULL};
    gchar *out = NULL;
    gchar *err = NULL;
    gint st = 0;
    GError *gerr = NULL;
    if (!g_spawn_sync(NULL, argv, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, &out, &err, &st, &gerr)) {
        if (gerr) {
            g_error_free(gerr);
        }
        g_free(err);
        g_free(out);
        return NULL;
    }
    g_free(err);
    (void)st;
    if (!out) {
        return NULL;
    }
    g_strstrip(out);
    if (out[0] == '\0') {
        g_free(out);
        return NULL;
    }
    return out;
}

static gboolean has_prefix_ci(const gchar *text, const gchar *prefix) {
    if (!text || !prefix) {
        return FALSE;
    }
    gsize n = strlen(prefix);
    if (strlen(text) < n) {
        return FALSE;
    }
    return g_ascii_strncasecmp(text, prefix, n) == 0;
}

static gboolean is_youtube_url(const gchar *src) {
    return youtube_service_is_url(src);
}

static gboolean is_rtsp_url(const gchar *src) {
    return src && has_prefix_ci(src, "rtsp://");
}

/* playbin의 uri는 source-setup 시점에 아직 비어 있거나 내부 URI와 다를 수 있음 */
static gboolean url_is_youtube_cdn_media(const gchar *url) {
    return url && g_strrstr(url, "googlevideo.com") != NULL;
}

static void on_playbin_source_setup(GstElement *playbin, GstElement *source, gpointer user_data) {
    MediaCore *core = user_data;

    if (!source || !G_OBJECT_TYPE_NAME(source)) {
        return;
    }

    if (g_strrstr(G_OBJECT_TYPE_NAME(source), "GstRTSPSrc") != NULL) {
        if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "latency")) {
            g_object_set(source, "latency", 200, NULL);
        }
        if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "udp-reconnect")) {
            g_object_set(source, "udp-reconnect", TRUE, NULL);
        }
        if (core->logger) {
            core->logger(core->logger_userdata, "RTSP source options applied");
        }
        return;
    }

    if (g_strrstr(G_OBJECT_TYPE_NAME(source), "GstSoupHTTPSrc") == NULL) {
        return;
    }

    gchar *loc = NULL;
    if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "location")) {
        g_object_get(source, "location", &loc, NULL);
    }
    gchar *play_uri = NULL;
    g_object_get(playbin, "uri", &play_uri, NULL);
    gboolean is_googlevideo = url_is_youtube_cdn_media(loc) || url_is_youtube_cdn_media(play_uri) ||
                              url_is_youtube_cdn_media(core->last_play_uri);
    g_free(loc);
    g_free(play_uri);

    if (is_googlevideo) {
        /* googlevideo는 서명·n 파라미터가 특정 클라이언트와 묶이므로 yt-dlp UA에 맞춘다.
         * Origin은 CDN이 거부하는 경우가 있어 Referer만 둔다. */
        const gchar *ua = core->ytdlp_user_agent;
        if (!ua) {
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        }
        if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "user-agent")) {
            g_object_set(source, "user-agent", ua, NULL);
        }
        if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "extra-headers")) {
            GstStructure *headers = gst_structure_new(
                "extra-headers",
                "Referer", G_TYPE_STRING, "https://www.youtube.com/",
                "Accept", G_TYPE_STRING, "*/*",
                NULL);
            g_object_set(source, "extra-headers", headers, NULL);
            gst_structure_free(headers);
        }
        if (core->logger) {
            core->logger(core->logger_userdata, "YouTube CDN(googlevideo)용 HTTP 헤더 적용");
        }
        return;
    }

    if (g_object_class_find_property(G_OBJECT_GET_CLASS(source), "user-agent")) {
        g_object_set(source, "user-agent",
                     "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                     NULL);
    }

    if (core->logger) {
        core->logger(core->logger_userdata, "HTTPS source: 기본 User-Agent 적용");
    }
}

gboolean media_core_init(MediaCore *core, MediaLogFunc logger, void *logger_userdata, gchar **error_out) {
    memset(core, 0, sizeof(*core));
    core->logger = logger;
    core->logger_userdata = logger_userdata;

    core->playbin = gst_element_factory_make("playbin", "player");
    if (!core->playbin) {
        if (error_out) {
            *error_out = g_strdup("Failed to create GStreamer playbin.");
        }
        return FALSE;
    }
    g_signal_connect(core->playbin, "source-setup", G_CALLBACK(on_playbin_source_setup), core);

    core->ytdlp_user_agent = query_ytdlp_dump_user_agent();

    core->video_sink = gst_element_factory_make("gtksink", "videosink");
    if (core->video_sink) {
        g_object_set(core->playbin, "video-sink", core->video_sink, NULL);
        if (core->logger) {
            core->logger(core->logger_userdata, "gtksink 사용 (GTK 위젯 임베딩)");
        }
    } else {
        GstElement *autovideosink = gst_element_factory_make("autovideosink", NULL);
        if (autovideosink) {
            g_object_set(core->playbin, "video-sink", autovideosink, NULL);
            gst_object_unref(autovideosink);
        }
        if (core->logger) {
            core->logger(core->logger_userdata, "gtksink 없음: autovideosink로 대체");
        }
    }

    return TRUE;
}

void media_core_cleanup(MediaCore *core) {
    if (!core) {
        return;
    }
    g_free(core->ytdlp_user_agent);
    core->ytdlp_user_agent = NULL;
    g_free(core->last_play_uri);
    core->last_play_uri = NULL;
    if (core->playbin) {
        gst_element_set_state(core->playbin, GST_STATE_NULL);
        gst_object_unref(core->playbin);
        core->playbin = NULL;
    }
}

gchar *media_core_resolve_uri(const gchar *source, gchar **error_out) {
    if (source == NULL) {
        if (error_out) {
            *error_out = g_strdup("입력값이 비어 있습니다.");
        }
        return NULL;
    }
    gchar *trimmed = g_strstrip(g_strdup(source));
    if (*trimmed == '\0') {
        if (error_out) {
            *error_out = g_strdup("입력값이 비어 있습니다.");
        }
        g_free(trimmed);
        return NULL;
    }

    if (g_file_test(trimmed, G_FILE_TEST_EXISTS)) {
        GError *gerr = NULL;
        gchar *uri = g_filename_to_uri(trimmed, NULL, &gerr);
        if (!uri && error_out) {
            *error_out = g_strdup(gerr ? gerr->message : "파일 URI 변환 실패");
        }
        if (gerr) {
            g_error_free(gerr);
        }
        g_free(trimmed);
        return uri;
    }

    if (has_prefix_ci(trimmed, "rtsp://") ||
        has_prefix_ci(trimmed, "http://") ||
        has_prefix_ci(trimmed, "https://") ||
        has_prefix_ci(trimmed, "file://")) {
        if (is_youtube_url(trimmed)) {
            gchar *resolved = youtube_service_resolve_playback_url(trimmed, error_out);
            if (!resolved && error_out && *error_out == NULL) {
                *error_out = g_strdup("YouTube 재생용 임시 파일을 만들지 못했습니다.");
            }
            g_free(trimmed);
            return resolved;
        }
        gchar *raw = g_strdup(trimmed);
        g_free(trimmed);
        return raw;
    }

    if (error_out) {
        *error_out = g_strdup("지원하지 않는 입력입니다. 파일 경로 또는 URL을 사용하세요.");
    }
    g_free(trimmed);
    return NULL;
}

void media_core_play_uri(MediaCore *core, const gchar *uri) {
    g_free(core->last_play_uri);
    core->last_play_uri = uri ? g_strdup(uri) : NULL;
    gst_element_set_state(core->playbin, GST_STATE_NULL);
    g_object_set(core->playbin, "uri", uri, NULL);
    gst_element_set_state(core->playbin, GST_STATE_PLAYING);
}

gboolean media_core_load_and_play(MediaCore *core, const gchar *source, gchar **error_out) {
    gchar *uri = media_core_resolve_uri(source, error_out);

    if (!uri) {
        return FALSE;
    }
    g_free(core->last_play_uri);
    core->last_play_uri = g_strdup(uri);
    gst_element_set_state(core->playbin, GST_STATE_NULL);
    g_object_set(core->playbin, "uri", uri, NULL);
    gst_element_set_state(core->playbin, GST_STATE_PLAYING);
    g_free(uri);
    return TRUE;
}

gboolean media_core_is_youtube_supported(void) {
    return youtube_service_is_supported();
}

gboolean media_core_start_download(const gchar *source, gchar **error_out) {
    GError *gerr = NULL;
    if (is_youtube_url(source)) {
        return youtube_service_start_download(source, error_out);
    }

    if (is_rtsp_url(source)) {
        GDateTime *now = g_date_time_new_now_local();
        gchar *ts = g_date_time_format(now, "%Y%m%d_%H%M%S");
        g_date_time_unref(now);
        gchar *outfile_name = g_strdup_printf("rtsp_record_%s.mp4", ts);
        g_free(ts);

        gchar *argv[] = {
            "gst-launch-1.0",
            "-e",
            "rtspsrc", "location=(null)", "latency=200",
            "!", "rtph264depay",
            "!", "h264parse",
            "!", "mp4mux",
            "!", "filesink", "location=(null)",
            NULL
        };
        argv[3] = g_strdup_printf("location=%s", source);
        argv[13] = g_strdup_printf("location=%s", outfile_name);
        gboolean ok = g_spawn_async(NULL, argv, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, NULL, &gerr);
        g_free(argv[3]);
        g_free(argv[13]);
        if (!ok) {
            if (error_out) {
                *error_out = g_strdup_printf("RTSP 다운로드 시작 실패: %s",
                                             gerr ? gerr->message : "unknown");
            }
            if (gerr) g_error_free(gerr);
            g_free(outfile_name);
            return FALSE;
        }
        g_free(outfile_name);
        return TRUE;
    }

    if (error_out) {
        *error_out = g_strdup("다운로드는 YouTube 또는 RTSP 링크에서만 가능합니다.");
    }
    return FALSE;
}

void media_core_set_state(MediaCore *core, GstState state) {
    gst_element_set_state(core->playbin, state);
}

void media_core_stop(MediaCore *core) {
    gst_element_set_state(core->playbin, GST_STATE_NULL);
}

void media_core_toggle_play_pause(MediaCore *core) {
    GstState state = GST_STATE_NULL;
    gst_element_get_state(core->playbin, &state, NULL, 0);
    gst_element_set_state(core->playbin, state == GST_STATE_PLAYING ? GST_STATE_PAUSED : GST_STATE_PLAYING);
}

void media_core_set_volume(MediaCore *core, gdouble volume_0_to_1) {
    gdouble clamped = volume_0_to_1;
    if (clamped < 0.0) {
        clamped = 0.0;
    } else if (clamped > 1.0) {
        clamped = 1.0;
    }
    g_object_set(core->playbin, "volume", clamped, NULL);
}

gdouble media_core_get_volume(MediaCore *core) {
    gdouble volume = 1.0;
    g_object_get(core->playbin, "volume", &volume, NULL);
    return volume;
}

gboolean media_core_query_position(MediaCore *core, gint64 *pos_ns, gint64 *dur_ns) {
    gboolean ok_pos = gst_element_query_position(core->playbin, GST_FORMAT_TIME, pos_ns);
    gboolean ok_dur = gst_element_query_duration(core->playbin, GST_FORMAT_TIME, dur_ns);
    return ok_pos && ok_dur && *dur_ns > 0;
}

gboolean media_core_seek_percent(MediaCore *core, gdouble percent, gint64 duration_ns) {
    gint64 target = (gint64)((percent / 100.0) * duration_ns);
    return gst_element_seek_simple(core->playbin, GST_FORMAT_TIME,
                                   GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_KEY_UNIT, target);
}

gchar *media_core_format_ns(gint64 ns) {
    if (ns <= 0) {
        return g_strdup("00:00");
    }
    gint64 total_sec = ns / GST_SECOND;
    gint h = (gint)(total_sec / 3600);
    gint m = (gint)((total_sec % 3600) / 60);
    gint s = (gint)(total_sec % 60);
    if (h > 0) {
        return g_strdup_printf("%02d:%02d:%02d", h, m, s);
    }
    return g_strdup_printf("%02d:%02d", m, s);
}

gboolean media_core_bus_watch(GstBus *bus, GstMessage *msg, gpointer user_data) {
    (void)bus;
    MediaCore *core = user_data;

    switch (GST_MESSAGE_TYPE(msg)) {
        case GST_MESSAGE_EOS:
            if (core->logger) {
                core->logger(core->logger_userdata, "재생 완료 (EOS)");
            }
            gst_element_set_state(core->playbin, GST_STATE_PAUSED);
            break;
        case GST_MESSAGE_ERROR: {
            GError *err = NULL;
            gchar *debug = NULL;
            gst_message_parse_error(msg, &err, &debug);
            if (core->logger) {
                core->logger(core->logger_userdata, "오류: %s", err ? err->message : "unknown");
                if (debug && *debug) {
                    core->logger(core->logger_userdata, "디버그: %s", debug);
                }
            }
            if (err) {
                g_error_free(err);
            }
            g_free(debug);
            gst_element_set_state(core->playbin, GST_STATE_NULL);
            break;
        }
        case GST_MESSAGE_STATE_CHANGED:
            if (GST_MESSAGE_SRC(msg) == GST_OBJECT(core->playbin) && core->logger) {
                GstState old_s, new_s, pending_s;
                gst_message_parse_state_changed(msg, &old_s, &new_s, &pending_s);
                (void)pending_s;
                core->logger(core->logger_userdata, "상태 변경 이벤트: %s -> %s",
                             gst_element_state_get_name(old_s),
                             gst_element_state_get_name(new_s));
            }
            break;
        default:
            break;
    }
    return G_SOURCE_CONTINUE;
}
