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
    COL_SIZE,       /* display string */
    COL_PATH,
    COL_IS_DIR,
    COL_IS_PARENT,
    COL_SIZE_BYTES, /* hidden int64 for numeric sort */
    NUM_COLS
};

struct _FilePane {
    GtkBox        parent;
    FilePaneKind  kind;
    GtkWidget    *label;
    GtkWidget    *refresh_btn;
    GtkWidget    *tree_view;
    GtkListStore *store;
    GdkPixbuf    *icon_folder;
    GdkPixbuf    *icon_file;
    GdkPixbuf    *icon_parent;
    gchar        *local_home;
    gchar        *current_path;
    gboolean      loading;
    gboolean      columns_ready;
    gint          sort_column;  /* persists across directory changes */
    GtkSortType   sort_order;
    GtkTreePath  *selection_anchor; /* Shift+click range start (GTK3 has no EXTENDED) */
};

G_DEFINE_TYPE(FilePane, file_pane, GTK_TYPE_BOX)

static gboolean file_pane_on_button_press(GtkWidget *widget, GdkEventButton *event,
                                          gpointer user_data);
static void file_pane_clear_anchor(FilePane *pane);

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

    /* FIXED sizing for all columns; expand=TRUE on the name column lets it
       fill remaining space without GROW_ONLY's zero-start problem. */
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

    /* Target: all columns fit within ~250 px so headers never require
       horizontal scrolling even on a narrow pane.
       Fixed total: icon(20)+perm(60)+date(80)+size(55) = 215 px
       Name expands with min=40, so minimum total = 255 px.           */

    /* icon(20)+name+perm(72)+date(100)+size(65) = 257+name_min(80) = 337 px total.
       Normal pane widths (>400 px) show all columns without horizontal scroll. */

    /* Name — expands to fill space; GROW_ONLY so it never shrinks below 80 px */
    GtkCellRenderer *txt_name = gtk_cell_renderer_text_new();
    g_object_set(G_OBJECT(txt_name), "ellipsize", PANGO_ELLIPSIZE_END, NULL);
    GtkTreeViewColumn *col_name = append_resizable_column(
        tv, txt_name, "이름", COL_NAME, TRUE, 80, 130);
    gtk_tree_view_column_set_sort_column_id(col_name, COL_NAME);

    /* Perm — fixed */
    GtkCellRenderer *txt_perm = gtk_cell_renderer_text_new();
    append_resizable_column(tv, txt_perm, "권한", COL_PERM, FALSE, 48, 72);

    /* Date — fixed, sortable */
    GtkCellRenderer *txt_date = gtk_cell_renderer_text_new();
    GtkTreeViewColumn *col_date = append_resizable_column(
        tv, txt_date, "수정일", COL_DATE, FALSE, 60, 100);
    gtk_tree_view_column_set_sort_column_id(col_date, COL_DATE);

    /* Size — fixed, sortable by COL_SIZE_BYTES (right-aligned) */
    GtkCellRenderer *txt_size = gtk_cell_renderer_text_new();
    g_object_set(G_OBJECT(txt_size), "xalign", 1.0f, NULL);
    GtkTreeViewColumn *col_size = append_resizable_column(
        tv, txt_size, "크기", COL_SIZE, FALSE, 48, 65);
    gtk_tree_view_column_set_alignment(col_size, 1.0f);
    gtk_tree_view_column_set_sort_column_id(col_size, COL_SIZE_BYTES);
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

    self->sort_column = COL_NAME;
    self->sort_order  = GTK_SORT_ASCENDING;

    self->tree_view = gtk_tree_view_new();
    gtk_tree_view_set_headers_visible  (GTK_TREE_VIEW(self->tree_view), TRUE);
    gtk_tree_view_set_headers_clickable(GTK_TREE_VIEW(self->tree_view), TRUE);
    gtk_tree_view_set_grid_lines(GTK_TREE_VIEW(self->tree_view),
                                 GTK_TREE_VIEW_GRID_LINES_HORIZONTAL);
    gtk_tree_selection_set_mode(gtk_tree_view_get_selection(GTK_TREE_VIEW(self->tree_view)),
                                GTK_SELECTION_MULTIPLE);
    gtk_tree_view_set_rubber_banding(GTK_TREE_VIEW(self->tree_view), TRUE);
    gtk_widget_add_events(self->tree_view, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(self->tree_view, "button-press-event",
                     G_CALLBACK(file_pane_on_button_press), self);

    gtk_container_add(GTK_CONTAINER(scroll), self->tree_view);
    gtk_box_pack_start(GTK_BOX(self), scroll, TRUE, TRUE, 0);

    setup_columns(self, GTK_TREE_VIEW(self->tree_view));
    self->columns_ready = TRUE;

    /* Attach an empty model immediately so column headers are always visible,
       even before any directory listing is loaded. */
    self->store = gtk_list_store_new(NUM_COLS,
        GDK_TYPE_PIXBUF, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_STRING,
        G_TYPE_STRING, G_TYPE_STRING, G_TYPE_BOOLEAN, G_TYPE_BOOLEAN,
        G_TYPE_INT64);
    gtk_tree_view_set_model(GTK_TREE_VIEW(self->tree_view),
                            GTK_TREE_MODEL(self->store));
}

