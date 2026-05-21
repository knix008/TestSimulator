#include "file_pane.h"
#include "profile.h"

#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

enum {
    COL_ICON,
    COL_NAME,
    COL_PERM,
    COL_DATE,
    COL_SIZE,
    COL_PATH,
    COL_IS_DIR,
    COL_IS_PARENT,
    NUM_COLS
};

struct _FilePane {
    GtkBox       parent;
    FilePaneKind kind;
    GtkWidget   *label;
    GtkWidget   *refresh_btn;
    GtkWidget   *tree_view;
    GtkListStore *store;
    GdkPixbuf   *icon_folder;
    GdkPixbuf   *icon_file;
    GdkPixbuf   *icon_parent;
    gchar       *local_home;
    gchar       *current_path;
    gboolean     loading;
    gboolean     columns_ready;
};

G_DEFINE_TYPE(FilePane, file_pane, GTK_TYPE_BOX)

static GdkPixbuf *col_icon(FilePane *pane, gboolean is_dir, gboolean is_parent) {
    if (is_parent && pane->icon_parent) return pane->icon_parent;
    if (is_dir && pane->icon_folder) return pane->icon_folder;
    return pane->icon_file;
}

static GtkTreeViewColumn *append_resizable_column(GtkTreeView *tv,
                                                  GtkCellRenderer *renderer,
                                                  const gchar *title,
                                                  gint model_column,
                                                  gboolean expand,
                                                  gint min_width,
                                                  gint start_width) {
    GtkTreeViewColumn *col = gtk_tree_view_column_new_with_attributes(
        title, renderer, "text", model_column, NULL);

    gtk_tree_view_column_set_resizable(col, TRUE);
    gtk_tree_view_column_set_reorderable(col, FALSE);
    gtk_tree_view_column_set_min_width(col, min_width);
    gtk_tree_view_column_set_fixed_width(col, start_width);

    gtk_tree_view_column_set_sizing(col, GTK_TREE_VIEW_COLUMN_FIXED);
    if (expand)
        gtk_tree_view_column_set_expand(col, TRUE);

    gtk_tree_view_append_column(tv, col);
    return col;
}

static void setup_columns(FilePane *pane, GtkTreeView *tv) {
    (void)pane;

    GtkCellRenderer *pix = gtk_cell_renderer_pixbuf_new();
    GtkTreeViewColumn *col_icon = gtk_tree_view_column_new_with_attributes(
        "", pix, "pixbuf", COL_ICON, NULL);
    gtk_tree_view_column_set_resizable(col_icon, FALSE);
    gtk_tree_view_column_set_sizing(col_icon, GTK_TREE_VIEW_COLUMN_FIXED);
    gtk_tree_view_column_set_fixed_width(col_icon, 24);
    gtk_tree_view_append_column(tv, col_icon);

    /* Icon(24) + Name(expand) + Perm(82) + Date(110) + Size(72) = 288 + expand */
    GtkCellRenderer *txt_name = gtk_cell_renderer_text_new();
    g_object_set(G_OBJECT(txt_name), "ellipsize", PANGO_ELLIPSIZE_END, NULL);
    append_resizable_column(tv, txt_name, "이름", COL_NAME, TRUE, 60, 140);

    GtkCellRenderer *txt_perm = gtk_cell_renderer_text_new();
    append_resizable_column(tv, txt_perm, "권한", COL_PERM, FALSE, 50, 82);

    GtkCellRenderer *txt_date = gtk_cell_renderer_text_new();
    append_resizable_column(tv, txt_date, "수정일", COL_DATE, FALSE, 64, 110);

    GtkCellRenderer *txt_size = gtk_cell_renderer_text_new();
    g_object_set(G_OBJECT(txt_size), "xalign", 1.0f, NULL);
    GtkTreeViewColumn *col_size = append_resizable_column(
        tv, txt_size, "크기", COL_SIZE, FALSE, 44, 72);
    gtk_tree_view_column_set_alignment(col_size, 1.0f);
}

