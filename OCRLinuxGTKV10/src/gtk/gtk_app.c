#include "gtk/gtk_app.h"
#include "gtk/gtk_main_window.h"
#include "gtk/gtk_app_icon.h"
#include "app/ocr_app.h"
#include <gtk/gtk.h>

int gtk_app_run(int argc, char *argv[]) {
    gtk_init(&argc, &argv);

    g_set_application_name("MyOCR");
    g_set_prgname("myocr");
    gtk_app_icon_apply(NULL);

    OcrApp *app = ocr_app_new();
    gtk_main_window_create(app);

    gtk_main();

    ocr_app_free(app);
    return 0;
}
