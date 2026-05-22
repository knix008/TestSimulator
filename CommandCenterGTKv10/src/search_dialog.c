#include "search_dialog.h"

#include "file_ops.h"

typedef struct {
    GtkWidget *dialog;
    GtkWidget *pattern_entry;
    GtkWidget *content_check;
    GtkWidget *content_entry;
    GtkWidget *result_list;
    GtkWidget *status_label;
    GtkWidget *search_btn;
    char *search_root;
    SearchFileSelectedFn callback;
    gpointer user_data;
    SearchContext *ctx;
    guint search_count;
} SearchDialogData;

static void set_status(SearchDialogData *sd, const char *text) {
    gtk_label_set_text(GTK_LABEL(sd->status_label), text);
}

static void on_search_finished(GPtrArray *results, gpointer user_data) {
    SearchDialogData *sd = user_data;
    GtkListStore *store = GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(sd->result_list)));
    gtk_list_store_clear(store);

    for (guint i = 0; i < results->len; i++) {
        GtkTreeIter iter;
        gtk_list_store_append(store, &iter);
        gtk_list_store_set(store, &iter, 0, g_ptr_array_index(results, i), -1);
    }

    char *msg = g_strdup_printf(
        "검색 완료: %u개 발견 (더블클릭으로 해당 폴더 이동)", results->len);
    set_status(sd, msg);
    g_free(msg);
    g_ptr_array_free(results, TRUE);
    gtk_widget_set_sensitive(sd->search_btn, TRUE);
    sd->ctx = NULL;
}

static void on_search_progress(const char *path, gpointer user_data) {
    SearchDialogData *sd = user_data;
    sd->search_count++;
    char *msg = g_strdup_printf("검색 중... %u개 발견 | %s", sd->search_count, path);
    set_status(sd, msg);
    g_free(msg);
}

static void on_content_toggled(GtkToggleButton *btn, gpointer entry) {
    gtk_widget_set_sensitive(GTK_WIDGET(entry),
                           gtk_toggle_button_get_active(btn));
}

static void on_clear_clicked(GtkButton *btn, gpointer user_data) {
    (void)btn;
    SearchDialogData *sd = user_data;
    gtk_list_store_clear(GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(sd->result_list))));
    set_status(sd, "결과가 지워졌습니다.");
}

static void on_search_clicked(GtkButton *btn, gpointer user_data) {
    (void)btn;
    SearchDialogData *sd = user_data;

    if (sd->ctx) {
        file_ops_search_cancel(sd->ctx);
        file_ops_search_free(sd->ctx);
        sd->ctx = NULL;
    }

    const char *pattern = gtk_entry_get_text(GTK_ENTRY(sd->pattern_entry));
    gboolean search_content = gtk_toggle_button_get_active(
        GTK_TOGGLE_BUTTON(sd->content_check));
    const char *content_pat = gtk_entry_get_text(GTK_ENTRY(sd->content_entry));

    gtk_list_store_clear(GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(sd->result_list))));
    gtk_widget_set_sensitive(sd->search_btn, FALSE);
    sd->search_count = 0;
    set_status(sd, "검색 중...");

    sd->ctx = file_ops_search_start(
        sd->search_root,
        pattern && *pattern ? pattern : "*",
        search_content,
        content_pat,
        on_search_progress,
        on_search_finished,
        sd);
}

static void on_result_activated(GtkTreeView *view, GtkTreePath *path,
                                GtkTreeViewColumn *col, gpointer user_data) {
    (void)col;
    SearchDialogData *sd = user_data;
    GtkTreeIter iter;
    GtkTreeModel *model = gtk_tree_view_get_model(view);
    if (!gtk_tree_model_get_iter(model, &iter, path)) return;
    gchar *filepath = NULL;
    gtk_tree_model_get(model, &iter, 0, &filepath, -1);
    if (filepath && sd->callback) {
        sd->callback(filepath, sd->user_data);
        gtk_widget_destroy(sd->dialog);
    }
    g_free(filepath);
}