static FilePane *file_pane_create(FilePaneKind kind) {
    FilePane *pane = g_object_new(FILE_PANE_TYPE, NULL);
    pane->kind = kind;
    return pane;
}

FilePane *file_pane_new_local(void)  { return file_pane_create(FILE_PANE_LOCAL); }
FilePane *file_pane_new_server(void) { return file_pane_create(FILE_PANE_SERVER); }

static void file_pane_init(FilePane *self) {
    gtk_orientable_set_orientation(GTK_ORIENTABLE(self), GTK_ORIENTATION_VERTICAL);
    gtk_box_set_spacing(GTK_BOX(self), 2);

    /* Header row: path label (left) + refresh button (right) */
    GtkWidget *header = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start(header, 4);
    gtk_widget_set_margin_end(header, 2);
    gtk_widget_set_margin_top(header, 2);
    gtk_widget_set_margin_bottom(header, 2);

    self->label = gtk_label_new("");
    gtk_label_set_xalign(GTK_LABEL(self->label), 0.0f);
    gtk_widget_set_hexpand(self->label, TRUE);
    gtk_box_pack_start(GTK_BOX(header), self->label, TRUE, TRUE, 0);

    self->refresh_btn = gtk_button_new_from_icon_name("view-refresh",
                                                       GTK_ICON_SIZE_SMALL_TOOLBAR);
    gtk_widget_set_tooltip_text(self->refresh_btn, "새로 고침 (F5)");
    gtk_button_set_relief(GTK_BUTTON(self->refresh_btn), GTK_RELIEF_NONE);
    gtk_box_pack_end(GTK_BOX(header), self->refresh_btn, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(self), header, FALSE, FALSE, 0);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                 GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);

    self->tree_view = gtk_tree_view_new();
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(self->tree_view), TRUE);
    gtk_tree_view_set_headers_clickable(GTK_TREE_VIEW(self->tree_view), FALSE);
    gtk_tree_view_set_grid_lines(GTK_TREE_VIEW(self->tree_view),
                                 GTK_TREE_VIEW_GRID_LINES_HORIZONTAL);
    gtk_tree_selection_set_mode(gtk_tree_view_get_selection(GTK_TREE_VIEW(self->tree_view)),
                                GTK_SELECTION_SINGLE);

    gtk_container_add(GTK_CONTAINER(scroll), self->tree_view);
    gtk_box_pack_start(GTK_BOX(self), scroll, TRUE, TRUE, 0);

    setup_columns(self, GTK_TREE_VIEW(self->tree_view));
    self->columns_ready = TRUE;
}

static void file_pane_dispose(GObject *obj) {
    FilePane *pane = FILE_PANE(obj);
    g_free(pane->local_home);
    g_free(pane->current_path);
    pane->local_home = NULL;
    pane->current_path = NULL;
    G_OBJECT_CLASS(file_pane_parent_class)->dispose(obj);
}

static void file_pane_class_init(FilePaneClass *klass) {
    GObjectClass *obj = G_OBJECT_CLASS(klass);
    obj->dispose = file_pane_dispose;
}

GtkWidget *file_pane_get_widget(FilePane *pane)          { return GTK_WIDGET(pane); }
GtkWidget *file_pane_get_tree_view(FilePane *pane)       { return pane->tree_view; }
GtkWidget *file_pane_get_label(FilePane *pane)           { return pane->label; }
GtkWidget *file_pane_get_refresh_button(FilePane *pane)  { return pane->refresh_btn; }

void file_pane_set_icons(FilePane *pane,
                         GdkPixbuf *folder,
                         GdkPixbuf *file_icon,
                         GdkPixbuf *parent_icon) {
    if (pane->icon_folder) g_object_unref(pane->icon_folder);
    if (pane->icon_file) g_object_unref(pane->icon_file);
    if (pane->icon_parent) g_object_unref(pane->icon_parent);
    pane->icon_folder = folder ? g_object_ref(folder) : NULL;
    pane->icon_file   = file_icon ? g_object_ref(file_icon) : NULL;
    pane->icon_parent = parent_icon ? g_object_ref(parent_icon) : NULL;
}

