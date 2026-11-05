# Builds one LVGL version into a single-file WebAssembly engine (scripts/build-engine.mjs).
cmake_minimum_required(VERSION 3.16)
project(lvgl_engine C)

file(GLOB_RECURSE LVGL_SOURCES CONFIGURE_DEPENDS "${LVGL_DIR}/src/*.c")
add_executable(engine runtime.c ${LVGL_SOURCES})
target_include_directories(engine PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}" "${LVGL_DIR}")
target_compile_definitions(engine PRIVATE LV_CONF_INCLUDE_SIMPLE)
target_compile_options(engine PRIVATE -O2 -w)

set(EXPORTS "_malloc,_free,_ml_get_value,_ml_font_load,_ml_default_font,_ml_setup,_ml_clear,_ml_theme,_ml_create,_ml_range,_ml_set_i,_ml_set_s,_ml_event,_ml_next_log,_ml_show,_ml_render,_ml_tick,_ml_pointer,_ml_framebuffer,_ml_coords,_ml_content_origin,_ml_version,_ml_image_load,_ml_link,_ml_date,_ml_digits,_ml_qr_size,_ml_canvas,_ml_grid,_ml_cell")
target_link_options(engine PRIVATE
  -O2
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sSINGLE_FILE=1
  -sENVIRONMENT=web,node
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432
  -sEXPORT_NAME=createEngine
  "-sEXPORTED_FUNCTIONS=${EXPORTS}"
  "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,UTF8ToString,stringToUTF8,lengthBytesUTF8")
set_target_properties(engine PROPERTIES OUTPUT_NAME "lvgl-${LVGL_VERSION}" SUFFIX ".js")
