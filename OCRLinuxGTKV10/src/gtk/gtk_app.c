#include "gtk/gtk_app.h"
#include "gtk/gtk_main_window.h"
#include "gtk/gtk_app_icon.h"
#include "app/ocr_app.h"
#include <gtk/gtk.h>
#include <leptonica/allheaders.h>

int gtk_app_run(int argc, char *argv[]) {
    /* Leptonica INFO 메시지 억제 (예: "pixRotate: 1 bpp; rotate by shear") */
    setMsgSeverity(L_SEVERITY_WARNING);

    /* Dock에서 .desktop 항목과 실행 창을 안정적으로 매칭 */
    g_set_prgname("myocr");
    gdk_set_program_class("MyOCR");

    gtk_init(&argc, &argv);

    g_set_application_name("MyOCR");
    gtk_app_icon_apply(NULL);

    OcrApp *app = ocr_app_new();
    gtk_main_window_create(app);

    gtk_main();

    ocr_app_free(app);
    return 0;
}
