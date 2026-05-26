#include "paths.h"

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static char g_soundfont[PATH_MAX];

static void resolve_exe_dir(char *buf, size_t buflen)
{
    ssize_t n = readlink("/proc/self/exe", buf, buflen - 1);
    if (n > 0) {
        buf[n] = '\0';
        char *slash = strrchr(buf, '/');
        if (slash)
            *slash = '\0';
        return;
    }
    if (getcwd(buf, buflen))
        return;
    buf[0] = '.';
    buf[1] = '\0';
}

static void init_paths(void)
{
    static int done;
    char base[PATH_MAX];

    if (done)
        return;
    done = 1;

    resolve_exe_dir(base, sizeof base);
    snprintf(g_soundfont, sizeof g_soundfont, "%s/SoundFonts/TimGM6mb.sf2", base);
    if (access(g_soundfont, R_OK) != 0)
        snprintf(g_soundfont, sizeof g_soundfont, "SoundFonts/TimGM6mb.sf2");
}

const char *paths_soundfont(void)
{
    init_paths();
    return g_soundfont;
}
