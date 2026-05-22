#include "main_window.h"

#include "canvas_view.h"
#include "composite.h"
#include "layer.h"
#include "layer_mask.h"

typedef struct {
    ImageProject *project;
    GtkWidget *layer_list;
    GtkWidget *canvas_view;
    GtkWidget *spin_x;
    GtkWidget *spin_y;
    GtkWidget *spin_opacity;
    GtkWidget *spin_canvas_w;
    GtkWidget *spin_canvas_h;
    GtkWidget *spin_place_x;
    GtkWidget *spin_place_y;
    GtkWidget *spin_place_w;
    GtkWidget *spin_place_h;
    GtkWidget *spin_place_angle;
    Layer *selected_layer;
    guint last_sel_count;
} MainWindowData;

static void rebuild_layer_list(MainWindowData *data);
static void on_object_property_changed(GtkSpinButton *spin, gpointer user_data);
static void update_property_spins(MainWindowData *data);

static void refresh_canvas(MainWindowData *data) {
    if (data->canvas_view)
        canvas_view_refresh(data->canvas_view);
}

static void sync_canvas_to_background(MainWindowData *data) {
    Layer *bg = image_project_find_background_layer(data->project);
    if (!bg || !bg->pixbuf)
        return;

    int w = gdk_pixbuf_get_width(bg->pixbuf);
    int h = gdk_pixbuf_get_height(bg->pixbuf);
    data->project->canvas_width = w;
    data->project->canvas_height = h;

    gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_canvas_w), w);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_canvas_h), h);
    canvas_view_set_project(data->canvas_view, data->project);
}

static void on_canvas_selection_changed(GtkWidget *view, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)view;

    guint n = data->selected_layer ? layer_selection_count(data->selected_layer) : 0;
    if (n != data->last_sel_count) {
        data->last_sel_count = n;
        sync_canvas_to_background(data);
        rebuild_layer_list(data);
    } else {
        update_property_spins(data);
        refresh_canvas(data);
    }
}

static void update_property_spins(MainWindowData *data) {
    Layer *layer = data->selected_layer;
    gboolean has_layer = layer != NULL;
    SelectionRect *sel = canvas_view_get_active_selection(data->canvas_view);
    gboolean has_object = has_layer && sel != NULL;

    gtk_widget_set_sensitive(data->spin_opacity, has_layer);
    gtk_widget_set_sensitive(data->spin_x, has_layer && !has_object);
    gtk_widget_set_sensitive(data->spin_y, has_layer && !has_object);
    gtk_widget_set_sensitive(data->spin_place_x, has_object);
    gtk_widget_set_sensitive(data->spin_place_y, has_object);
    gtk_widget_set_sensitive(data->spin_place_w, has_object);
    gtk_widget_set_sensitive(data->spin_place_h, has_object);
    gtk_widget_set_sensitive(data->spin_place_angle, has_object);

    if (!has_layer)
        return;

    gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_opacity), layer->opacity);

    if (has_object) {
        g_signal_handlers_block_by_func(data->spin_place_x, on_object_property_changed, data);
        g_signal_handlers_block_by_func(data->spin_place_y, on_object_property_changed, data);
        g_signal_handlers_block_by_func(data->spin_place_w, on_object_property_changed, data);
        g_signal_handlers_block_by_func(data->spin_place_h, on_object_property_changed, data);
        g_signal_handlers_block_by_func(data->spin_place_angle, on_object_property_changed, data);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_place_x), sel->place_x);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_place_y), sel->place_y);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_place_w), sel->place_w);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_place_h), sel->place_h);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_place_angle), sel->place_angle);
        g_signal_handlers_unblock_by_func(data->spin_place_x, on_object_property_changed, data);
        g_signal_handlers_unblock_by_func(data->spin_place_y, on_object_property_changed, data);
        g_signal_handlers_unblock_by_func(data->spin_place_w, on_object_property_changed, data);
        g_signal_handlers_unblock_by_func(data->spin_place_h, on_object_property_changed, data);
        g_signal_handlers_unblock_by_func(data->spin_place_angle, on_object_property_changed, data);
    } else {
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_x), layer->x);
        gtk_spin_button_set_value(GTK_SPIN_BUTTON(data->spin_y), layer->y);
    }
}

static void on_object_property_changed(GtkSpinButton *spin, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    SelectionRect *sel = canvas_view_get_active_selection(data->canvas_view);
    if (!sel)
        return;

    if (spin == GTK_SPIN_BUTTON(data->spin_place_x))
        sel->place_x = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_place_x));
    else if (spin == GTK_SPIN_BUTTON(data->spin_place_y))
        sel->place_y = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_place_y));
    else if (spin == GTK_SPIN_BUTTON(data->spin_place_w))
        sel->place_w = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_place_w));
    else if (spin == GTK_SPIN_BUTTON(data->spin_place_h))
        sel->place_h = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_place_h));
    else if (spin == GTK_SPIN_BUTTON(data->spin_place_angle))
        sel->place_angle = gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_place_angle));

    if (sel->place_w < 8)
        sel->place_w = 8;
    if (sel->place_h < 8)
        sel->place_h = 8;

    refresh_canvas(data);
}