void file_pane_set_path_label(FilePane *pane, const gchar *path_text) {
    const gchar *title = pane->kind == FILE_PANE_SERVER ? "서버 (Server)" : "로컬 (Local)";
    gchar *markup;
    if (path_text && path_text[0]) {
        gchar *escaped = g_markup_escape_text(path_text, -1);
        markup = g_strdup_printf("<b>%s</b>  │  <small>%s</small>", title, escaped);
        g_free(escaped);
    } else {
        markup = g_strdup_printf("<b>%s</b>", title);
    }
    gtk_label_set_markup(GTK_LABEL(pane->label), markup);
    g_free(markup);
}

static void clear_list_model(FilePane *pane) {
    gtk_tree_view_set_model(GTK_TREE_VIEW(pane->tree_view), NULL);
    g_clear_object(&pane->store);
}

void file_pane_clear(FilePane *pane) {
    clear_list_model(pane);
}

const gchar *file_pane_get_local_home(FilePane *pane) {
    return pane->local_home;
}

const gchar *file_pane_get_local_directory(FilePane *pane) {
    return pane->kind == FILE_PANE_LOCAL ? pane->current_path : NULL;
}

const gchar *file_pane_get_current_path(FilePane *pane) {
    return pane->current_path;
}

gboolean file_pane_is_local_loading(FilePane *pane) {
    return pane->loading;
}

static int compare_entries(gconstpointer a, gconstpointer b) {
    const FtpDirEntry *ea = a;
    const FtpDirEntry *eb = b;
    if (ea->is_dir != eb->is_dir) return ea->is_dir ? -1 : 1;
    return g_ascii_strcasecmp(ea->name, eb->name);
}

static void append_entry_row(FilePane *pane, const FtpDirEntry *e) {
    GtkTreeIter iter;
    gtk_list_store_append(pane->store, &iter);
    gtk_list_store_set(pane->store, &iter,
        COL_ICON, col_icon(pane, e->is_dir, e->is_parent),
        COL_NAME, e->name,
        COL_PERM, e->perm,
        COL_DATE, e->date,
        COL_SIZE, e->size_text,
        COL_PATH, e->path,
        COL_IS_DIR, e->is_dir,
        COL_IS_PARENT, e->is_parent, -1);
}

static void append_parent_row(FilePane *pane, const gchar *parent_path) {
    FtpDirEntry e;
    memset(&e, 0, sizeof e);
    g_strlcpy(e.name, "[..]", FTP_MAX_NAME);
    g_strlcpy(e.path, parent_path, FTP_MAX_PATH);
    g_strlcpy(e.perm, "-", FTP_MAX_PERM);
    g_strlcpy(e.date, "-", FTP_MAX_DATE);
    g_strlcpy(e.size_text, "-", FTP_MAX_SIZE);
    e.is_dir = TRUE;
    e.is_parent = TRUE;
    append_entry_row(pane, &e);
}

