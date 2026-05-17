#include "app.h"

#include <stdlib.h>

int main(int argc, char **argv) {
    App *app = app_create(argc, argv);
    app_run(app);
    app_destroy(app);
    return 0;
}
