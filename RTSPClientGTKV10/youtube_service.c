#include "youtube_service.h"

#include <string.h>

static gchar *first_non_empty_line(const gchar *text) {
    if (!text) {
        return NULL;
    }
    gchar **lines = g_strsplit(text, "\n", 0);
    gchar *picked = NULL;
    for (gint i = 0; lines[i] != NULL; i++) {
        if (lines[i][0] != '\0') {
            picked = g_strdup(lines[i]);
            break;
        }
    }
    g_strfreev(lines);
    return picked;
}

static gchar *run_first_success(gchar ***commands, gint count, gchar **error_out) {
    gchar *last_err = NULL;

    for (gint i = 0; i < count; i++) {
        gchar *stdout_text = NULL;
        gchar *stderr_text = NULL;
        gint exit_status = 0;
        GError *gerr = NULL;

        if (!g_spawn_sync(NULL, commands[i], NULL, G_SPAWN_SEARCH_PATH, NULL, NULL,
                          &stdout_text, &stderr_text, &exit_status, &gerr)) {
            g_free(last_err);
            last_err = g_strdup(gerr ? gerr->message : "spawn failed");
            if (gerr) g_error_free(gerr);
            g_free(stdout_text);
            g_free(stderr_text);
            continue;
        }

        if (exit_status == 0) {
            gchar *resolved = first_non_empty_line(stdout_text);
            g_free(stdout_text);
            g_free(stderr_text);
            if (resolved) {
                // direct googlevideo videoplayback links are frequently 403-blocked
                if (g_strrstr(resolved, "googlevideo.com/videoplayback") != NULL) {
                    g_free(last_err);
                    last_err = g_strdup("received blocked direct videoplayback URL");
                    g_free(resolved);
                    continue;
                }
                g_free(last_err);
                return resolved;
            }
            g_free(last_err);
            last_err = g_strdup("yt-dlp returned empty URL");
            continue;
        }

        g_free(last_err);
        last_err = g_strdup(stderr_text ? stderr_text : "yt-dlp exited with error");
        g_free(stdout_text);
        g_free(stderr_text);
    }

    if (error_out) {
        *error_out = g_strdup_printf("YouTube 처리 실패(yt-dlp): %s",
                                     last_err ? last_err : "unknown");
    }
    g_free(last_err);
    return NULL;
}

static gchar *download_temp_and_return_file_uri(const gchar *source, gchar **error_out) {
    gchar *template_path = g_build_filename(g_get_tmp_dir(), "rtspclient_play_%(id)s.%(ext)s", NULL);
    gchar *stdout_text = NULL;
    gchar *stderr_text = NULL;
    gint exit_status = 0;
    GError *gerr = NULL;

    gchar *cmd[] = {
        "yt-dlp",
        "--no-playlist",
        "--force-ipv4",
        "--format", "best[ext=mp4]/best",
        "--print", "after_move:filepath",
        "-o", template_path,
        (gchar *)source,
        NULL
    };

    gboolean ok = g_spawn_sync(NULL, cmd, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL,
                               &stdout_text, &stderr_text, &exit_status, &gerr);
    g_free(template_path);
    if (!ok || exit_status != 0) {
        if (error_out) {
            *error_out = g_strdup_printf(
                "YouTube 처리 실패(스트리밍/임시다운로드): %s",
                gerr ? gerr->message : (stderr_text ? stderr_text : "unknown"));
        }
        if (gerr) g_error_free(gerr);
        g_free(stdout_text);
        g_free(stderr_text);
        return NULL;
    }

    gchar *path = first_non_empty_line(stdout_text);
    g_free(stdout_text);
    g_free(stderr_text);
    if (!path) {
        if (error_out) {
            *error_out = g_strdup("YouTube 임시다운로드 파일 경로를 찾지 못했습니다.");
        }
        return NULL;
    }

    GError *uri_err = NULL;
    gchar *uri = g_filename_to_uri(path, NULL, &uri_err);
    g_free(path);
    if (!uri) {
        if (error_out) {
            *error_out = g_strdup_printf("임시 파일 URI 변환 실패: %s",
                                         uri_err ? uri_err->message : "unknown");
        }
        if (uri_err) g_error_free(uri_err);
        return NULL;
    }
    return uri;
}

gboolean youtube_service_is_url(const gchar *src) {
    return src && (g_strrstr(src, "youtube.com") != NULL || g_strrstr(src, "youtu.be") != NULL);
}

gboolean youtube_service_is_supported(void) {
    return g_find_program_in_path("yt-dlp") != NULL;
}

gchar *youtube_service_resolve_playback_url(const gchar *source, gchar **error_out) {
    const gchar *ua =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    gchar *cmd1[] = {
        "yt-dlp",
        "--get-url",
        "--no-playlist",
        "--format", "b[protocol*=m3u8]/b",
        "--add-header", "Referer: https://www.youtube.com/",
        "--add-header", "Origin: https://www.youtube.com",
        "--user-agent", (gchar *)ua,
        (gchar *)source,
        NULL
    };
    gchar *cmd2[] = {
        "yt-dlp",
        "--get-url",
        "--no-playlist",
        "--extractor-args", "youtube:player_client=android",
        "--format", "best",
        "--user-agent", (gchar *)ua,
        (gchar *)source,
        NULL
    };
    gchar *cmd3[] = {
        "yt-dlp",
        "--get-url",
        "--no-playlist",
        "--format", "b[protocol*=m3u8]/best",
        (gchar *)source,
        NULL
    };
    gchar **commands[] = {cmd1, cmd2, cmd3};
    gchar *resolved = run_first_success(commands, 3, error_out);
    if (resolved) {
        return resolved;
    }
    // Last resort: download temp file and play local URI.
    return download_temp_and_return_file_uri(source, error_out);
}

gboolean youtube_service_start_download(const gchar *source, gchar **error_out) {
    const gchar *ua =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    GError *gerr = NULL;

    gchar *cmd1[] = {
        "yt-dlp",
        "--no-playlist",
        "--force-ipv4",
        "--extractor-args", "youtube:player_client=android,web",
        "--format", "bestvideo+bestaudio/best",
        "--user-agent", (gchar *)ua,
        "-o", "%(title)s.%(ext)s",
        (gchar *)source,
        NULL
    };
    if (g_spawn_async(NULL, cmd1, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, NULL, &gerr)) {
        return TRUE;
    }
    if (gerr) g_error_free(gerr);
    gerr = NULL;

    gchar *cmd2[] = {
        "yt-dlp",
        "--no-playlist",
        "-f", "bestvideo+bestaudio/best",
        "-o", "%(title)s.%(ext)s",
        (gchar *)source,
        NULL
    };
    if (g_spawn_async(NULL, cmd2, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, NULL, &gerr)) {
        return TRUE;
    }
    if (error_out) {
        *error_out = g_strdup_printf("yt-dlp 다운로드 시작 실패: %s",
                                     gerr ? gerr->message : "unknown");
    }
    if (gerr) g_error_free(gerr);
    return FALSE;
}
