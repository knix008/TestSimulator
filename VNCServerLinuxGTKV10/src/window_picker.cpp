#include "window_picker.h"

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>

#include <algorithm>
#include <cstdint>
#include <set>
#include <string>
#include <unordered_set>
#include <vector>

namespace {

constexpr int kMinWindowSize = 32;
constexpr unsigned long kMaxClientListItems = 4096;

struct WmWindowType {
    bool has_type = false;
    bool is_desktop = false;
    bool is_dock = false;
    bool is_splash = false;
    bool is_tooltip = false;
    bool is_menu = false;
    bool is_notification = false;
    bool is_normal = false;
    bool is_dialog = false;
    bool is_utility = false;
};

std::string read_atom_name(Display* display, Window window, const char* atom_name) {
    const Atom atom = XInternAtom(display, atom_name, False);
    if (atom == None) {
        return {};
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(display, window, atom, 0, 1024, False, AnyPropertyType,
                                          &actual_type, &actual_format, &nitems, &bytes_after,
                                          &data);
    if (status != Success || !data || nitems == 0) {
        if (data) {
            XFree(data);
        }
        return {};
    }

    std::string value;
    if (actual_type == XA_STRING) {
        value.assign(reinterpret_cast<const char*>(data), nitems);
    } else if (actual_type == XInternAtom(display, "UTF8_STRING", False)) {
        value.assign(reinterpret_cast<const char*>(data), nitems);
    }
    XFree(data);
    return value;
}

std::string read_window_title(Display* display, Window window) {
    std::string title = read_atom_name(display, window, "_NET_WM_NAME");
    if (title.empty()) {
        title = read_atom_name(display, window, "WM_NAME");
    }
    if (!title.empty()) {
        return title;
    }

    char* name = nullptr;
    if (XFetchName(display, window, &name) && name) {
        title = name;
        XFree(name);
        return title;
    }
    return {};
}

std::string read_wm_class(Display* display, Window window) {
    XClassHint hint{};
    if (XGetClassHint(display, window, &hint) == 0) {
        return {};
    }

    std::string cls;
    if (hint.res_class && hint.res_class[0] != '\0') {
        cls = hint.res_class;
    } else if (hint.res_name && hint.res_name[0] != '\0') {
        cls = hint.res_name;
    }

    if (hint.res_name) {
        XFree(hint.res_name);
    }
    if (hint.res_class) {
        XFree(hint.res_class);
    }
    return cls;
}

std::string format_window_label(Display* display, Window window) {
    std::string title = read_window_title(display, window);
    const std::string wm_class = read_wm_class(display, window);

    if (!title.empty() && !wm_class.empty()) {
        return title + "  [" + wm_class + "]";
    }
    if (!title.empty()) {
        return title;
    }
    if (!wm_class.empty()) {
        return "[" + wm_class + "]";
    }
    return "Untitled window (0x" + std::to_string(static_cast<std::uint64_t>(window)) + ")";
}

WmWindowType read_wm_window_type(Display* display, Window window) {
    WmWindowType result{};
    const Atom wm_type_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE", False);
    if (wm_type_atom == None) {
        return result;
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(display, window, wm_type_atom, 0, 16, False, XA_ATOM,
                                          &actual_type, &actual_format, &nitems, &bytes_after,
                                          &data);
    if (status != Success || !data || actual_type != XA_ATOM || nitems == 0) {
        if (data) {
            XFree(data);
        }
        return result;
    }

    const Atom desktop_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_DESKTOP", False);
    const Atom dock_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_DOCK", False);
    const Atom splash_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_SPLASH", False);
    const Atom tooltip_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_TOOLTIP", False);
    const Atom menu_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_MENU", False);
    const Atom notification_atom =
        XInternAtom(display, "_NET_WM_WINDOW_TYPE_NOTIFICATION", False);
    const Atom normal_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_NORMAL", False);
    const Atom dialog_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_DIALOG", False);
    const Atom utility_atom = XInternAtom(display, "_NET_WM_WINDOW_TYPE_UTILITY", False);

    result.has_type = true;
    auto* atoms = reinterpret_cast<Atom*>(data);
    for (unsigned long i = 0; i < nitems; ++i) {
        if (atoms[i] == desktop_atom) {
            result.is_desktop = true;
        } else if (atoms[i] == dock_atom) {
            result.is_dock = true;
        } else if (atoms[i] == splash_atom) {
            result.is_splash = true;
        } else if (atoms[i] == tooltip_atom) {
            result.is_tooltip = true;
        } else if (atoms[i] == menu_atom) {
            result.is_menu = true;
        } else if (atoms[i] == notification_atom) {
            result.is_notification = true;
        } else if (atoms[i] == normal_atom) {
            result.is_normal = true;
        } else if (atoms[i] == dialog_atom) {
            result.is_dialog = true;
        } else if (atoms[i] == utility_atom) {
            result.is_utility = true;
        }
    }
    XFree(data);
    return result;
}

bool window_is_iconic(Display* display, Window window) {
    const Atom wm_state_atom = XInternAtom(display, "WM_STATE", False);
    if (wm_state_atom == None) {
        return false;
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(display, window, wm_state_atom, 0, 2, False, wm_state_atom,
                                          &actual_type, &actual_format, &nitems, &bytes_after,
                                          &data);
    if (status != Success || !data || nitems < 1) {
        if (data) {
            XFree(data);
        }
        return false;
    }

    const auto state = static_cast<long>(*reinterpret_cast<long*>(data));
    XFree(data);
    return state == IconicState;
}

bool window_is_visible_enough(Display* display, Window window) {
    XWindowAttributes attr{};
    if (XGetWindowAttributes(display, window, &attr) != 1) {
        return false;
    }
    if (attr.map_state == IsViewable) {
        return true;
    }
    return window_is_iconic(display, window);
}

bool window_is_skippable_chrome(const WmWindowType& type) {
    return type.is_desktop || type.is_dock || type.is_splash || type.is_tooltip || type.is_menu ||
           type.is_notification;
}

bool window_is_share_candidate(Display* display, Window window, std::uint64_t exclude_xid,
                             bool from_client_list) {
    if (static_cast<std::uint64_t>(window) == exclude_xid) {
        return false;
    }

    XWindowAttributes attr{};
    if (XGetWindowAttributes(display, window, &attr) != 1 || attr.c_class != InputOutput) {
        return false;
    }
    if (attr.width < kMinWindowSize || attr.height < kMinWindowSize) {
        return false;
    }

    const WmWindowType type = read_wm_window_type(display, window);
    if (window_is_skippable_chrome(type)) {
        return false;
    }

    // WM-managed windows (from _NET_CLIENT_LIST): trust the WM's judgment.
    // Accept all non-chrome windows, including those on other workspaces
    // (which are NormalState but IsUnmapped, so window_is_visible_enough fails for them).
    if (from_client_list) {
        return true;
    }

    // Windows found only via tree walk: require they be actually visible
    // and have an explicit application window type.
    if (!window_is_visible_enough(display, window)) {
        return false;
    }

    if (type.has_type) {
        return type.is_normal || type.is_dialog || type.is_utility;
    }

    const bool has_title = !read_window_title(display, window).empty();
    const bool has_class = !read_wm_class(display, window).empty();
    return has_title || has_class;
}

void append_root_window_list(Display* display, Window root, Atom list_atom,
                             std::unordered_set<Window>& out) {
    if (list_atom == None) {
        return;
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(display, root, list_atom, 0, kMaxClientListItems, False,
                                          XA_WINDOW, &actual_type, &actual_format, &nitems,
                                          &bytes_after, &data);
    if (status != Success || !data || actual_type != XA_WINDOW || nitems == 0) {
        if (data) {
            XFree(data);
        }
        return;
    }

    auto* windows = reinterpret_cast<Window*>(data);
    for (unsigned long i = 0; i < nitems; ++i) {
        out.insert(windows[i]);
    }
    XFree(data);
}

void collect_windows_from_tree(Display* display, Window window, Window root,
                               std::unordered_set<Window>& out) {
    Window tree_root = 0;
    Window parent = 0;
    Window* children = nullptr;
    unsigned int child_count = 0;

    if (!XQueryTree(display, window, &tree_root, &parent, &children, &child_count)) {
        return;
    }

    for (unsigned int i = 0; i < child_count; ++i) {
        const Window child = children[i];
        const WmWindowType type = read_wm_window_type(display, child);
        if (type.has_type && !window_is_skippable_chrome(type) &&
            (type.is_normal || type.is_dialog || type.is_utility)) {
            out.insert(child);
        }
        collect_windows_from_tree(display, child, root, out);
    }

    if (children) {
        XFree(children);
    }
}

}  // namespace

std::vector<ShareableWindow> list_shareable_windows(std::uint64_t exclude_xid) {
    std::vector<ShareableWindow> result;

    Display* display = XOpenDisplay(nullptr);
    if (!display) {
        return result;
    }

    const Window root = DefaultRootWindow(display);
    std::unordered_set<Window> from_client_list;
    std::unordered_set<Window> candidates;

    append_root_window_list(display, root,
                            XInternAtom(display, "_NET_CLIENT_LIST", False), from_client_list);
    append_root_window_list(display, root,
                            XInternAtom(display, "_NET_CLIENT_LIST_STACKING", False),
                            from_client_list);
    candidates = from_client_list;
    collect_windows_from_tree(display, root, root, candidates);

    for (Window window : candidates) {
        const bool from_list = from_client_list.count(window) != 0;
        if (!window_is_share_candidate(display, window, exclude_xid, from_list)) {
            continue;
        }

        XWindowAttributes attr{};
        if (XGetWindowAttributes(display, window, &attr) != 1) {
            continue;
        }

        ShareableWindow entry{};
        entry.xid = static_cast<std::uint64_t>(window);
        entry.title = format_window_label(display, window);
        entry.width = attr.width;
        entry.height = attr.height;
        result.push_back(std::move(entry));
    }

    XCloseDisplay(display);

    std::sort(result.begin(), result.end(),
              [](const ShareableWindow& a, const ShareableWindow& b) {
                  if (a.title != b.title) {
                      return a.title < b.title;
                  }
                  return a.xid < b.xid;
              });

    result.erase(std::unique(result.begin(), result.end(),
                             [](const ShareableWindow& a, const ShareableWindow& b) {
                                 return a.xid == b.xid;
                             }),
                 result.end());
    return result;
}

bool window_picker_dialog_run(GtkWindow* parent, std::uint64_t exclude_xid,
                              std::uint64_t* out_xid, std::string* out_title) {
    if (!out_xid) {
        return false;
    }

    const auto windows = list_shareable_windows(exclude_xid);
    if (windows.empty()) {
        GtkWidget* err = gtk_message_dialog_new(parent, GTK_DIALOG_MODAL, GTK_MESSAGE_WARNING,
                                                GTK_BUTTONS_OK, "공유할 창이 없습니다");
        gtk_message_dialog_format_secondary_text(
            GTK_MESSAGE_DIALOG(err),
            "X11로 표시되는 창만 목록에 나타납니다.\n"
            "Wayland 전용 앱은 «전체 화면» 공유를 사용하세요.");
        gtk_dialog_run(GTK_DIALOG(err));
        gtk_widget_destroy(err);
        return false;
    }

    GtkWidget* dialog = gtk_dialog_new_with_buttons(
        "공유할 창 선택", parent,
        static_cast<GtkDialogFlags>(GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT), "_Cancel",
        GTK_RESPONSE_CANCEL, "_OK", GTK_RESPONSE_OK, nullptr);
    gtk_window_set_default_size(GTK_WINDOW(dialog), 560, 420);
    gtk_dialog_set_default_response(GTK_DIALOG(dialog), GTK_RESPONSE_OK);

    GtkWidget* content = gtk_dialog_get_content_area(GTK_DIALOG(dialog));
    gtk_container_set_border_width(GTK_CONTAINER(content), 10);

    GtkWidget* hint = gtk_label_new(
        "최소화된 창·대화상자 포함. Wayland 전용 앱은 목록에 없을 수 있습니다.");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    gtk_label_set_line_wrap(GTK_LABEL(hint), TRUE);
    gtk_box_pack_start(GTK_BOX(content), hint, FALSE, FALSE, 4);

    GtkListStore* store = gtk_list_store_new(3, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_UINT64);
    for (const ShareableWindow& win : windows) {
        const std::string size =
            std::to_string(win.width) + "×" + std::to_string(win.height);
        GtkTreeIter iter;
        gtk_list_store_append(store, &iter);
        gtk_list_store_set(store, &iter, 0, win.title.c_str(), 1, size.c_str(), 2, win.xid, -1);
    }

    GtkWidget* scroll = gtk_scrolled_window_new(nullptr, nullptr);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll), GTK_POLICY_AUTOMATIC,
                                   GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);

    GtkWidget* tree = gtk_tree_view_new_with_model(GTK_TREE_MODEL(store));
    GtkCellRenderer* title_renderer = gtk_cell_renderer_text_new();
    GtkTreeViewColumn* title_col =
        gtk_tree_view_column_new_with_attributes("창 제목", title_renderer, "text", 0, nullptr);
    gtk_tree_view_append_column(GTK_TREE_VIEW(tree), title_col);

    GtkCellRenderer* size_renderer = gtk_cell_renderer_text_new();
    GtkTreeViewColumn* size_col =
        gtk_tree_view_column_new_with_attributes("크기", size_renderer, "text", 1, nullptr);
    gtk_tree_view_column_set_fixed_width(size_col, 110);
    gtk_tree_view_append_column(GTK_TREE_VIEW(tree), size_col);

    gtk_container_add(GTK_CONTAINER(scroll), tree);
    gtk_box_pack_start(GTK_BOX(content), scroll, TRUE, TRUE, 0);

    GtkTreeSelection* selection = gtk_tree_view_get_selection(GTK_TREE_VIEW(tree));
    GtkTreePath* path = gtk_tree_path_new_first();
    gtk_tree_selection_select_path(selection, path);
    gtk_tree_path_free(path);

    gtk_widget_show_all(dialog);
    const gint response = gtk_dialog_run(GTK_DIALOG(dialog));

    bool ok = false;
    if (response == GTK_RESPONSE_OK) {
        GtkTreeModel* model = nullptr;
        GtkTreeIter iter;
        if (gtk_tree_selection_get_selected(selection, &model, &iter)) {
            std::uint64_t xid = 0;
            gtk_tree_model_get(model, &iter, 2, &xid, -1);
            *out_xid = xid;
            if (out_title) {
                gchar* title = nullptr;
                gtk_tree_model_get(model, &iter, 0, &title, -1);
                if (title) {
                    *out_title = title;
                    g_free(title);
                }
            }
            ok = xid != 0;
        }
    }

    gtk_widget_destroy(dialog);
    g_object_unref(store);
    return ok;
}
