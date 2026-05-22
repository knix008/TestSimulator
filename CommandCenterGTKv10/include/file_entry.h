#ifndef FILE_ENTRY_H
#define FILE_ENTRY_H

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

typedef struct FileEntry {
    char *name;
    char *full_path;
    bool is_directory;
    int64_t size;
    time_t last_modified;
    char *extension;
    unsigned int attributes;
} FileEntry;

void file_entry_free(FileEntry *entry);
char *file_entry_format_size(int64_t bytes);
char *file_entry_size_display(const FileEntry *entry);
char *file_entry_type_display(const FileEntry *entry);

#endif