static gboolean file_pane_on_button_press(GtkWidget *widget, GdkEventButton *event,
                                          gpointer user_data) {
    FilePane *pane = FILE_PANE(user_data);
    GtkTreeView *tv = GTK_TREE_VIEW(widget);

    if (event->button != 1)
        return FALSE;

    /* Single-click handler eats the first press; emit row-activated ourselves */
    if (event->type == GDK_2BUTTON_PRESS) {
        GtkTreePath *path = NULL;
        GtkTreeViewColumn *col = NULL;
        if (!gtk_tree_view_get_path_at_pos(tv, (gint)event->x, (gint)event->y,
                                           &path, &col, NULL, NULL))
            return FALSE;

        GtkTreeSelection *sel = gtk_tree_view_get_selection(tv);
        gtk_tree_selection_unselect_all(sel);
        gtk_tree_selection_select_path(sel, path);
        if (pane->selection_anchor)
            gtk_tree_path_free(pane->selection_anchor);
        pane->selection_anchor = gtk_tree_path_copy(path);

        g_signal_emit_by_name(tv, "row-activated", path, col);
        gtk_tree_path_free(path);
        return TRUE;
    }

    if (event->type != GDK_BUTTON_PRESS)
        return FALSE;

    GtkTreePath *path = NULL;
    if (!gtk_tree_view_get_path_at_pos(tv, (gint)event->x, (gint)event->y,
                                       &path, NULL, NULL, NULL))
        return FALSE;

    GtkTreeSelection *sel = gtk_tree_view_get_selection(tv);
    GdkModifierType mods = event->state & gtk_accelerator_get_default_mod_mask();

    if (mods & GDK_SHIFT_MASK) {
        if (pane->selection_anchor)
            gtk_tree_selection_select_range(sel, pane->selection_anchor, path);
        else
            gtk_tree_selection_select_path(sel, path);
        gtk_tree_path_free(path);
        return TRUE;
    }

    if (mods & GDK_CONTROL_MASK) {
        if (gtk_tree_selection_path_is_selected(sel, path))
            gtk_tree_selection_unselect_path(sel, path);
        else
            gtk_tree_selection_select_path(sel, path);
        gtk_tree_path_free(path);
        return TRUE;
    }

    gtk_tree_selection_unselect_all(sel);
    gtk_tree_selection_select_path(sel, path);
    if (pane->selection_anchor)
        gtk_tree_path_free(pane->selection_anchor);
    pane->selection_anchor = gtk_tree_path_copy(path);
    gtk_tree_path_free(path);
    return TRUE;
}

static void file_pane_clear_anchor(FilePane *pane) {
    if (pane->selection_anchor) {
        gtk_tree_path_free(pane->selection_anchor);
        pane->selection_anchor = NULL;
    }
}

