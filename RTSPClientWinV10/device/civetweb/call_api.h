#ifndef RTSP_CALL_API_H
#define RTSP_CALL_API_H

#include "civetweb.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Register LAN video-call HTTP handlers on an existing Civetweb context.
 *
 * Endpoints:
 *   GET  /api/call/status
 *   POST /api/call/start
 *   POST /api/call/hangup
 *
 * Environment (optional):
 *   CALL_DEVICE_RTSP_URL   default rtsp://<device-ip>:8554/device
 *   CALL_PUBLISH_SCRIPT    default ./scripts/start_device_publish.sh
 *   CALL_PULL_SCRIPT       default ./scripts/start_pc_pull.sh
 *   CALL_STOP_SCRIPT       default ./scripts/stop_call.sh
 */
void call_api_register(struct mg_context *ctx);

#ifdef __cplusplus
}
#endif

#endif /* RTSP_CALL_API_H */
