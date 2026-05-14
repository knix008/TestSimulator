#pragma once

/* GTK-free file export utilities. */

#include "tts_engine.h"
#include <stdbool.h>

/* Save audio as a WAV file using libsndfile.
   Returns true on success. */
bool file_save_wav(const char *path, const AudioData *data);

/* Save audio as an MP3 file using LAME.
   bitrate: kbps (e.g. 128, 192, 320).
   Returns true on success. */
bool file_save_mp3(const char *path, const AudioData *data, int bitrate);
