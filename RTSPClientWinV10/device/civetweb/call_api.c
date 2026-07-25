/*
 * Minimal Civetweb call signaling for LAN 1:1 RTSP video calls.
 *
 * Build (example, adjust include/lib paths):
 *   gcc -O2 -Wall -c call_api.c -I/path/to/civetweb/include
 *   # link with your firmware that already embeds civetweb
 */

#include "call_api.h"

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

typedef enum {
    CALL_IDLE = 0,
    CALL_ACTIVE,
    CALL_ERROR
} call_state_t;

typedef struct {
    pthread_mutex_t lock;
    call_state_t state;
    char session_id[64];
    char device_rtsp_url[256];
    char pc_rtsp_url[256];
    char message[256];
} call_session_t;

static call_session_t g_call = {
    .lock = PTHREAD_MUTEX_INITIALIZER,
    .state = CALL_IDLE
};

static const char *env_or(const char *key, const char *fallback)
{
    const char *v = getenv(key);
    return (v && v[0]) ? v : fallback;
}

static void json_escape(const char *in, char *out, size_t out_sz)
{
    size_t j = 0;
    for (size_t i = 0; in && in[i] && j + 2 < out_sz; ++i) {
        if (in[i] == '"' || in[i] == '\\') {
            out[j++] = '\\';
            out[j++] = in[i];
        } else if ((unsigned char)in[i] < 0x20) {
            continue;
        } else {
            out[j++] = in[i];
        }
    }
    out[j] = '\0';
}

static void send_json(struct mg_connection *conn, int status, const char *body)
{
    mg_printf(conn,
              "HTTP/1.1 %d OK\r\n"
              "Content-Type: application/json\r\n"
              "Cache-Control: no-store\r\n"
              "Access-Control-Allow-Origin: *\r\n"
              "Connection: close\r\n"
              "Content-Length: %zu\r\n\r\n%s",
              status, strlen(body), body);
}

static int run_script(const char *script, const char *arg1)
{
    char cmd[512];
    if (arg1 && arg1[0])
        snprintf(cmd, sizeof(cmd), "%s '%s'", script, arg1);
    else
        snprintf(cmd, sizeof(cmd), "%s", script);
    int rc = system(cmd);
    return rc;
}

static void extract_json_string(const char *json, const char *key, char *out, size_t out_sz)
{
    out[0] = '\0';
    char pattern[128];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p)
        return;
    p = strchr(p + strlen(pattern), ':');
    if (!p)
        return;
    p++;
    while (*p == ' ' || *p == '\t')
        p++;
    if (*p != '"')
        return;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < out_sz) {
        if (*p == '\\' && p[1])
            p++;
        out[i++] = *p++;
    }
    out[i] = '\0';
}

static int handle_status(struct mg_connection *conn, void *cbdata)
{
    (void)cbdata;
    char device_esc[300], pc_esc[300], msg_esc[300], sid_esc[100];
    const char *state_str;

    pthread_mutex_lock(&g_call.lock);
    state_str = (g_call.state == CALL_ACTIVE) ? "active" :
                (g_call.state == CALL_ERROR) ? "error" : "idle";
    json_escape(g_call.device_rtsp_url, device_esc, sizeof(device_esc));
    json_escape(g_call.pc_rtsp_url, pc_esc, sizeof(pc_esc));
    json_escape(g_call.message, msg_esc, sizeof(msg_esc));
    json_escape(g_call.session_id, sid_esc, sizeof(sid_esc));
    pthread_mutex_unlock(&g_call.lock);

    char body[1024];
    snprintf(body, sizeof(body),
             "{\"ok\":true,\"state\":\"%s\",\"session_id\":\"%s\","
             "\"device_rtsp_url\":\"%s\",\"pc_rtsp_url\":\"%s\",\"message\":\"%s\"}",
             state_str, sid_esc, device_esc, pc_esc, msg_esc);
    send_json(conn, 200, body);
    return 200;
}