static void file_pane_dispose(GObject *obj) {
    FilePane *pane = FILE_PANE(obj);
    file_pane_clear_anchor(pane);
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
    file_pane_clear_anchor(pane);
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

/* ── column sort helpers ─────────────────────────────────────────────── */

/* When sort order is descending GTK negates the comparison result.
   To keep [..] and directories always at the top regardless of order we
   multiply the priority portion by `sign` so GTK's negation cancels out. */
static gint sort_sign(GtkTreeModel *m) {
    gint col; GtkSortType order = GTK_SORT_ASCENDING;
    gtk_tree_sortable_get_sort_column_id(GTK_TREE_SORTABLE(m), &col, &order);
    return (order == GTK_SORT_ASCENDING) ? 1 : -1;
}

static gint sort_priority(GtkTreeModel *m, GtkTreeIter *a, GtkTreeIter *b,
                           gboolean *skip_out) {
    gboolean ap, bp, ad, bd;
    gtk_tree_model_get(m, a, COL_IS_PARENT, &ap, COL_IS_DIR, &ad, -1);
    gtk_tree_model_get(m, b, COL_IS_PARENT, &bp, COL_IS_DIR, &bd, -1);
    *skip_out = FALSE;
    const gint s = sort_sign(m);
    if (ap && bp) { *skip_out = TRUE; return 0; }
    if (ap)       { *skip_out = TRUE; return s * -1; }
    if (bp)       { *skip_out = TRUE; return s * 1; }
    if (ad != bd) { *skip_out = TRUE; return s * (ad ? -1 : 1); }
    return 0;
}

static gint sort_by_name(GtkTreeModel *m, GtkTreeIter *a, GtkTreeIter *b,
                          gpointer ud) {
    (void)ud;
    gboolean skip; gint r = sort_priority(m, a, b, &skip);
    if (skip) return r;
    gchar *an = NULL, *bn = NULL;
    gtk_tree_model_get(m, a, COL_NAME, &an, -1);
    gtk_tree_model_get(m, b, COL_NAME, &bn, -1);
    r = g_ascii_strcasecmp(an ? an : "", bn ? bn : "");
    g_free(an); g_free(bn);
    return r;
}

static gint sort_by_date(GtkTreeModel *m, GtkTreeIter *a, GtkTreeIter *b,
                          gpointer ud) {
    (void)ud;
    gboolean skip; gint r = sort_priority(m, a, b, &skip);
    if (skip) return r;
    gchar *ad = NULL, *bd = NULL;
    gtk_tree_model_get(m, a, COL_DATE, &ad, -1);
    gtk_tree_model_get(m, b, COL_DATE, &bd, -1);
    r = g_strcmp0(ad ? ad : "", bd ? bd : "");
    g_free(ad); g_free(bd);
    return r;
}

static gint sort_by_size(GtkTreeModel *m, GtkTreeIter *a, GtkTreeIter *b,
                          gpointer ud) {
    (void)ud;
    gboolean skip; gint r = sort_priority(m, a, b, &skip);
    if (skip) return r;
    gint64 as = 0, bs = 0;
    gtk_tree_model_get(m, a, COL_SIZE_BYTES, &as, -1);
    gtk_tree_model_get(m, b, COL_SIZE_BYTES, &bs, -1);
    return (as < bs) ? -1 : (as > bs) ? 1 : 0;
}

static void on_sort_changed(GtkTreeSortable *sortable, FilePane *pane) {
    gint col; GtkSortType order;
    if (gtk_tree_sortable_get_sort_column_id(sortable, &col, &order)) {
        pane->sort_column = col;
        pane->sort_order  = order;
    }
}

static void append_entry_row(FilePane *pane, const FtpDirEntry *e) {
    GtkTreeIter iter;
    gtk_list_store_append(pane->store, &iter);
    gtk_list_store_set(pane->store, &iter,
        COL_ICON,       col_icon(pane, e->is_dir, e->is_parent),
        COL_NAME,       e->name,
        COL_PERM,       e->perm,
        COL_DATE,       e->date,
        COL_SIZE,       e->size_text,
        COL_PATH,       e->path,
        COL_IS_DIR,     e->is_dir,
        COL_IS_PARENT,  e->is_parent,
        COL_SIZE_BYTES, (gint64)e->size_bytes,
        -1);
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
        G_TYPE_STRING, G_TYPE_STRING, G_TYPE_BOOLEAN, G_TYPE_BOOLEAN,
        G_TYPE_INT64);

    /* Register sort functions before inserting rows for O(n) insertions. */
    gtk_tree_sortable_set_sort_func(GTK_TREE_SORTABLE(pane->store),
                                    COL_NAME,       sort_by_name, NULL, NULL);
    gtk_tree_sortable_set_sort_func(GTK_TREE_SORTABLE(pane->store),
                                    COL_DATE,       sort_by_date, NULL, NULL);
    gtk_tree_sortable_set_sort_func(GTK_TREE_SORTABLE(pane->store),
                                    COL_SIZE_BYTES, sort_by_size, NULL, NULL);
    g_signal_connect(pane->store, "sort-column-changed",
                     G_CALLBACK(on_sort_changed), pane);

    gtk_tree_view_set_model(GTK_TREE_VIEW(pane->tree_view), GTK_TREE_MODEL(pane->store));

    if (parent_path && parent_path[0])
        append_parent_row(pane, parent_path);

    for (guint i = 0; i < entries->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(entries, i);
        if (!e->perm[0])
            g_strlcpy(e->perm, e->is_dir ? "drwxr-xr-x" : "-rw-r--r--", FTP_MAX_PERM);
        if (!e->date[0])
            g_strlcpy(e->date, "-", FTP_MAX_DATE);
        if (!e->size_text[0])
            g_strlcpy(e->size_text, e->is_dir ? "-" : "0", FTP_MAX_SIZE);
        append_entry_row(pane, e);
    }

    /* Apply sort (one pass after all insertions = O(n log n) total) */
    gtk_tree_sortable_set_sort_column_id(GTK_TREE_SORTABLE(pane->store),
                                         pane->sort_column, pane->sort_order);

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

gboolean file_pane_entry_at_path(FilePane *pane,
                                 GtkTreePath *tree_path,
                                 gchar *path_out,
                                 gsize path_size,
                                 gboolean *is_dir_out,
                                 gboolean *is_parent_out) {
    GtkTreeModel *model = gtk_tree_view_get_model(GTK_TREE_VIEW(pane->tree_view));
    if (!model || !tree_path) return FALSE;

    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(model, &iter, tree_path)) return FALSE;

    gchar *path = NULL;
    gboolean is_dir = FALSE, is_parent = FALSE;
    gtk_tree_model_get(model, &iter,
        COL_PATH, &path, COL_IS_DIR, &is_dir, COL_IS_PARENT, &is_parent, -1);

    if (!path || !path[0]) { g_free(path); return FALSE; }

    g_strlcpy(path_out, path, path_size);
    if (is_dir_out)    *is_dir_out    = is_dir;
    if (is_parent_out) *is_parent_out = is_parent;
    g_free(path);
    return TRUE;
}