static void populate_list(FilePane *pane,
                          GPtrArray *entries,
                          const gchar *cwd,
                          const gchar *parent_path) {
    pane->loading = TRUE;
    clear_list_model(pane);

    g_free(pane->current_path);
    pane->current_path = cwd ? g_strdup(cwd) : NULL;

    pane->store = gtk_list_store_new(NUM_COLS,
        GDK_TYPE_PIXBUF, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_STRING,
        G_TYPE_STRING, G_TYPE_STRING, G_TYPE_BOOLEAN, G_TYPE_BOOLEAN);
    gtk_tree_view_set_model(GTK_TREE_VIEW(pane->tree_view), GTK_TREE_MODEL(pane->store));

    if (parent_path && parent_path[0])
        append_parent_row(pane, parent_path);

    GPtrArray *sorted = g_ptr_array_new();
    for (guint i = 0; i < entries->len; i++)
        g_ptr_array_add(sorted, g_ptr_array_index(entries, i));
    g_ptr_array_sort(sorted, compare_entries);

    for (guint i = 0; i < sorted->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(sorted, i);
        if (!e->perm[0])
            g_strlcpy(e->perm, e->is_dir ? "drwxr-xr-x" : "-rw-r--r--", FTP_MAX_PERM);
        if (!e->date[0])
            g_strlcpy(e->date, "-", FTP_MAX_DATE);
        if (!e->size_text[0])
            g_strlcpy(e->size_text, e->is_dir ? "-" : "0", FTP_MAX_SIZE);
        append_entry_row(pane, e);
    }
    g_ptr_array_free(sorted, TRUE);

    file_pane_set_path_label(pane, cwd);
    pane->loading = FALSE;
}

void file_pane_populate_listing(FilePane *pane,
                                GPtrArray *entries,
                                const gchar *cwd,
                                const gchar *parent_path) {
    populate_list(pane, entries, cwd, parent_path);
}

static gchar *local_parent_path(const gchar *dir);

void file_pane_populate_flat(FilePane *pane, GPtrArray *entries, const gchar *cwd) {
    gchar *parent = local_parent_path(cwd);
    populate_list(pane, entries, cwd, parent);
    g_free(parent);
}

void file_pane_init_local_home(FilePane *pane, const gchar *home_dir) {
    g_free(pane->local_home);
    pane->local_home = g_canonicalize_filename(home_dir, NULL);
    if (!pane->local_home)
        pane->local_home = g_strdup(ftp_home_directory());
}

static gchar *local_parent_path(const gchar *dir) {
    if (!dir || g_strcmp0(dir, "/") == 0)
        return NULL;

    gchar *parent = g_path_get_dirname(dir);
    if (!parent || parent[0] == '\0' || g_strcmp0(parent, dir) == 0) {
        g_free(parent);
        return g_strdup("/");
    }
    return parent;
}

static void mode_to_perm(mode_t mode, gchar *out, gsize n) {
    gchar t = '-';
    if (S_ISDIR(mode)) t = 'd';
    else if (S_ISLNK(mode)) t = 'l';
    g_snprintf(out, n, "%c%c%c%c%c%c%c%c%c%c",
        t,
        (mode & S_IRUSR) ? 'r' : '-', (mode & S_IWUSR) ? 'w' : '-', (mode & S_IXUSR) ? 'x' : '-',
        (mode & S_IRGRP) ? 'r' : '-', (mode & S_IWGRP) ? 'w' : '-', (mode & S_IXGRP) ? 'x' : '-',
        (mode & S_IROTH) ? 'r' : '-', (mode & S_IWOTH) ? 'w' : '-', (mode & S_IXOTH) ? 'x' : '-');
}

static void format_mtime(time_t mtime, gchar *out, gsize n) {
    struct tm tm;
    if (!localtime_r(&mtime, &tm)) {
        g_strlcpy(out, "-", n);
        return;
    }
    strftime(out, (size_t)n, "%Y-%m-%d %H:%M", &tm);
}

