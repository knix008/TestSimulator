#pragma once
#include <gtk/gtk.h>
#include <cstdint>
#include <string>
#include <vector>

struct ShareableWindow {
    std::uint64_t xid = 0;
    std::string title;
    int width = 0;
    int height = 0;
};

std::vector<ShareableWindow> list_shareable_windows(std::uint64_t exclude_xid);

bool window_picker_dialog_run(GtkWindow* parent, std::uint64_t exclude_xid,
                              std::uint64_t* out_xid, std::string* out_title);