gboolean file_pane_get_selected(FilePane *pane,
                                gchar *path_out,
                                gsize path_size,
                                gboolean *is_dir_out,
                                gboolean *is_parent_out) {
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pane->tree_view));
    GtkTreeModel *model = NULL;
    GList *rows = gtk_tree_selection_get_selected_rows(sel, &model);
    if (!rows || !model) {
        g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);
        return FALSE;
    }

    GtkTreeIter iter;
    gtk_tree_model_get_iter(model, &iter, rows->data);
    g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);

    gchar *path = NULL;
    gboolean is_dir = FALSE, is_parent = FALSE;
    gtk_tree_model_get(model, &iter,
        COL_PATH, &path, COL_IS_DIR, &is_dir, COL_IS_PARENT, &is_parent, -1);

    if (!path || !path[0]) { g_free(path); return FALSE; }

    g_strlcpy(path_out, path, path_size);
    if (is_dir_out)    *is_dir_out    = is_dir;
    if (is_parent_out) *is_parent_out = is_parent;
    g_free(path);
    return TRUE;
}

static void free_dir_entry(gpointer data) {
    g_free(data);
}

GPtrArray *file_pane_get_selected_entries(FilePane *pane) {
    GPtrArray *arr = g_ptr_array_new_with_free_func(free_dir_entry);
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pane->tree_view));
    GtkTreeModel *model = NULL;
    GList *rows = gtk_tree_selection_get_selected_rows(sel, &model);
    if (!rows || !model) {
        g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);
        return arr;
    }
    for (GList *l = rows; l; l = l->next) {
        GtkTreeIter iter;
        if (!gtk_tree_model_get_iter(model, &iter, l->data)) continue;

        gchar *path = NULL;
        gboolean is_dir = FALSE, is_parent = FALSE;
        gchar *name = NULL;
        gtk_tree_model_get(model, &iter,
            COL_PATH, &path, COL_IS_DIR, &is_dir,
            COL_IS_PARENT, &is_parent, COL_NAME, &name, -1);

        if (!path || !path[0] || is_parent) {
            g_free(path); g_free(name);
            continue;
        }

        FtpDirEntry *e = g_new0(FtpDirEntry, 1);
        g_strlcpy(e->path, path, FTP_MAX_PATH);
        if (name) g_strlcpy(e->name, name, FTP_MAX_NAME);
        e->is_dir = is_dir;
        g_ptr_array_add(arr, e);
        g_free(path); g_free(name);
    }
    g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);
    return arr;
}