static void on_dialog_destroy(GtkWidget *w, gpointer user_data) {
    (void)w;
    SearchDialogData *sd = user_data;
    if (sd->ctx) {
        file_ops_search_cancel(sd->ctx);
        file_ops_search_free(sd->ctx);
    }
    g_free(sd->search_root);
    g_free(sd);
}

GtkWidget *search_dialog_new(GtkWindow *parent,
                               const char *search_root,
                               SearchFileSelectedFn callback,
                               gpointer user_data) {
    SearchDialogData *sd = g_new0(SearchDialogData, 1);
    sd->search_root = g_strdup(search_root);
    sd->callback = callback;
    sd->user_data = user_data;

    char *title = g_strdup_printf("파일 검색 — %s", search_root);
    sd->dialog = gtk_dialog_new_with_buttons(
        title, parent, GTK_DIALOG_DESTROY_WITH_PARENT,
        "_닫기", GTK_RESPONSE_CLOSE,
        NULL);
    g_free(title);
    gtk_window_set_default_size(GTK_WINDOW(sd->dialog), 680, 540);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(sd->dialog));
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(vbox), 12);
    gtk_box_pack_start(GTK_BOX(content), vbox, TRUE, TRUE, 0);

    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_row_spacing(GTK_GRID(grid), 6);

    gtk_grid_attach(GTK_GRID(grid), gtk_label_new("파일 이름:"), 0, 0, 1, 1);
    sd->pattern_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(sd->pattern_entry), "*");
    gtk_grid_attach(GTK_GRID(grid), sd->pattern_entry, 1, 0, 1, 1);

    sd->content_check = gtk_check_button_new_with_label("내용 검색:");
    gtk_grid_attach(GTK_GRID(grid), sd->content_check, 0, 1, 1, 1);
    sd->content_entry = gtk_entry_new();
    gtk_widget_set_sensitive(sd->content_entry, FALSE);
    g_signal_connect(sd->content_check, "toggled",
                     G_CALLBACK(on_content_toggled), sd->content_entry);
    gtk_grid_attach(GTK_GRID(grid), sd->content_entry, 1, 1, 1, 1);
    gtk_box_pack_start(GTK_BOX(vbox), grid, FALSE, FALSE, 0);

    GtkWidget *btn_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    sd->search_btn = gtk_button_new_with_label("검색 시작");
    gtk_box_pack_start(GTK_BOX(btn_box), sd->search_btn, FALSE, FALSE, 0);
    GtkWidget *clear_btn = gtk_button_new_with_label("결과 지우기");
    gtk_box_pack_start(GTK_BOX(btn_box), clear_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), btn_box, FALSE, FALSE, 0);

    g_signal_connect(sd->search_btn, "clicked", G_CALLBACK(on_search_clicked), sd);
    g_signal_connect(clear_btn, "clicked", G_CALLBACK(on_clear_clicked), sd);

    GtkListStore *store = gtk_list_store_new(1, G_TYPE_STRING);
    sd->result_list = gtk_tree_view_new_with_model(GTK_TREE_MODEL(store));
    g_object_unref(store);
    GtkCellRenderer *renderer = gtk_cell_renderer_text_new();
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(sd->result_list),
        -1, "경로", renderer, "text", 0, NULL);
    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);
    gtk_container_add(GTK_CONTAINER(scroll), sd->result_list);
    gtk_box_pack_start(GTK_BOX(vbox), scroll, TRUE, TRUE, 0);

    sd->status_label = gtk_label_new("검색할 파일 이름 패턴을 입력하세요. (예: *.txt)");
    gtk_widget_set_halign(sd->status_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(vbox), sd->status_label, FALSE, FALSE, 0);

    g_signal_connect(sd->result_list, "row-activated",
                     G_CALLBACK(on_result_activated), sd);
    g_signal_connect(sd->dialog, "destroy", G_CALLBACK(on_dialog_destroy), sd);

    gtk_widget_show_all(sd->dialog);
    return sd->dialog;
}
