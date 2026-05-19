#pragma once

#include <functional>
#include <string>

struct VncServerOptions {
    int port = 5900;
    std::string password;
    bool allow_input = true;
};

using VncStatusCallback = std::function<void(const std::string& message)>;
using VncClientCountCallback = std::function<void(int count)>;

bool vnc_server_start(const VncServerOptions& options,
                      VncStatusCallback on_status,
                      VncClientCountCallback on_clients);

void vnc_server_stop();
bool vnc_server_is_running();
int vnc_server_client_count();
