#ifndef AUDIO_EXPORT_H
#define AUDIO_EXPORT_H

#include <glib.h>

typedef void (*AudioExportProgressCb)(int percent, gpointer user_data);

gboolean audio_export_wav(const char *midi_path, const char *wav_path,
                          const char *soundfont_path, int program,
                          AudioExportProgressCb progress, gpointer user_data,
                          GError **err);

gboolean audio_export_mp3(const char *midi_path, const char *mp3_path,
                          const char *soundfont_path, int program,
                          AudioExportProgressCb progress, gpointer user_data,
                          GError **err);

#endif
