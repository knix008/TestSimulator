#ifndef MIDI_FILE_H
#define MIDI_FILE_H

#include <glib.h>

typedef struct {
    gchar  *path;
    gchar  *display_name;
    int     format;
    int     num_tracks;
    int     note_count;
    double  duration_sec;
} MidiFileInfo;

gboolean midi_file_load(const char *path, MidiFileInfo *info, GError **err);
void     midi_file_info_clear(MidiFileInfo *info);

#endif
