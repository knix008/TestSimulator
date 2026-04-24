#include <gst/gst.h>
#include "rtsp_server.h"
#include "gui.h"

int main(int argc, char *argv[]) {
    // Enable GStreamer debug output
    g_setenv("GST_DEBUG", "2", TRUE);
    
    gst_init(&argc, &argv);
    
    g_print("\n=== RTSP Server with GUI ===\n");
    g_print("GStreamer version: %s\n\n", gst_version_string());
    
    // RTSP 서버 컨텍스트 생성
    RTSPServerContext *server_ctx = rtsp_server_new();
    
    // GUI 생성 및 실행
    GUIContext *gui_ctx = gui_create(server_ctx);
    gui_run(gui_ctx, argc, argv);
    
    // 정리
    gui_free(gui_ctx);
    rtsp_server_free(server_ctx);
    
    return 0;
}
