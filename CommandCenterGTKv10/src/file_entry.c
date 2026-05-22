#include "file_entry.h"

#include <glib.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void file_entry_free(FileEntry *entry) {
    if (!entry) return;
    g_free(entry->name);
    g_free(entry->full_path);
    g_free(entry->extension);
    g_free(entry);
}

char *file_entry_format_size(int64_t bytes) {
    char *buf = g_malloc(64);
    if (bytes < 1024)
        g_snprintf(buf, 64, "%" PRId64 " B", (int64_t)bytes);
    else if (bytes < 1024 * 1024)
        g_snprintf(buf, 64, "%.1f KB", bytes / 1024.0);
    else if (bytes < 1024LL * 1024 * 1024)
        g_snprintf(buf, 64, "%.1f MB", bytes / (1024.0 * 1024));
    else
        g_snprintf(buf, 64, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
    return buf;
}

char *file_entry_size_display(const FileEntry *entry) {
    if (!entry) return g_strdup("");
    if (entry->is_directory) return g_strdup("<DIR>");
    return file_entry_format_size(entry->size);
}

char *file_entry_type_display(const FileEntry *entry) {
    if (!entry) return g_strdup("");
    if (entry->is_directory) return g_strdup("폴더");
    if (entry->extension && entry->extension[0] == '.' && entry->extension[1]) {
        char *type = g_strdup_printf("%s 파일", entry->extension + 1);
        for (char *p = type; *p; p++)
            *p = (char)g_ascii_toupper(*p);
        return type;
    }
    return g_strdup("파일");
}
