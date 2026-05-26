/* Standalone test for audio_export_wav / audio_export_mp3 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "audio_export.h"
#include "paths.h"

static int file_size(const char *path)
{
    struct stat st;
    if (stat(path, &st) != 0)
        return -1;
    return (int)st.st_size;
}

int main(int argc, char **argv)
{
    const char *midi = argc > 1 ? argv[1]
        : "../MidiSheetMusic(v2.6)/MidiSheetMusic/"
          "MidiSheetMusic-2.6-win-src(Revised)/sample.mid";
    const char *sf2 = paths_soundfont();
    const char *wav = "/tmp/midimaster_test.wav";
    const char *mp3 = "/tmp/midimaster_test.mp3";

    GError *err = NULL;
    int failures = 0;

    printf("MIDI:      %s\n", midi);
    printf("SoundFont: %s\n", sf2);

    if (audio_export_wav(midi, wav, sf2, 0, NULL, NULL, &err)) {
        int sz = file_size(wav);
        printf("[OK] WAV  %s  (%d bytes)\n", wav, sz);
        if (sz < 1000)
            failures++, printf("     [!] WAV too small\n");
    } else {
        printf("[FAIL] WAV: %s\n", err ? err->message : "unknown");
        g_clear_error(&err);
        failures++;
    }

    if (audio_export_mp3(midi, mp3, sf2, 0, NULL, NULL, &err)) {
        int sz = file_size(mp3);
        printf("[OK] MP3  %s  (%d bytes)\n", mp3, sz);
        if (sz < 500)
            failures++, printf("     [!] MP3 too small\n");
    } else {
        printf("[FAIL] MP3: %s\n", err ? err->message : "unknown");
        g_clear_error(&err);
        failures++;
    }

    return failures ? 1 : 0;
}
