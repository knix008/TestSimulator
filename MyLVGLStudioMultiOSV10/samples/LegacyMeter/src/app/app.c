/*
 * The application logic. My LVGL Studio writes this file once, when it is missing, and never
 * changes it again: the design can change as much as it likes, this code stays. Every .c
 * and .cpp file in src/app is built with the project.
 *
 * Talk to the screens only through the ViewModels of glue.h: set a property and the bound
 * widgets follow; read one to see what the user did; observe one to hear of each change.
 * Add ViewModels in the studio (the ViewModels panel), bind widget properties to them, and
 * then use the functions src/glue/vm_<name>.h declares: vm_<name>_set_<property>(...).
 * Nothing here needs lvgl.h, so this code also builds, and can be tested, without LVGL.
 */
#include "app.h"
#include "glue.h"

void app_init(void)
{
}
