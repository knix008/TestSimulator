#pragma once
#include <gtk/gtk.h>

/* Called from the GStreamer streaming thread – must be thread-safe. */
typedef void (*video_audio_cb_t)(const float *pcm, int n, void *userdata);

/* Called on the GTK main thread when the video reaches end-of-stream or errors. */
typedef void (*video_eos_cb_t)(void *userdata);

/* Called on the GTK main thread once it is known the file has no video track. */
typedef void (*video_audio_only_cb_t)(void *userdata);

typedef struct VideoPlayer VideoPlayer;

VideoPlayer *video_player_new      (const char *path,
                                    video_audio_cb_t      audio_cb,
                                    video_eos_cb_t        eos_cb,
                                    video_audio_only_cb_t audio_only_cb,
                                    void *userdata);
void         video_player_free     (VideoPlayer *vp);
GtkWidget   *video_player_widget   (VideoPlayer *vp);
void         video_player_play     (VideoPlayer *vp);
void         video_player_pause    (VideoPlayer *vp);
void         video_player_resume   (VideoPlayer *vp);
void         video_player_stop     (VideoPlayer *vp);
gboolean     video_player_is_paused(VideoPlayer *vp);
gint64       video_player_position (VideoPlayer *vp); /* seconds */
gint64       video_player_duration (VideoPlayer *vp); /* seconds */
void         video_player_seek     (VideoPlayer *vp, gint64 seconds);