static void rebuild_layer_list(MainWindowData *data) {
    GtkListBox *list = GTK_LIST_BOX(data->layer_list);
    GtkListBoxRow *row;

    while ((row = gtk_list_box_get_row_at_index(list, 0)) != NULL)
        gtk_widget_destroy(GTK_WIDGET(row));

    guint count = image_project_layer_count(data->project);
    Layer *bg = image_project_find_background_layer(data->project);

    for (guint i = 0; i < count; i++) {
        Layer *layer = image_project_layer_at(data->project, i);
        GtkWidget *row = gtk_list_box_row_new();
        const char *name = layer->filename ? layer->filename : "(unnamed)";
        char *display = NULL;
        if (layer == bg)
            display = g_strdup_printf("[배경] %s", name);
        else if (layer_has_selection(layer))
            display = g_strdup_printf("[선택] %s", name);
        else
            display = g_strdup(name);

        GtkWidget *label = gtk_label_new(display);
        g_free(display);
        gtk_label_set_xalign(GTK_LABEL(label), 0.0);
        gtk_container_add(GTK_CONTAINER(row), label);
        g_object_set_data(G_OBJECT(row), "layer-ptr", layer);
        gtk_list_box_insert(list, row, -1);
    }

    Layer *keep = data->selected_layer;
    GtkListBoxRow *select_row = NULL;

    if (count > 0) {
        for (guint i = 0; i < count; i++) {
            GtkListBoxRow *row = gtk_list_box_get_row_at_index(list, (int)i);
            Layer *layer = (Layer *)g_object_get_data(G_OBJECT(row), "layer-ptr");
            if (layer == keep) {
                select_row = row;
                break;
            }
        }
        if (!select_row)
            select_row = gtk_list_box_get_row_at_index(list, (int)(count - 1));
        if (select_row) {
            gtk_list_box_select_row(list, select_row);
            data->selected_layer =
                (Layer *)g_object_get_data(G_OBJECT(select_row), "layer-ptr");
        }
    } else {
        data->selected_layer = NULL;
    }

    data->last_sel_count =
        data->selected_layer ? layer_selection_count(data->selected_layer) : 0;
    update_property_spins(data);
    canvas_view_set_active_layer(data->canvas_view, data->selected_layer);
    refresh_canvas(data);
}

static void on_layer_selected(GtkListBox *box, GtkListBoxRow *row, gpointer user_data) {
    (void)box;
    MainWindowData *data = (MainWindowData *)user_data;
    if (!row) {
        data->selected_layer = NULL;
    } else {
        data->selected_layer = (Layer *)g_object_get_data(G_OBJECT(row), "layer-ptr");
    }
    update_property_spins(data);
    canvas_view_set_active_layer(data->canvas_view, data->selected_layer);
}

static void on_property_changed(GtkSpinButton *spin, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    if (!data->selected_layer)
        return;

    if (spin == GTK_SPIN_BUTTON(data->spin_x))
        data->selected_layer->x = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_x));
    else if (spin == GTK_SPIN_BUTTON(data->spin_y))
        data->selected_layer->y = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_y));
    else if (spin == GTK_SPIN_BUTTON(data->spin_opacity))
        data->selected_layer->opacity = gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_opacity));

    refresh_canvas(data);
}

static void on_canvas_size_changed(GtkSpinButton *spin, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)spin;

    data->project->canvas_width =
        (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_canvas_w));
    data->project->canvas_height =
        (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(data->spin_canvas_h));

    canvas_view_set_project(data->canvas_view, data->project);
    refresh_canvas(data);
}

