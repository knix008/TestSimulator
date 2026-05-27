#pragma once

/*
 * Pure C interface — no GTK / GLib dependency.
 *
 * Callbacks are invoked from the worker thread.  Callers that need to
 * update a GTK UI must marshal them to the main thread (e.g. via
 * g_idle_add) inside their own callback wrapper.
 */

typedef void (*ExportProgressCb)(int percent,   void *user_data);
typedef void (*ExportDoneCb)    (int success,    /* 1 = ok */
                                  const char *err_msg,
                                  void *user_data);

void audio_export_start(
    const char     *midi_path,
    const char     *out_path,
    const char     *soundfont_path,
    int             instrument,
    int             as_mp3,          /* 0 = WAV, 1 = MP3 */
    ExportProgressCb progress_cb,
    ExportDoneCb     done_cb,
    void            *user_data
);
