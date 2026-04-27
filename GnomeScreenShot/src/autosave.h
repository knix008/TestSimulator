#ifndef AUTOSAVE_H
#define AUTOSAVE_H

#include <gtk/gtk.h>
#include <stdbool.h>

char* generate_auto_save_filename(const char *directory);
bool save_screenshot(GdkPixbuf *pixbuf, const char *filename);
char* get_default_save_directory(void);

#endif /* AUTOSAVE_H */