static int handle_start(struct mg_connection *conn, void *cbdata)
{
    (void)cbdata;
    char body_in[2048];
    int n = mg_read(conn, body_in, sizeof(body_in) - 1);
    if (n < 0)
        n = 0;
    body_in[n] = '\0';

    char pc_rtsp[256] = {0};
    extract_json_string(body_in, "pc_rtsp_url", pc_rtsp, sizeof(pc_rtsp));
    if (!pc_rtsp[0]) {
        send_json(conn, 400, "{\"ok\":false,\"state\":\"error\",\"message\":\"pc_rtsp_url required\"}");
        return 400;
    }

    const char *publish = env_or("CALL_PUBLISH_SCRIPT", "./scripts/start_device_publish.sh");
    const char *pull = env_or("CALL_PULL_SCRIPT", "./scripts/start_pc_pull.sh");
    const char *device_url = env_or("CALL_DEVICE_RTSP_URL", "rtsp://127.0.0.1:8554/device");

    pthread_mutex_lock(&g_call.lock);
    if (g_call.state == CALL_ACTIVE) {
        pthread_mutex_unlock(&g_call.lock);
        send_json(conn, 409, "{\"ok\":false,\"state\":\"active\",\"message\":\"call already active\"}");
        return 409;
    }

    snprintf(g_call.session_id, sizeof(g_call.session_id), "sess-%ld", (long)time(NULL));
    snprintf(g_call.device_rtsp_url, sizeof(g_call.device_rtsp_url), "%s", device_url);
    snprintf(g_call.pc_rtsp_url, sizeof(g_call.pc_rtsp_url), "%s", pc_rtsp);
    snprintf(g_call.message, sizeof(g_call.message), "%s", "starting pipelines");
    g_call.state = CALL_ACTIVE;
    pthread_mutex_unlock(&g_call.lock);

    if (run_script(publish, NULL) != 0) {
        pthread_mutex_lock(&g_call.lock);
        g_call.state = CALL_ERROR;
        snprintf(g_call.message, sizeof(g_call.message), "%s", "publish script failed");
        pthread_mutex_unlock(&g_call.lock);
        send_json(conn, 500, "{\"ok\":false,\"state\":\"error\",\"message\":\"publish script failed\"}");
        return 500;
    }

    if (run_script(pull, pc_rtsp) != 0) {
        pthread_mutex_lock(&g_call.lock);
        g_call.state = CALL_ERROR;
        snprintf(g_call.message, sizeof(g_call.message), "%s", "pull script failed");
        pthread_mutex_unlock(&g_call.lock);
        send_json(conn, 500, "{\"ok\":false,\"state\":\"error\",\"message\":\"pull script failed\"}");
        return 500;
    }

    pthread_mutex_lock(&g_call.lock);
    snprintf(g_call.message, sizeof(g_call.message), "%s", "in call");
    char device_esc[300], sid_esc[100];
    json_escape(g_call.device_rtsp_url, device_esc, sizeof(device_esc));
    json_escape(g_call.session_id, sid_esc, sizeof(sid_esc));
    pthread_mutex_unlock(&g_call.lock);

    char body[512];
    snprintf(body, sizeof(body),
             "{\"ok\":true,\"state\":\"active\",\"session_id\":\"%s\","
             "\"device_rtsp_url\":\"%s\",\"message\":\"started\"}",
             sid_esc, device_esc);
    send_json(conn, 200, body);
    return 200;
}

static int handle_hangup(struct mg_connection *conn, void *cbdata)
{
    (void)cbdata;
    const char *stop = env_or("CALL_STOP_SCRIPT", "./scripts/stop_call.sh");
    run_script(stop, NULL);

    pthread_mutex_lock(&g_call.lock);
    g_call.state = CALL_IDLE;
    g_call.session_id[0] = '\0';
    g_call.pc_rtsp_url[0] = '\0';
    snprintf(g_call.message, sizeof(g_call.message), "%s", "ended");
    pthread_mutex_unlock(&g_call.lock);

    send_json(conn, 200, "{\"ok\":true,\"state\":\"idle\",\"message\":\"ended\"}");
    return 200;
}

void call_api_register(struct mg_context *ctx)
{
    const char *device_url = env_or("CALL_DEVICE_RTSP_URL", "rtsp://127.0.0.1:8554/device");
    pthread_mutex_lock(&g_call.lock);
    snprintf(g_call.device_rtsp_url, sizeof(g_call.device_rtsp_url), "%s", device_url);
    pthread_mutex_unlock(&g_call.lock);

    mg_set_request_handler(ctx, "/api/call/status", handle_status, NULL);
    mg_set_request_handler(ctx, "/api/call/start", handle_start, NULL);
    mg_set_request_handler(ctx, "/api/call/hangup", handle_hangup, NULL);
}