static void show_error(GtkWindow *parent, const char *message) {
    GtkWidget *dialog = gtk_message_dialog_new(parent,
                                               GTK_DIALOG_MODAL,
                                               GTK_MESSAGE_ERROR,
                                               GTK_BUTTONS_OK,
                                               "%s", message);
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

static void on_add_images(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    GtkWindow *window = GTK_WINDOW(gtk_widget_get_toplevel(GTK_WIDGET(button)));

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "이미지 추가",
        window,
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL,
        "_열기", GTK_RESPONSE_ACCEPT,
        NULL);

    gtk_file_chooser_set_select_multiple(GTK_FILE_CHOOSER(dialog), TRUE);
    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "이미지");
    gtk_file_filter_add_mime_type(filter, "image/png");
    gtk_file_filter_add_mime_type(filter, "image/jpeg");
    gtk_file_filter_add_mime_type(filter, "image/bmp");
    gtk_file_filter_add_mime_type(filter, "image/gif");
    gtk_file_filter_add_mime_type(filter, "image/webp");
    gtk_file_filter_add_pattern(filter, "*.png");
    gtk_file_filter_add_pattern(filter, "*.jpg");
    gtk_file_filter_add_pattern(filter, "*.jpeg");
    gtk_file_filter_add_pattern(filter, "*.bmp");
    gtk_file_filter_add_pattern(filter, "*.gif");
    gtk_file_filter_add_pattern(filter, "*.webp");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dialog);
        return;
    }

    GSList *files = gtk_file_chooser_get_files(GTK_FILE_CHOOSER(dialog));
    gtk_widget_destroy(dialog);

    for (GSList *node = files; node; node = node->next) {
        GFile *file = (GFile *)node->data;
        char *path = g_file_get_path(file);
        if (!path)
            continue;

        GError *err = NULL;
        if (!image_project_add_layer(data->project, path, &err)) {
            show_error(window, err ? err->message : "이미지를 불러올 수 없습니다.");
            g_clear_error(&err);
        }
        g_free(path);
    }

    g_slist_free_full(files, g_object_unref);
    sync_canvas_to_background(data);
    rebuild_layer_list(data);
}

static void on_clear_selection(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)button;

    if (!data->selected_layer)
        return;

    layer_clear_selections(data->selected_layer);
    data->last_sel_count = 0;
    sync_canvas_to_background(data);
    rebuild_layer_list(data);
}

static void on_remove_layer(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)button;

    if (!data->selected_layer)
        return;

    image_project_remove_layer(data->project, data->selected_layer);
    data->selected_layer = NULL;
    rebuild_layer_list(data);
}

static void on_move_up(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)button;

    if (!data->selected_layer)
        return;

    image_project_move_layer_up(data->project, data->selected_layer);
    rebuild_layer_list(data);
}

static void on_move_down(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    (void)button;

    if (!data->selected_layer)
        return;

    image_project_move_layer_down(data->project, data->selected_layer);
    rebuild_layer_list(data);
}

static void on_export(GtkButton *button, gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    GtkWindow *window = GTK_WINDOW(gtk_widget_get_toplevel(GTK_WIDGET(button)));

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "합성 이미지 저장",
        window,
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL);

    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), "composite.png");

    if (gtk_dialog_run(GTK_DIALOG(dialog)) != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dialog);
        return;
    }

    char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
    gtk_widget_destroy(dialog);

    if (!path)
        return;

    GError *err = NULL;
    if (!composite_save_png(data->project, path, &err)) {
        show_error(window, err ? err->message : "저장에 실패했습니다.");
        g_clear_error(&err);
    }

    g_free(path);
}

static GtkWidget *make_spin_int(int min, int max, int value, GCallback changed, gpointer user_data) {
    GtkAdjustment *adj = gtk_adjustment_new(value, min, max, 1, 10, 0);
    GtkWidget *spin = gtk_spin_button_new(adj, 1, 0);
    if (changed)
        g_signal_connect(spin, "value-changed", changed, user_data);
    return spin;
}

static GtkWidget *make_spin_double(double min, double max, double value, double step,
                                   GCallback changed, gpointer user_data) {
    GtkAdjustment *adj = gtk_adjustment_new(value, min, max, step, step * 10, 0);
    GtkWidget *spin = gtk_spin_button_new(adj, step, 2);
    if (changed)
        g_signal_connect(spin, "value-changed", changed, user_data);
    return spin;
}

static void main_window_data_destroy(gpointer user_data) {
    MainWindowData *data = (MainWindowData *)user_data;
    image_project_free(data->project);
    g_free(data);
}

