/**
 * EasyMD GTK
 * ui.h - Public UI lifecycle.
 */
#ifndef EASYMD_UI_H
#define EASYMD_UI_H

#include <gtk/gtk.h>

typedef struct UIContext UIContext;

UIContext *ui_init(int argc, char **argv);
void       ui_show(UIContext *ctx);
void       ui_run(UIContext *ctx);
void       ui_cleanup(UIContext *ctx);

/* Optional: load a file at startup (called by main after CLI parsing). */
void       ui_load_file(UIContext *ctx, const char *path);

#endif /* EASYMD_UI_H */