static void format_size_local(gint64 bytes, gboolean is_dir, gchar *out, gsize n) {
    if (is_dir) { g_strlcpy(out, "-", n); return; }
    if (bytes < 1024)
        g_snprintf(out, n, "%lld", (long long)bytes);
    else if (bytes < 1024 * 1024)
        g_snprintf(out, n, "%.1f KB", bytes / 1024.0);
    else if (bytes < 1024LL * 1024 * 1024)
        g_snprintf(out, n, "%.1f MB", bytes / (1024.0 * 1024.0));
    else
        g_snprintf(out, n, "%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
}

static FtpDirEntry *entry_from_local_path(const gchar *full, const gchar *name, gboolean is_dir) {
    FtpDirEntry *e = g_new0(FtpDirEntry, 1);
    g_strlcpy(e->name, name, FTP_MAX_NAME);
    g_strlcpy(e->path, full, FTP_MAX_PATH);
    e->is_dir = is_dir;

    struct stat st;
    if (stat(full, &st) == 0) {
        mode_to_perm(st.st_mode, e->perm, FTP_MAX_PERM);
        format_mtime(st.st_mtime, e->date, FTP_MAX_DATE);
        format_size_local((gint64)st.st_size, is_dir, e->size_text, FTP_MAX_SIZE);
        e->size_bytes = (gint64)st.st_size;
    } else {
        g_strlcpy(e->perm, is_dir ? "drwxr-xr-x" : "-rw-r--r--", FTP_MAX_PERM);
        g_strlcpy(e->date, "-", FTP_MAX_DATE);
        format_size_local(0, is_dir, e->size_text, FTP_MAX_SIZE);
    }
    return e;
}

void file_pane_show_local_directory(FilePane *pane, const gchar *dir_path) {
    if (!pane->local_home) return;

    gchar norm[FTP_MAX_PATH];
    ftp_normalize_local_path(dir_path, norm, sizeof norm);

    GPtrArray *entries = g_ptr_array_new_with_free_func((GDestroyNotify)g_free);
    gchar *parent = local_parent_path(norm);

    GDir *dir = g_dir_open(norm, 0, NULL);
    if (dir) {
        GPtrArray *dirs = g_ptr_array_new_with_free_func(g_free);
        GPtrArray *files = g_ptr_array_new_with_free_func(g_free);
        const gchar *name;

        while ((name = g_dir_read_name(dir)) != NULL) {
            if (name[0] == '.') continue;
            gchar *full = g_build_filename(norm, name, NULL);
            if (g_file_test(full, G_FILE_TEST_IS_DIR))
                g_ptr_array_add(dirs, full);
            else
                g_ptr_array_add(files, full);
        }
        g_dir_close(dir);

        g_ptr_array_sort(dirs, (GCompareFunc)g_strcmp0);
        g_ptr_array_sort(files, (GCompareFunc)g_strcmp0);

        for (guint i = 0; i < dirs->len; i++) {
            gchar *full = g_ptr_array_index(dirs, i);
            gchar *base = g_path_get_basename(full);
            FtpDirEntry *e = entry_from_local_path(full, base, TRUE);
            g_ptr_array_add(entries, e);
            g_free(base);
        }
        for (guint i = 0; i < files->len; i++) {
            gchar *full = g_ptr_array_index(files, i);
            gchar *base = g_path_get_basename(full);
            FtpDirEntry *e = entry_from_local_path(full, base, FALSE);
            g_ptr_array_add(entries, e);
            g_free(base);
        }

        g_ptr_array_unref(dirs);
        g_ptr_array_unref(files);
    }

    populate_list(pane, entries, norm, parent);
    g_ptr_array_unref(entries);
    g_free(parent);
}

void file_pane_refresh_local_directory(FilePane *pane) {
    if (pane->current_path)
        file_pane_show_local_directory(pane, pane->current_path);
}

gboolean file_pane_get_selected(FilePane *pane,
                                gchar *path_out,
                                gsize path_size,
                                gboolean *is_dir_out,
                                gboolean *is_parent_out) {
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pane->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;

    if (!gtk_tree_selection_get_selected(sel, &model, &iter))
        return FALSE;

    gchar *path = NULL;
    gboolean is_dir = FALSE, is_parent = FALSE;
    gtk_tree_model_get(model, &iter,
        COL_PATH, &path, COL_IS_DIR, &is_dir, COL_IS_PARENT, &is_parent, -1);

    if (!path || !path[0]) {
        g_free(path);
        return FALSE;
    }

    g_strlcpy(path_out, path, path_size);
    if (is_dir_out) *is_dir_out = is_dir;
    if (is_parent_out) *is_parent_out = is_parent;
    g_free(path);
    return TRUE;
}