GtkWidget *main_window_new(GtkApplication *app) {
    MainWindowData *data = g_new0(MainWindowData, 1);
    data->project = image_project_new(800, 600);

    GtkWidget *window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(window), "Image Maker");
    gtk_window_set_default_size(GTK_WINDOW(window), 1000, 700);

    GtkWidget *toolbar = gtk_toolbar_new();
    GtkToolItem *btn_add = gtk_tool_button_new(NULL, "이미지 추가");
    GtkToolItem *btn_remove = gtk_tool_button_new(NULL, "삭제");
    GtkToolItem *btn_up = gtk_tool_button_new(NULL, "위로");
    GtkToolItem *btn_down = gtk_tool_button_new(NULL, "아래로");
    GtkToolItem *btn_clear_sel = gtk_tool_button_new(NULL, "선택 지우기");
    GtkToolItem *btn_export = gtk_tool_button_new(NULL, "PNG 저장");
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_add, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_remove, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), gtk_separator_tool_item_new(), -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_up, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_down, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), gtk_separator_tool_item_new(), -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_clear_sel, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), gtk_separator_tool_item_new(), -1);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), btn_export, -1);

    g_signal_connect(btn_add, "clicked", G_CALLBACK(on_add_images), data);
    g_signal_connect(btn_remove, "clicked", G_CALLBACK(on_remove_layer), data);
    g_signal_connect(btn_up, "clicked", G_CALLBACK(on_move_up), data);
    g_signal_connect(btn_down, "clicked", G_CALLBACK(on_move_down), data);
    g_signal_connect(btn_clear_sel, "clicked", G_CALLBACK(on_clear_selection), data);
    g_signal_connect(btn_export, "clicked", G_CALLBACK(on_export), data);

    data->layer_list = gtk_list_box_new();
    gtk_list_box_set_selection_mode(GTK_LIST_BOX(data->layer_list), GTK_SELECTION_SINGLE);
    g_signal_connect(data->layer_list, "row-selected", G_CALLBACK(on_layer_selected), data);

    GtkWidget *layer_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(layer_scroll),
                                   GTK_POLICY_NEVER,
                                   GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(layer_scroll, 220, -1);
    gtk_container_add(GTK_CONTAINER(layer_scroll), data->layer_list);

    data->canvas_view = canvas_view_new(data->project);
    canvas_view_set_changed_callback(data->canvas_view, on_canvas_selection_changed, data);

    GtkWidget *hint = gtk_label_new(
        "빈 곳 드래그: 객체 추출 · 객체 드래그: 이동 · 모서리: 크기 · 상단 핸들: 회전. "
        "하단에서 위치·크기·각도를 입력할 수 있습니다.");
    gtk_label_set_line_wrap(GTK_LABEL(hint), TRUE);
    gtk_widget_set_margin_start(hint, 8);
    gtk_widget_set_margin_end(hint, 8);

    GtkWidget *paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_pack1(GTK_PANED(paned), layer_scroll, FALSE, FALSE);
    gtk_paned_pack2(GTK_PANED(paned), data->canvas_view, TRUE, FALSE);

    GtkWidget *props = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(props), 8);
    gtk_grid_set_row_spacing(GTK_GRID(props), 4);
    gtk_widget_set_margin_start(props, 8);
    gtk_widget_set_margin_end(props, 8);
    gtk_widget_set_margin_top(props, 4);
    gtk_widget_set_margin_bottom(props, 8);

    data->spin_canvas_w = make_spin_int(1, 8192, data->project->canvas_width,
                                        G_CALLBACK(on_canvas_size_changed), data);
    data->spin_canvas_h = make_spin_int(1, 8192, data->project->canvas_height,
                                        G_CALLBACK(on_canvas_size_changed), data);
    data->spin_x = make_spin_int(-4096, 4096, 0, G_CALLBACK(on_property_changed), data);
    data->spin_y = make_spin_int(-4096, 4096, 0, G_CALLBACK(on_property_changed), data);
    data->spin_opacity = make_spin_double(0.0, 1.0, 1.0, 0.05,
                                          G_CALLBACK(on_property_changed), data);
    data->spin_place_x = make_spin_int(-4096, 8192, 0, G_CALLBACK(on_object_property_changed), data);
    data->spin_place_y = make_spin_int(-4096, 8192, 0, G_CALLBACK(on_object_property_changed), data);
    data->spin_place_w = make_spin_int(8, 8192, 100, G_CALLBACK(on_object_property_changed), data);
    data->spin_place_h = make_spin_int(8, 8192, 100, G_CALLBACK(on_object_property_changed), data);
    data->spin_place_angle = make_spin_double(-180.0, 180.0, 0.0, 1.0,
                                              G_CALLBACK(on_object_property_changed), data);

    gtk_grid_attach(GTK_GRID(props), gtk_label_new("캔버스 너비:"), 0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_canvas_w, 1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("캔버스 높이:"), 2, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_canvas_h, 3, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("레이어 X:"), 0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_x, 1, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("레이어 Y:"), 2, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_y, 3, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("불투명도:"), 0, 2, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_opacity, 1, 2, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("객체 X:"), 0, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_place_x, 1, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("객체 Y:"), 2, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_place_y, 3, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("객체 너비:"), 0, 4, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_place_w, 1, 4, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("객체 높이:"), 2, 4, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_place_h, 3, 4, 1, 1);
    gtk_grid_attach(GTK_GRID(props), gtk_label_new("객체 각도:"), 0, 5, 1, 1);
    gtk_grid_attach(GTK_GRID(props), data->spin_place_angle, 1, 5, 1, 1);

    update_property_spins(data);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), hint, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), paned, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), props, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(window), vbox);

    g_object_set_data_full(G_OBJECT(window), "main-window-data", data,
                           main_window_data_destroy);

    return window;
}
