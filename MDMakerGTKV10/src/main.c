#include <gtk/gtk.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "main_window.h"

/* Try to find TimGM6mb.sf2 next to the executable or in ./SoundFonts/ */
static int find_soundfont(char *out, size_t sz) {
    const char *candidates[] = {
        "SoundFonts/TimGM6mb.sf2",
        "../SoundFonts/TimGM6mb.sf2",
        "/usr/share/sounds/sf2/TimGM6mb.sf2",
        "/usr/share/soundfonts/TimGM6mb.sf2",
        NULL
    };
    for (int i = 0; candidates[i]; i++) {
        FILE *f = fopen(candidates[i], "rb");
        if (f) { fclose(f); snprintf(out, sz, "%s", candidates[i]); return 1; }
    }
    return 0;
}

int main(int argc, char **argv) {
    gtk_init(&argc, &argv);

    char sf_path[1024] = {0};
    if (!find_soundfont(sf_path, sizeof(sf_path))) {
        fprintf(stderr,
            "SoundFont을 찾을 수 없습니다.\n"
            "TimGM6mb.sf2 를 SoundFonts/ 디렉터리에 복사하세요.\n");
        /* continue anyway — FluidSynth will report the error */
        snprintf(sf_path, sizeof(sf_path), "SoundFonts/TimGM6mb.sf2");
    }

    main_window_new(sf_path);
    gtk_main();
    return 0;
}
